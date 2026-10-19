import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import type { Manifest, Unit } from "./generate.ts"
import { movedLines, stageKeys, summaryKeys, tally, type Status } from "./summary.ts"

type Row = {
  name: string
  kind: Unit["kind"]
  // generate and add do not depend on the Preact version; tsc, build, ssr and browser get a version suffix (tsc10, ssr11)
  stages: Record<string, Status>
  errors: Record<string, string[]>
  skippedExamples: Unit["skippedExamples"]
}
type Assertion = { title: string; status: string; failureMessages?: string[] }
type Results = {
  tscErrors: Map<string, string[]>
  unattributed: string[]
  build: Record<string, { ok: boolean; error?: string }>
  ssr: Map<string, Assertion>
  browser: Record<string, { ok: boolean; error?: string }>
}

const root = resolve(import.meta.dirname, "../../..")
const consumer = join(root, "consumer")
const verify = join(consumer, ".verify")
const manifest: Manifest = JSON.parse(
  readFileSync(join(root, "packages/pipeline/.generated/manifest.json"), "utf8")
)
const versions = ["10", "11"].filter((v) => existsSync(join(verify, v)))

function readJson<T>(path: string): T | undefined {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined
}

// shim units share the internal files they carry, so one file can have several owners
function owners(file: string): Unit[] {
  return manifest.units.filter((u) => u.files.includes(file))
}

// consumer-fresh/scripts/verify.mjs: one shadcn add and one Fresh build for every unit, deno check errors per file
type FreshStage = { ok: boolean; error?: string }
type FreshCheck = { code: string; file: string; line: number; message: string }
function loadFresh() {
  const dir = join(verify, "fresh")
  if (!existsSync(dir)) return undefined
  return {
    add: readJson<FreshStage>(join(dir, "add.json")),
    build: readJson<FreshStage>(join(dir, "build.json")),
    check: readJson<FreshCheck[]>(join(dir, "check.json")) ?? [],
    ssr: readJson<Record<string, FreshStage>>(join(dir, "ssr.json")) ?? {},
    browser: readJson<Record<string, FreshStage>>(join(dir, "browser.json")) ?? {},
  }
}
const fresh = loadFresh()

// consumer/scripts/diff.mjs: React original (reference/) against the first Preact version, one entry per example
type DiffState = "initial" | "click"
type DiffResult = {
  errors: { reference: string[]; preact: string[] }
  dom: Partial<Record<DiffState, string[]>>
  pixels: Partial<Record<DiffState, { ratio: number; size: number[] }>>
}
const diff = readJson<Record<string, DiffResult>>(join(verify, "diff", "diff.json"))
// Both sides render in the same Firefox, so identical layouts give identical pixels (all screenshot pairs are exactly equal today).
// A fraction of 0.001% (about 15 pixels of a 1000x1500 screenshot) only absorbs a stray antialiased pixel on another machine. It stays
// this small on purpose: 0.1% passed a focus ring on a tab trigger (tabs-example) that was a real divergence.
const PIXEL_RATIO = 0.00001

// Differences that were investigated and are not defects of the port; every line of a diff that matches one is counted as known
// instead of failing the dom column. Lines are the indentation-free, whitespace-collapsed output of diff.mjs ("~ tag: - React + Preact").
// `examples` limits an entry to those examples; `moved` limits it to lines that only changed place (see movedLines). Add an entry only
// with a cause that is checked, never to turn a column green.
const KNOWN: { reason: string; line: RegExp; examples?: string[]; moved?: true }[] = [
  // shim design, see src/radix/internal/modal-layer.ts: `inert` replaces aria-hidden and the focus guards, an inline overflow replaces data-scroll-locked
  { reason: "modal layer hides the page with inert, not aria-hidden", line: /^~ \w+: - aria-hidden="true" data-aria-hidden="true" \+ inert=""$/ },
  // the aria-hidden package also marks the overlay, which the shim keeps out of the layer, and items the page made inert itself (questionnaire's inactive items), which it skips
  { reason: "modal layer marks neither the dialog overlay nor elements that are already inert", line: /^~ (div|fieldset): - aria-hidden="true" data-aria-hidden="true" \+$/ },
  { reason: "modal layer renders no focus guard spans", line: /^- span (aria-hidden="true" data-aria-hidden="true" )?data-radix-focus-guard="" tabindex="0"$/ },
  { reason: "modal layer locks scroll with an inline style, not data-scroll-locked", line: /^~ body: - data-scroll-locked="1" \+$/ },
  // shim shortcut documented in src/radix/menubar.tsx: no group tab stop, every trigger is tabbable until one has focus
  { reason: "menubar has no roving tab stop", line: /^~ (div: - data-orientation="horizontal" tabindex="0" \+|button: - data-orientation="horizontal"( tabindex="-1")?( \+ tabindex="0"| \+))$/, examples: ["menubar-example"] },
  // the shim's select mirrors only the selected value into its native <select>; Radix mirrors every item, which it renders while closed
  { reason: "select's native mirror lists no options", line: /^(- option value="[^"]*"|\+ option value=""|- "[^"]+")$/, examples: ["component-example", "input-example"] },
  // cmdk's setState("value") reads the selected item's id from the DOM before that item re-rendered as selected, so cmdk 1.1.1 omits aria-activedescendant
  // at mount and lags a selection behind; the shim (src/shims/cmdk.tsx) reports the id once the item renders selected
  { reason: "cmdk omits aria-activedescendant at mount, the shim sets it from mount", line: /^~ (input|div): - \+ aria-activedescendant="#\d+"$/, examples: ["command-example"] },
  // Base UI's FloatingFocusManager and FloatingPortal for a non-modal popup (the input inside it, the example's first trigger); the shim
  // (src/shims/internal/base-ui-combobox.tsx) renders the same focus guards but no portal id and no aria-owns span. Tab and Escape were checked
  // in Firefox against the React original, Shift+Tab by unit test: they land on the same elements. Screen reader users do not get the portaled popup placed after
  // the trigger (aria-owns).
  { reason: "Base UI marks the page outside an open popup with data-base-ui-inert, which nothing in Base UI or shadcn reads", line: /^~ div: - data-base-ui-inert="" \+$/, examples: ["combobox-example"] },
  { reason: "non-modal Base UI popup is linked to the trigger's place in the accessibility tree with aria-owns and an id on the portal node; the shim has neither", line: /^(- span aria-owns="#\d+"|~ div: - id="#\d+" \+)$/, examples: ["combobox-example"] },
  // the portal node's id is numbered before the ids inside the popup, so React's are one higher than the shim's; React's list also carries
  // aria-activedescendant (floating-ui's list navigation), which nothing reads: focus never rests on the list, the popup hands it to the input
  { reason: "id numbering shifted by the portal node's id", line: /^~ (input|div): - (aria-controls="#\d+" id="base-ui-#\d+"|(aria-activedescendant="base-ui-#\d+-\d+" )?id="#\d+") \+ (aria-controls="#\d+" id="base-ui-#\d+"|id="#\d+")$/, examples: ["combobox-example"] },
  // the calendar shim hands Chevron `disabled` at the first or last month, as react-day-picker does, and shadcn's Chevron spreads it onto the icon's svg;
  // React writes a true boolean attribute as disabled="", Preact core as disabled="true" (checked in Firefox), and an svg ignores both
  { reason: "react-day-picker: disabled on svg is written disabled=\"true\"", line: /^~ svg: - disabled="" \+ disabled="true"$/, examples: ["calendar-example"] },
  // recharts draws tooltip, legend and the z-index layers' labels through portals and the portal appends its content when it commits. React
  // commits it before the chart's svg (the tooltip wrapper is the first child of .recharts-wrapper), Preact in the pass that inserts the svg
  // (observed with a MutationObserver in both builds), so siblings come in another order; paint order changes only where items overlap
  { reason: "recharts portal content comes in another sibling order", line: /^[-+] /, moved: true, examples: ["chart-example", "chart-more"] },
  // the hidden span that recharts measures all text with keeps the last string it measured, and the 11 charts of the page measure in another
  // order (a cache skips repeated strings): React's span ends on "80", Preact's on a Funnel label
  { reason: "recharts' measurement span keeps the string it measured last", line: /^(- "80"|\+ "c")$/, examples: ["chart-more"] },
]

function load(version: string): Results {
  const dir = join(verify, version)
  const tscErrors = new Map<string, string[]>()
  const unattributed: string[] = []
  const tscLog = existsSync(join(dir, "tsc.log"))
    ? readFileSync(join(dir, "tsc.log"), "utf8")
    : ""
  for (const text of tscLog.split("\n")) {
    const m = /^(src\/[^(]+)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(text)
    if (!m) continue
    const units = owners(m[1]!)
    const message = `${m[1]}:${m[2]} ${m[4]} ${m[5]}`
    if (!units.length) unattributed.push(message)
    for (const unit of units)
      tscErrors.set(unit.name, [...(tscErrors.get(unit.name) ?? []), message])
  }

  const ssr = new Map<string, Assertion>()
  const report = readJson<{ testResults: { assertionResults: Assertion[] }[] }>(
    join(dir, "ssr.json")
  )
  for (const file of report?.testResults ?? [])
    for (const a of file.assertionResults) ssr.set(a.title, a)

  return {
    tscErrors,
    unattributed,
    build: readJson(join(dir, "build.json")) ?? {},
    ssr,
    browser: readJson(join(dir, "browser.json")) ?? {},
  }
}
const results = Object.fromEntries(versions.map((v) => [v, load(v)]))

function addResult(name: string): { ok: boolean; log: string } | undefined {
  const status = join(verify, "add", `${name}.status`)
  if (!existsSync(status)) return undefined
  const log = join(verify, "add", `${name}.log`)
  return {
    ok: readFileSync(status, "utf8").trim() === "0",
    log: existsSync(log) ? readFileSync(log, "utf8") : "",
  }
}

// a missing sibling component or shim, not a defect of this component
const blocked = /was not found|Could not load|Cannot find (package|module)/

function firstLines(text: string, count = 2): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, count)
}

const knownCounts = new Map<string, { lines: number; examples: Set<string> }>()
const rows: Row[] = manifest.units.map((unit) => {
  const row: Row = {
    name: unit.name,
    kind: unit.kind,
    stages: { generate: "pass", add: "n/a" },
    errors: {},
    skippedExamples: unit.skippedExamples,
  }

  if (unit.error) {
    row.stages.generate = "fail"
    row.errors.generate = [unit.error]
    return row
  }

  if (unit.kind === "ui" || unit.kind === "hook" || unit.kind === "shim") {
    const add = addResult(unit.name)
    if (add) {
      row.stages.add = add.ok ? "pass" : blocked.test(add.log) ? "blocked" : "fail"
      if (!add.ok) {
        const message = /Message:\n([^\n]+)/.exec(add.log)?.[1]
        row.errors.add = message ? [message] : firstLines(add.log, 3)
      }
    }
  }

  for (const v of versions) {
    const r = results[v]!
    const errors = r.tscErrors.get(unit.name) ?? []
    row.stages[`tsc${v}`] = !errors.length
      ? "pass"
      : errors.every((e) => / TS(2307|7006) /.test(e))
        ? "blocked"
        : "fail"
    if (errors.length) row.errors[`tsc${v}`] = errors.slice(0, 5)

    const built = r.build[unit.name]
    if (built) {
      row.stages[`build${v}`] = built.ok
        ? "pass"
        : blocked.test(built.error ?? "")
          ? "blocked"
          : "fail"
      if (!built.ok)
        row.errors[`build${v}`] = firstLines(
          (built.error ?? "").replace(/^Build failed.*\n/, "")
        )
    } else {
      row.stages[`build${v}`] = "fail"
      row.errors[`build${v}`] = ["not built"]
    }

    row.stages[`ssr${v}`] = "n/a"
    if (unit.examples.length) {
      const failed = unit.examples
        .map((e) => ({ e, a: r.ssr.get(e) }))
        .filter(({ a }) => !a || a.status !== "passed")
      row.stages[`ssr${v}`] = !failed.length
        ? "pass"
        : failed.every(({ a }) => blocked.test(a?.failureMessages?.[0] ?? ""))
          ? "blocked"
          : "fail"
      if (failed.length)
        row.errors[`ssr${v}`] = failed.slice(0, 3).map(({ e, a }) =>
          `${e}: ${firstLines(a?.failureMessages?.[0] ?? "not run", 1)[0]}`
        )
    }

    row.stages[`browser${v}`] = "n/a"
    if (unit.examples.length) {
      const failed = unit.examples
        .map((e) => ({ e, b: r.browser[e] }))
        .filter(({ b }) => !b?.ok)
      row.stages[`browser${v}`] = failed.length ? "fail" : "pass"
      if (failed.length)
        row.errors[`browser${v}`] = failed
          .slice(0, 3)
          .map(({ e, b }) => `${e}: ${b?.error ?? "not run"}`)
    }
  }

  if (fresh) {
    const errors: string[] = []
    if (!fresh.add?.ok) errors.push(`add: ${firstLines(fresh.add?.error ?? "not run", 1)[0]}`)
    if (!fresh.build?.ok) errors.push(`build: ${firstLines(fresh.build?.error ?? "not run", 1)[0]}`)
    for (const e of fresh.check)
      if (owners(`src/${e.file}`).includes(unit))
        errors.push(`${e.file}:${e.line} ${e.code} ${e.message}`)
    for (const name of unit.examples) {
      for (const stage of ["ssr", "browser"] as const) {
        const r = fresh[stage][name]
        if (!r?.ok) errors.push(`${stage} ${name}: ${r?.error ?? "not run"}`)
      }
    }
    row.stages.fresh = errors.length ? "fail" : "pass"
    if (errors.length) row.errors.fresh = errors.slice(0, 5)
  }

  if (diff && unit.examples.length) {
    const dom: string[] = []
    const pixels: string[] = []
    for (const name of unit.examples) {
      const result = diff[name]
      if (!result?.dom.initial) {
        const why = result ? [...result.errors.reference, ...result.errors.preact][0] : "not compared"
        dom.push(`${name}: ${firstLines(why ?? "not captured", 1)[0]}`)
        continue
      }
      for (const state of ["initial", "click"] as const) {
        const all = result.dom[state] ?? []
        const moved = movedLines(all)
        const lines = all.filter((line, i) => {
          const text = line.trim().replace(/\s+/g, " ")
          const known = KNOWN.find((k) => k.line.test(text) && (!k.moved || moved.has(i)) && (!k.examples || k.examples.includes(name)))
          if (known) {
            const entry = knownCounts.get(known.reason) ?? { lines: 0, examples: new Set<string>() }
            entry.lines++
            entry.examples.add(name)
            knownCounts.set(known.reason, entry)
          }
          return !known
        })
        if (lines.length) dom.push(`${name} ${state}: ${lines.length} lines, first ${lines[0]!.replace(/\s+/g, " ")}`)
        const ratio = result.pixels[state]?.ratio ?? 0
        if (ratio > PIXEL_RATIO) pixels.push(`${name} ${state}: ${(ratio * 100).toFixed(3)}% of pixels differ`)
      }
    }
    row.stages.dom = dom.length ? "fail" : "pass"
    row.stages.pixels = pixels.length ? "fail" : "pass"
    if (dom.length) row.errors.dom = dom.slice(0, 5)
    if (pixels.length) row.errors.pixels = pixels.slice(0, 5)
  }
  return row
})

const order: Record<Unit["kind"], number> = {
  shim: 0,
  support: 1,
  hook: 2,
  ui: 3,
  example: 4,
}
rows.sort((a, b) => order[a.kind] - order[b.kind] || a.name.localeCompare(b.name))

const mark = (s: Status | undefined) =>
  s === "pass" ? "PASS" : s === "fail" ? "FAIL" : s === "blocked" ? "BLOCKED" : "-"
const columns = [
  "generate",
  "add",
  ...versions.flatMap(stageKeys),
  ...(fresh ? ["fresh"] : []),
  ...(diff ? ["dom", "pixels"] : []),
]
const width = Math.max(...rows.map((r) => r.name.length))
console.log(
  `${"component".padEnd(width)}  ${"kind".padEnd(7)}  ${columns.map((c) => c.padEnd(10)).join("")}note`
)
for (const row of rows) {
  const firstError = columns.map((c) => row.errors[c]?.[0]).find(Boolean) ?? ""
  console.log(
    `${row.name.padEnd(width)}  ${row.kind.padEnd(7)}  ${columns
      .map((c) => mark(row.stages[c]).padEnd(10))
      .join("")}${firstError.slice(0, 110)}`
  )
}

const summary: Record<string, ReturnType<typeof tally>> = {}
console.log("")
for (const v of [...versions, ...(fresh ? ["fresh"] : [])]) {
  summary[v] = tally(rows, summaryKeys(v, diff ? versions[0] : undefined))
  console.log(
    `${v === "fresh" ? "Fresh (Preact 10)" : `Preact ${v}`}: ${summary[v]!.passing}/${rows.length} pass all stages, ${summary[v]!.blocked.length} blocked by a missing component or shim, ${summary[v]!.failing.length} fail`
  )
}
if (diff) {
  const compared = rows.filter((r) => r.stages.dom)
  console.log(
    `Diff against React (Preact ${versions[0]}): ${compared.filter((r) => r.stages.dom === "pass").length}/${compared.length} components with identical DOM, ${compared.filter((r) => r.stages.pixels === "pass").length}/${compared.length} with pixels within ${PIXEL_RATIO * 100}%`
  )
  for (const [reason, { lines, examples }] of knownCounts)
    console.log(`  known, not counted: ${reason} (${lines} lines in ${examples.size} examples)`)
}
for (const row of rows)
  for (const s of row.skippedExamples)
    console.log(`skipped example ${s.name}: ${s.reason}`)
for (const v of versions) {
  const { unattributed } = results[v]!
  if (!unattributed.length) continue
  console.log(`\nunattributed tsc errors on Preact ${v} (${unattributed.length}):`)
  for (const e of unattributed.slice(0, 10)) console.log(`  ${e}`)
}

const unattributedFresh = fresh
  ? fresh.check
      .filter((e) => !owners(`src/${e.file}`).length)
      .map((e) => `${e.file}:${e.line} ${e.code} ${e.message}`)
  : []
if (unattributedFresh.length) {
  console.log(`\nunattributed deno check errors in consumer-fresh (${unattributedFresh.length}):`)
  for (const e of unattributedFresh.slice(0, 10)) console.log(`  ${e}`)
}

const { fresh: freshSummary, ...preactSummary } = summary
writeFileSync(
  join(consumer, "verify-report.json"),
  JSON.stringify(
    {
      summary: {
        total: rows.length,
        preact: preactSummary,
        ...(freshSummary ? { fresh: freshSummary } : {}),
        ...(diff
          ? {
              diff: {
                preact: versions[0],
                pixelRatio: PIXEL_RATIO,
                known: [...knownCounts].map(([reason, { lines, examples }]) => ({ reason, lines, examples: [...examples].sort() })),
                domDiffering: rows.filter((r) => r.stages.dom === "fail").map((r) => r.name),
                pixelsDiffering: rows.filter((r) => r.stages.pixels === "fail").map((r) => r.name),
              },
            }
          : {}),
      },
      components: rows,
      unattributedTscErrors: {
        ...Object.fromEntries(versions.map((v) => [v, results[v]!.unattributed])),
        ...(fresh ? { fresh: unattributedFresh } : {}),
      },
    },
    null,
    2
  ) + "\n"
)

// the verdict counts every column of every row, whichever summary line it belongs to; BLOCKED is not a pass
const overall = tally(rows, columns)
const unattributedTotal = Object.values(results).reduce((n, r) => n + r.unattributed.length, unattributedFresh.length)
const notPassing = new Set([...overall.failing, ...overall.blocked])
console.log("")
for (const row of rows.filter((r) => notPassing.has(r.name)))
  console.log(`  ${row.name}: ${columns.filter((c) => row.stages[c] === "fail" || row.stages[c] === "blocked").join(", ")}`)
const ok = !notPassing.size && !unattributedTotal
console.log(
  ok
    ? `RESULT: PASS (${rows.length}/${rows.length} rows pass every column)`
    : `RESULT: FAIL (${overall.failing.length} rows fail, ${overall.blocked.length} blocked, ${unattributedTotal} unattributed errors)`
)
process.exitCode = ok ? 0 : 1
