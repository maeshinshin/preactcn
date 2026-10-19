#!/usr/bin/env bash
# recharts package (convert, build, laid out as an npm registry entry) -> generate -> registry build -> serve -> install consumer -> shadcn add
#   -> (tsc -> vite build -> SSR smoke -> browser smoke -> vite dev mount of the chart examples) per Preact version
#   -> Fresh app (shadcn add, deno check, build, server render, browser; needs deno or nix)
#   -> diff against the React original in reference/ (DOM and screenshots, first Preact version) -> report
# PREACT=11 limits the last stages to Preact 11 (alias dependency preact11), PREACT=10 to Preact 10; default is both.
# The Fresh stage runs on Preact 10 only, because Fresh pins it, so PREACT=11 skips it
# CI=true (GitHub sets it) or STRICT=1: a stage skipped for a missing tool (deno/nix, reference install) fails the run
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
SHADCN="$(cat "$ROOT/packages/pipeline/upstream/RELEASE")" || exit 1
PORT=8080
VERIFY="$ROOT/consumer/.verify"
MANIFEST="$ROOT/packages/pipeline/.generated/manifest.json"
VERSIONS="${PREACT:-10 11}"
for v in $VERSIONS; do
  [ "$v" = 10 ] || [ "$v" = 11 ] || { echo "PREACT must be 10, 11 or unset, got '$PREACT'" >&2; exit 1; }
done

for tool in firefox geckodriver; do
  command -v "$tool" >/dev/null || { echo "$tool is not installed or not on PATH; the browser stage needs headless Firefox and geckodriver" >&2; exit 1; }
done

SERVER_PID=""
trap '[ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null' EXIT

step() { printf '\n== %s\n' "$*"; }
# per-row results come from the JSON each stage writes; these are the stages that crashed, wrote nothing, or failed outside the rows (a test file of its own)
FAILED=""
stage_failed() { FAILED="$FAILED  $*"$'\n'; echo "  STAGE FAILED: $*"; }
SKIPPED=""
# skip <stage> <why>: reported, and a failure in strict mode
skip() {
  echo "  skipped: $2"
  if [ "${CI:-}" = true ] || [ "${STRICT:-}" = 1 ]; then stage_failed "$1 skipped ($2), every stage is required with CI=true or STRICT=1"
  else SKIPPED="$SKIPPED  $1 ($2)"$'\n'
  fi
}

rm -rf "$VERIFY"
mkdir -p "$VERIFY/add"

# chart depends on @preactcn/recharts@<version>, which is not on npm yet: the registry server below also answers as an npm registry for that
# one package (the .npmrc of consumer/ and consumer-fresh/ points @preactcn at it), so `shadcn add` installs it as it would from npm
step "recharts package: convert, build, pack"
(cd "$ROOT/packages/pipeline" && pnpm --silent recharts) || exit 1
rm -rf "$ROOT/packages/registry/dist/npm"
(cd "$ROOT/packages/recharts" && pnpm --silent build && pnpm --silent run pack:local "http://localhost:$PORT/npm" "$ROOT/packages/registry/dist/npm") || exit 1

step "generate"
(cd "$ROOT/packages/pipeline" && pnpm --silent generate) || exit 1

step "registry build"
(cd "$ROOT/packages/registry" && rm -rf dist/r && pnpm dlx "$SHADCN" build -o dist/r) || exit 1

step "serve registry on :$PORT"
python3 -m http.server "$PORT" -d "$ROOT/packages/registry/dist" >"$VERIFY/server.log" 2>&1 &
SERVER_PID=$!
sleep 1
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  SERVER_PID=""
  echo "port $PORT is taken (another verify run?):" >&2
  tail -1 "$VERIFY/server.log" >&2
  exit 1
fi

# @preactcn/recharts is not on npm yet, so the version and tarball integrity that package.json and the lockfile record for it hold only for the
# build that wrote them: forget the pin here (consumer-fresh/scripts/verify.mjs does the same) and let `shadcn add chart` pin the tarball packed above.
# That is why consumer/ is not installed in CI's install step
step "install consumer"
(cd "$ROOT/consumer" && { pnpm remove @preactcn/recharts >/dev/null 2>&1; pnpm install --frozen-lockfile; }) || exit 1

step "shadcn add"
rm -rf "$ROOT/consumer/src/components/ui" "$ROOT/consumer/src/hooks" "$ROOT/consumer/src/lib/radix" "$ROOT/consumer/src/lib/shims" "$ROOT/consumer/src/lib/highlighter.tsx"
ITEMS=$(node -e '
  const m = require(process.argv[1]);
  console.log(m.items.filter((i) => !i.error).map((i) => i.name).join("\n"));
' "$MANIFEST")
while read -r item; do
  [ -z "$item" ] && continue
  (cd "$ROOT/consumer" && pnpm dlx "$SHADCN" add "@preactcn/$item" --overwrite --yes) \
    >"$VERIFY/add/$item.log" 2>&1
  echo $? >"$VERIFY/add/$item.status"
  printf '  %-24s %s\n' "$item" "$([ "$(cat "$VERIFY/add/$item.status")" = 0 ] && echo ok || echo FAILED)"
done <<<"$ITEMS"

for v in $VERSIONS; do
  step "preact $v: tsc, vite build per component, ssr smoke, browser smoke"
  mkdir -p "$VERIFY/$v"
  tsconfig=tsconfig.app.json
  [ "$v" = 11 ] && tsconfig=tsconfig.preact11.json
  (cd "$ROOT/consumer" && pnpm exec tsc -p "$tsconfig" --noEmit --pretty false) >"$VERIFY/$v/tsc.log" 2>&1
  tsc_status=$?
  tsc_errors=$(grep -c ' error TS' "$VERIFY/$v/tsc.log")
  echo "  tsc: $tsc_errors errors"
  [ "$tsc_status" = 0 ] || [ "$tsc_errors" != 0 ] || stage_failed "tsc on preact $v exited $tsc_status without an error line ($VERIFY/$v/tsc.log)"
  (cd "$ROOT/consumer" && PREACT=$v node scripts/build-units.mjs "$MANIFEST") >"$VERIFY/$v/build.log" 2>&1 || { tail -5 "$VERIFY/$v/build.log"; stage_failed "build on preact $v"; }
  (cd "$ROOT/consumer" && PREACT=$v pnpm exec vitest run --reporter=json --outputFile="$VERIFY/$v/ssr.json") >"$VERIFY/$v/ssr.log" 2>&1
  ssr_status=$?
  echo "  ssr exit $ssr_status"
  [ "$ssr_status" = 0 ] || stage_failed "vitest on preact $v exited $ssr_status ($VERIFY/$v/ssr.log)"
  (cd "$ROOT/consumer" && PREACT=$v node scripts/browser.mjs) >"$VERIFY/$v/browser.log" 2>&1 || stage_failed "browser on preact $v ($VERIFY/$v/browser.log)"
  echo "  browser: $(tail -1 "$VERIFY/$v/browser.log")"
  # `vite dev` is not a production build: without the immutableCheck patch (src/recharts.ts) recharts' development build hangs the page on a
  # chart, which only this stage sees
  (cd "$ROOT/consumer" && PREACT=$v DEV=1 ONLY=chart-example,chart-more timeout 120 node scripts/browser.mjs) >"$VERIFY/$v/dev.log" 2>&1 || stage_failed "vite dev on preact $v ($VERIFY/$v/dev.log)"
  echo "  dev: $(tail -1 "$VERIFY/$v/dev.log")"
done

step "fresh: shadcn add, deno check, vite build, server render, browser smoke"
DENO=""
if command -v deno >/dev/null; then DENO=deno
elif command -v nix >/dev/null; then DENO="nix shell nixpkgs#deno -c deno"
fi
if [[ " $VERSIONS " != *" 10 "* ]]; then
  echo "  skipped: Fresh pins Preact 10 and PREACT=${PREACT:-}"
  SKIPPED="$SKIPPED  fresh (PREACT=${PREACT:-})"$'\n'
elif [ -z "$DENO" ]; then
  skip fresh "neither deno nor nix is installed, so the fresh column stays empty"
else
  mkdir -p "$VERIFY/fresh"
  (cd "$ROOT/consumer-fresh" && DENO="$DENO" node scripts/verify.mjs "$MANIFEST") >"$VERIFY/fresh/verify.log" 2>&1 || stage_failed "fresh ($VERIFY/fresh/verify.log)"
  echo "  fresh: $(tail -1 "$VERIFY/fresh/verify.log")"
fi

step "diff: React reference vs Preact consumer, DOM and screenshots (preact ${VERSIONS%% *})"
if [ ! -d "$ROOT/reference/node_modules" ]; then
  skip diff "run pnpm install in reference/ (the React twin), so the dom and pixels columns stay empty"
else
  (cd "$ROOT/reference" && pnpm exec vite build --outDir "$VERIFY/reference-dist" --emptyOutDir) >"$VERIFY/diff.log" 2>&1 &&
    (cd "$ROOT/consumer" && node scripts/diff.mjs "$VERIFY/reference-dist" "$VERIFY/${VERSIONS%% *}/browser-dist") >>"$VERIFY/diff.log" 2>&1
  diff_status=$?
  echo "  diff exit $diff_status ($VERIFY/diff/ holds screenshots and DOM diffs)"
  [ "$diff_status" = 0 ] || stage_failed "diff ($VERIFY/diff.log)"
fi

step "report"
(cd "$ROOT/packages/pipeline" && pnpm --silent tsx src/report.ts)
report_status=$?

# last lines: the verdict, and the exit code carries it (a failing row, a stage that failed or did not run, or a report that did not finish)
echo
[ -z "$SKIPPED" ] || printf 'skipped stages (their columns are empty):\n%s' "$SKIPPED"
[ -z "$FAILED" ] || printf 'stages that failed or did not run:\n%s' "$FAILED"
if [ "$report_status" != 0 ] || [ -n "$FAILED" ]; then
  echo "verify.sh: FAIL (report exit $report_status)"
  exit 1
fi
echo "verify.sh: PASS"
