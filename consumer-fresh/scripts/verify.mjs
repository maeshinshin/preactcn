// Installs every registry item into this Fresh app the way a user would, then checks it with Deno: shadcn add, deno check,
// vite build, a server render of each example and (via ../consumer/scripts/browser.mjs) a headless-Firefox mount of each.
// Needs the registry on :8080 (scripts/verify.sh starts it). Writes ../consumer/.verify/fresh/ for src/report.ts.
// DENO is the deno command and may be several words ("nix shell nixpkgs#deno -c deno"); usage: node scripts/verify.mjs <manifest.json>
import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

const deno = process.env.DENO ?? "deno";
const out = resolve("../consumer/.verify/fresh");
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const ansi = /\x1b\[[0-9;]*m/g;
const tail = (text, count = 5) => text.replace(ansi, "").trim().split("\n").slice(-count).join("\n");

const run = (args) => spawnSync(`${deno} ${args}`, { shell: true, encoding: "utf8", maxBuffer: 1 << 28 });
const record = (name, value) => writeFileSync(`${out}/${name}.json`, JSON.stringify(value, null, 2));
// a stage result {ok, error?} from a finished command
const result = (r) => (r.status === 0 ? { ok: true } : { ok: false, error: tail(r.stdout + r.stderr) });

mkdirSync(out, { recursive: true });
for (const dir of ["components", "hooks", "lib", "examples", "shims", "app", "_fresh"]) rmSync(dir, { recursive: true, force: true });

// what the pipeline generates for consumer/, which `@/` resolves to the same paths here
for (const path of ["examples", "components/example.tsx", "components/message-parts.ts", "lib/ai.ts", "shims", "app"])
  cpSync(`../consumer/src/${path}`, path, { recursive: true });
cpSync("../consumer/public/collect-errors.js", "static/collect-errors.js");

const manifest = JSON.parse(readFileSync(process.argv[2], "utf8"));
const items = manifest.items.filter((i) => !i.error).map((i) => `@preactcn/${i.name}`);
const shadcn = readFileSync("../packages/pipeline/upstream/RELEASE", "utf8").trim();
// --no-config: package.json pins one shadcn version, and Deno refuses any other (or a missing node_modules) while it is loaded
// see "install consumer" in verify.sh. Deno also keeps the registry's answer for the localhost package across runs and would install that older build
rmSync(`${JSON.parse(run("info --json").stdout).npmCache}/localhost_8080`, { recursive: true, force: true });
run("remove npm:@preactcn/recharts");
// Deno refuses a version younger than 24 hours, and the daily release check runs the day a release is published
const add = run(`run -A --no-config --minimum-dependency-age 0 npm:${shadcn} add ${items.join(" ")} --overwrite --yes`);
record("add", result(add));
if (add.status !== 0) finish(`add failed: ${tail(add.stderr + add.stdout, 1)}`);
run("install");

const check = run("check");
const errors = [];
let header;
for (const line of (check.stdout + check.stderr).replace(ansi, "").split("\n")) {
  const head = /^(TS\d+) \[ERROR\]: (.*)$/.exec(line);
  if (head) header = { code: head[1], message: head[2] };
  const at = header && /^\s+at file:\/\/(.+):(\d+):(\d+)$/.exec(line);
  if (at) {
    errors.push({ ...header, file: at[1].replace(`${process.cwd()}/`, ""), line: Number(at[2]) });
    header = undefined;
  }
}
if (check.status !== 0 && !errors.length) errors.push({ code: "", file: "", line: 0, message: tail(check.stdout + check.stderr) });
record("check", errors);

const build = run("task build");
record("build", result(build));
const ssr = {};
let browser = "not run";
if (build.status === 0) {
  const port = await new Promise((done) => {
    const probe = createServer().listen(0, () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
  const server = spawn(`${deno} serve -A --port ${port} _fresh/server.js`, { shell: true, detached: true, stdio: "ignore" });
  const base = `http://127.0.0.1:${port}`;
  try {
    const end = Date.now() + 60_000;
    while (Date.now() < end && !(await fetch(base).then((r) => r.ok, () => false))) await sleep(250);
    const names = readdirSync("examples").map((f) => f.replace(/\.tsx$/, ""));
    for (const name of names) {
      const response = await fetch(`${base}/examples/${name}`).catch((e) => ({ status: 0, statusText: e.message }));
      ssr[name] = response.status === 200 ? { ok: true } : { ok: false, error: `HTTP ${response.status} ${response.statusText}` };
    }
    // geckodriver and the Vite imports live in consumer/
    const mount = spawnSync("node", ["scripts/browser.mjs"], {
      cwd: "../consumer",
      env: { ...process.env, TARGET_URL: `${base}/examples/` },
      encoding: "utf8",
    });
    browser = tail(mount.stdout + mount.stderr, 1);
  } finally {
    process.kill(-server.pid);
  }
}
record("ssr", ssr);
const count = (stage) => Object.values(stage).filter((r) => r.ok).length;
finish(`add ok, check ${errors.length} errors, build ${build.status === 0 ? "ok" : "FAILED"}, ssr ${count(ssr)}/${Object.keys(ssr).length}, browser ${browser}`);

function finish(summary) {
  console.log(summary);
  process.exit(0);
}
