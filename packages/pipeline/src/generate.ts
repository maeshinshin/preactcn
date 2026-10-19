import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, posix, relative, resolve } from "node:path"
import { format } from "prettier"
import {
  analyzeSource,
  convertSource,
  type Analysis,
  moduleSpecifiers,
  packageRoot,
  REPLACED_PACKAGES,
  shimFile,
  SHIMMED_PACKAGES,
} from "./convert.ts"

type UpstreamFile = { path: string; content: string; type: string }
type Upstream = {
  name: string
  type: string
  dependencies?: string[]
  registryDependencies?: string[]
  files?: UpstreamFile[]
}

type RegistryFile = { path: string; type: string; target?: string }
type RegistryItem = {
  name: string
  type: string
  dependencies?: string[]
  registryDependencies?: string[]
  files: RegistryFile[]
}

export type ManifestItem = {
  name: string
  kind: "ui" | "hook" | "shim"
  files?: string[]
  error?: string
}
export type ManifestExample = {
  name: string
  item: string | null
  file?: string
  skipped?: string
}
export type Unit = {
  name: string
  kind: "ui" | "hook" | "shim" | "example" | "support"
  files: string[]
  entries: string[]
  examples: string[]
  error?: string
  skippedExamples: { name: string; reason: string }[]
}
export type Manifest = {
  items: ManifestItem[]
  examples: ManifestExample[]
  support: { name: string; file: string; error?: string }[]
  units: Unit[]
}

const root = resolve(import.meta.dirname, "../../..")
const upstreamDir = join(root, "packages/pipeline/upstream/radix-nova")
const registryDir = join(root, "packages/registry")
const consumerDir = join(root, "consumer")
const manifestPath = join(root, "packages/pipeline/.generated/manifest.json")

const NAMESPACE = "@preactcn"
const DROPPED_DEPENDENCIES = new Set(["cn", "radix-ui", "react"])
const CONSUMER_SHIMMED = new Set(["next/image", "next/link"])
// an app-only `@/` import resolves when the consumer carries a stand-in file at the same path
const hasStandIn = (spec: string) =>
  spec.startsWith("@/") &&
  [".ts", ".tsx"].some((ext) => existsSync(join(consumerDir, "src", spec.slice(2) + ext)))

// Examples of ours, written like upstream code (React names, installed component paths): converted like an upstream example into
// consumer/ and copied unchanged to reference/, so the diff stage compares them with the React original like the upstream ones.
const LOCAL_EXAMPLES = [{ name: "chart-more", item: "chart", source: "packages/recharts/test/stress.tsx" }]

// React's lenient prop types hide these upstream slips; Preact's strict ones do not
const TYPE_FIXES: Record<string, [from: string, to: string][]> = {
  kbd: [['KbdGroup({ className, ...props }: ComponentProps<"div">)', 'KbdGroup({ className, ...props }: ComponentProps<"kbd">)']],
  chart: [['ComponentProps<"div"> & {\n    hideLabel', 'ComponentProps<"div"> & {\n    color?: string\n    hideLabel']],
  "input-otp": [["spellCheck={false}", "spellcheck={false}"]],
  input: [
    ["{...props}", "{...(props as any)}"],
    ["function Input(", "// shortcut: Preact 11 types <input> as a union of accessible variants that a rest-props spread cannot satisfy, so the spread is cast; drop the cast with a Preact-native input.\nfunction Input("],
  ],
  "native-select": [
    ["        {...props}\n      />\n      <ChevronDownIcon", "        {...(props as any)}\n      />\n      <ChevronDownIcon"],
    ['import { cn } from "@/lib/utils"\n', 'import { cn } from "@/lib/utils"\nimport { useLayoutEffect, useRef } from "preact/hooks"\n'],
    [
      '  size = "default",\n  ...props\n}: NativeSelectProps) {\n  return (\n    <div\n',
      '  size = "default",\n  defaultValue,\n  ...props\n}: NativeSelectProps) {\n' +
        "  // Preact core has no defaultValue for <select> (preact/compat has): apply it once, like React.\n" +
        "  // shortcut: after mount only, so server-rendered HTML selects the first option until hydration, and a single value only; select the option while rendering when that matters.\n" +
        "  const wrapper = useRef<HTMLDivElement>(null)\n" +
        "  useLayoutEffect(() => {\n" +
        "    if (defaultValue != null && props.value == null) wrapper.current!.querySelector(\"select\")!.value = String(defaultValue)\n" +
        "  }, [])\n" +
        "  return (\n    <div\n      ref={wrapper}\n",
    ],
    ["function NativeSelect(", "// shortcut: Preact 11 types <select> as a union of accessible role variants that a rest-props spread cannot satisfy, so the spread is cast; drop the cast with a Preact-native select.\nfunction NativeSelect("],
  ],
  "code-block-example": [["exec(className ?? \"\")", "exec((className as string | undefined) ?? \"\")"]],
  "dialog-example": [["setTab(e.target.value)", "setTab(e.currentTarget.value)"]],
}

export function applyTypeFixes(name: string, source: string): string {
  return (TYPE_FIXES[name] ?? []).reduce((out, [from, to]) => {
    if (!out.includes(from)) throw new Error(`Type fix for ${name} no longer matches: ${from}`)
    return out.replaceAll(from, to)
  }, source)
}

function readUpstream(): Upstream[] {
  return readdirSync(upstreamDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(upstreamDir, f), "utf8")))
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function clean(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
}

function packageName(spec: string): string {
  return spec.replace(/^(@?[^@]+)@.*$/, "$1")
}

// a package with shimmed subpaths stays a dependency only while the item imports something of it that is not shimmed
const shimmedRoots = new Set([...SHIMMED_PACKAGES].map(packageRoot))

// A Preact package is pinned to the version in its package.json, and that version must be built from the upstream one
// (`3.8.0-preact.1` for `recharts@3.8.0`): the package is generated by `pnpm recharts`, which this file cannot run.
function ownPackageSpec(name: string, upstream: string[]): string {
  const manifest = join(root, "packages", name.replace(/^@[^/]+\//, ""), "package.json")
  const version: string = JSON.parse(readFileSync(manifest, "utf8")).version
  const [original] = [...REPLACED_PACKAGES].find(([, own]) => own === name)!
  const wanted = upstream.find((dep) => packageName(dep) === original)?.slice(original.length + 1)
  if (wanted && !version.startsWith(`${wanted}-preact.`))
    throw new Error(`${original}@${wanted} is upstream's, but ${manifest} is ${version}; run pnpm recharts in packages/pipeline`)
  return `${name}@${version}`
}

export function dependencyList(upstream: string[], packages: string[], icons: boolean): string[] {
  const specs = new Map<string, string>()
  for (const dep of upstream) {
    const name = packageName(dep)
    if (!DROPPED_DEPENDENCIES.has(dep) && !(shimmedRoots.has(name) && !packages.includes(name)) && !REPLACED_PACKAGES.has(name))
      specs.set(name, dep)
  }
  for (const pkg of packages) {
    if ([...REPLACED_PACKAGES.values()].includes(pkg)) specs.set(pkg, ownPackageSpec(pkg, upstream))
    else if (!DROPPED_DEPENDENCIES.has(pkg) && !specs.has(pkg)) specs.set(pkg, pkg)
  }
  if (icons) specs.set("lucide-preact", "lucide-preact")
  return [...specs.values()].sort()
}

// An item may carry more than one file (a hook with the registry:lib file it imports); lib files are generated into src/libs,
// because src/lib holds the hand-written utils.ts, and install to the lib alias like utils does.
const FILE_DIRS: Record<string, [dir: string, installed: string]> = {
  "registry:ui": ["src/ui", "src/components/ui"],
  "registry:hook": ["src/hooks", "src/hooks"],
  "registry:lib": ["src/libs", "src/lib"],
}

function convertUpstream(
  item: Upstream,
  known: Set<string>,
  manifest: Manifest,
  registryItems: RegistryItem[]
): void {
  const kind = item.type === "registry:ui" ? "ui" : "hook"
  const entry: ManifestItem = { name: item.name, kind }
  manifest.items.push(entry)
  try {
    const files = item.files!.map((file) => {
      const dirs = FILE_DIRS[file.type]
      if (!dirs) throw new Error(`Unsupported file type ${file.type} (${file.path})`)
      const base = file.type === "registry:lib" ? posix.basename(file.path) : item.name + posix.extname(file.path)
      return { file, path: `${dirs[0]}/${base}`, installed: `${dirs[1]}/${base}`, analysis: analyzeSource(file.content) }
    })
    const own = new Set(files.filter((f) => f.file.type === "registry:lib").map((f) => posix.basename(f.path).replace(/\.\w+$/, "")))
    for (const { analysis } of files) {
      if (analysis.unresolved.length)
        throw new Error(`Unresolved imports: ${analysis.unresolved.join(", ")}`)
      const missing = analysis.libs.filter((lib) => !own.has(lib))
      if (missing.length) throw new Error(`Imports lib file(s) the item does not carry: ${missing.join(", ")}`)
    }
    for (const { file, path } of files) {
      write(join(registryDir, path), applyTypeFixes(item.name, convertSource(file.content)))
    }
    const all = files.map((f) => f.analysis)
    const union = (pick: (a: Analysis) => string[]) => [...new Set(all.flatMap(pick))]

    const registryDependencies = [
      ...(all.some((a) => a.usesCn) ? [`${NAMESPACE}/utils`] : []),
      ...union((a) => a.radixFamilies).map((f) => `${NAMESPACE}/radix-${f}`),
      ...union((a) => a.shims).map((f) => `${NAMESPACE}/shim-${f}`),
      ...union((a) => a.ui).map((n) => `${NAMESPACE}/${n}`),
      ...union((a) => a.hooks).map((n) => `${NAMESPACE}/${n}`),
    ]
    // upstream also pulls in what its examples import (code-block brings use-highlighted-code), so a user gets the same set
    for (const n of item.registryDependencies ?? []) {
      const dep = `${NAMESPACE}/${n}`
      if (registryDependencies.includes(dep)) continue
      if (known.has(n)) registryDependencies.push(dep)
      else console.warn(`${item.name}: upstream registryDependency ${dep} is not imported and not an item of ours`)
    }
    registryDependencies.sort()

    const dependencies = dependencyList(
      item.dependencies ?? [],
      union((a) => a.packages),
      all.some((a) => a.usesIcons)
    )
    const result: RegistryItem = {
      name: item.name,
      type: item.type,
      ...(dependencies.length ? { dependencies } : {}),
      ...(registryDependencies.length ? { registryDependencies } : {}),
      files: files.map(({ file, path }) => ({ path, type: file.type })),
    }
    entry.files = files.map((f) => f.installed)
    registryItems.push(result)
  } catch (error) {
    entry.error = (error as Error).message
  }
}

// Preact replacements for libraries the upstream code imports. Every top-level file of a root is one registry item; the files it
// reaches through relative imports (any root's internal/ folders) ship with it, other top-level files become registry dependencies.
// Files install to src/lib/<path below src/>, so relative imports keep working in the user's project.
const SHIM_ROOTS = [
  { dir: join(registryDir, "src/radix"), prefix: "radix-" },
  { dir: join(registryDir, "src/shims"), prefix: "shim-" },
]

function shimItems(manifest: Manifest): RegistryItem[] {
  const top = SHIM_ROOTS.flatMap(({ dir }) =>
    existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true })
          .filter((d) => d.isFile() && /\.tsx?$/.test(d.name))
          .map((d) => join(dir, d.name))
          .sort()
      : []
  )
  const topRoot = (file: string) => SHIM_ROOTS.find(({ dir }) => dir === dirname(file))
  const nameOf = (file: string) => `${topRoot(file)!.prefix}${posix.basename(file).replace(/\.tsx?$/, "")}`

  const resolveImport = (from: string, spec: string): string => {
    const base = resolve(dirname(from), spec)
    const found = [`${base}.tsx`, `${base}.ts`].find(existsSync)
    if (!found || !SHIM_ROOTS.some(({ dir }) => !relative(dir, found).startsWith("..")))
      throw new Error(`${from} imports ${spec}, which is not a file under src/radix or src/shims`)
    return found
  }

  return top.map((entry) => {
    // an item carries the internal files it reaches itself; other top-level files are registry dependencies
    const files = new Set([entry])
    const packages = new Set<string>()
    const registryDependencies = new Set<string>()
    const visit = (file: string) => {
      for (const spec of moduleSpecifiers(readFileSync(file, "utf8"))) {
        if (spec.startsWith(".")) {
          const target = resolveImport(file, spec)
          if (topRoot(target)) {
            if (target !== entry) registryDependencies.add(`${NAMESPACE}/${nameOf(target)}`)
          } else if (!files.has(target)) {
            files.add(target)
            visit(target)
          }
        } else if (spec === "@/lib/utils") {
          registryDependencies.add(`${NAMESPACE}/utils`)
        } else if (packageRoot(spec) !== "preact") {
          packages.add(packageRoot(spec))
        }
      }
    }
    visit(entry)

    const dependencies = [...packages].sort()
    const deps = [...registryDependencies].sort()
    const item: RegistryItem = {
      name: nameOf(entry),
      type: "registry:lib",
      ...(dependencies.length ? { dependencies } : {}),
      ...(deps.length ? { registryDependencies: deps } : {}),
      files: [...files].map((file) => {
        const path = relative(registryDir, file).split("\\").join("/")
        return {
          path,
          type: "registry:lib",
          target: `src/lib/${path.slice("src/".length)}`,
        }
      }),
    }
    manifest.items.push({
      name: item.name,
      kind: "shim",
      files: item.files.map((f) => f.target!),
    })
    return item
  })
}

function convertExample(item: Upstream, dest: string): { error?: string } {
  const file = item.files![0]!
  try {
    const analysis = analyzeSource(file.content)
    const unresolved = analysis.unresolved.filter((s) => !CONSUMER_SHIMMED.has(s) && !hasStandIn(s) && !s.startsWith("@/components/ui/"))
    if (unresolved.length)
      return { error: `Unresolved imports: ${unresolved.join(", ")}` }
    write(dest, applyTypeFixes(item.name, convertSource(file.content)))
    return {}
  } catch (error) {
    return { error: (error as Error).message }
  }
}

function buildUnits(manifest: Manifest): Unit[] {
  const units: Unit[] = []
  for (const item of manifest.items) {
    const examples = manifest.examples.filter((e) => e.item === item.name)
    const generated = examples.filter((e) => e.file)
    const files = [...(item.files ?? []), ...generated.map((e) => e.file!)]
    units.push({
      name: item.name,
      kind: item.kind,
      files,
      entries:
        item.kind === "ui" && generated.length
          ? generated.map((e) => e.file!)
          : (item.files ?? []),
      examples: generated.map((e) => e.name),
      ...(item.error ? { error: item.error } : {}),
      skippedExamples: examples
        .filter((e) => e.skipped)
        .map((e) => ({ name: e.name, reason: e.skipped! })),
    })
  }
  for (const e of manifest.examples.filter((e) => e.item === null)) {
    units.push({
      name: e.name,
      kind: "example",
      files: e.file ? [e.file] : [],
      entries: e.file ? [e.file] : [],
      examples: e.file ? [e.name] : [],
      ...(e.skipped ? { error: e.skipped } : {}),
      skippedExamples: [],
    })
  }
  for (const s of manifest.support) {
    units.push({
      name: s.name,
      kind: "support",
      files: [s.file],
      entries: [s.file],
      examples: [],
      ...(s.error ? { error: s.error } : {}),
      skippedExamples: [],
    })
  }
  return units
}

async function main(): Promise<void> {
  const upstream = readUpstream()
  const manifest: Manifest = { items: [], examples: [], support: [], units: [] }
  const registryItems: RegistryItem[] = []

  clean(join(registryDir, "src/ui"))
  clean(join(registryDir, "src/hooks"))
  clean(join(registryDir, "src/libs"))
  clean(join(consumerDir, "src/examples"))

  const ui = upstream.filter((i) => i.type === "registry:ui")
  const hooks = upstream.filter((i) => i.type === "registry:hook")
  const known = new Set([...hooks, ...ui].map((i) => i.name))
  for (const item of [...hooks, ...ui]) convertUpstream(item, known, manifest, registryItems)

  const uiNames = new Set(ui.map((i) => i.name))
  for (const item of upstream.filter((i) => i.type === "registry:example")) {
    const owner = item.name.replace(/-example$/, "")
    const entry: ManifestExample = {
      name: item.name,
      item: uiNames.has(owner)
        ? owner
        : owner.startsWith("sidebar-")
          ? "sidebar"
          : null,
    }
    const dest = join(consumerDir, "src/examples", `${item.name}.tsx`)
    const { error } = convertExample(item, dest)
    if (error) entry.skipped = error
    else entry.file = relative(consumerDir, dest)
    manifest.examples.push(entry)
  }

  for (const { name, item, source } of LOCAL_EXAMPLES) {
    const content = readFileSync(join(root, source), "utf8")
    const dest = join(consumerDir, "src/examples", `${name}.tsx`)
    const entry: ManifestExample = { name, item }
    const { error } = convertExample({ name, type: "registry:example", files: [{ path: source, content, type: "registry:example" }] }, dest)
    if (error) entry.skipped = error
    else {
      entry.file = relative(consumerDir, dest)
      write(join(root, "reference/src/components", `${name}.tsx`), content)
    }
    manifest.examples.push(entry)
  }

  const example = upstream.find((i) => i.name === "example")!
  const exampleDest = join(consumerDir, "src/components/example.tsx")
  const exampleResult = convertExample(example, exampleDest)
  manifest.support.push({
    name: "example",
    file: relative(consumerDir, exampleDest),
    ...(exampleResult.error ? { error: exampleResult.error } : {}),
  })

  const utils: RegistryItem = {
    name: "utils",
    type: "registry:lib",
    dependencies: ["clsx", "tailwind-merge"],
    files: [{ path: "src/lib/utils.ts", type: "registry:lib" }],
  }
  const shims = shimItems(manifest)
  for (const pkg of SHIMMED_PACKAGES)
    if (!shims.some((s) => s.name === `shim-${shimFile(pkg)}`))
      throw new Error(`"${pkg}" is in SHIMMED_PACKAGES but packages/registry/src/shims/${shimFile(pkg)}.ts(x) does not exist`)
  const byName = (a: RegistryItem, b: RegistryItem) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  const items = [
    utils,
    ...shims,
    ...registryItems.filter((i) => i.type === "registry:hook").sort(byName),
    ...registryItems.filter((i) => i.type === "registry:ui").sort(byName),
  ]
  const registry = {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "preactcn",
    homepage: process.env.REGISTRY_HOMEPAGE ?? "http://localhost:8080",
    items,
  }
  write(
    join(registryDir, "registry.json"),
    await format(JSON.stringify(registry), { parser: "json" })
  )
  manifest.units = buildUnits(manifest)
  write(manifestPath, JSON.stringify(manifest, null, 2) + "\n")

  const failed = manifest.items.filter((i) => i.error)
  const skipped = manifest.examples.filter((e) => e.skipped)
  console.log(
    `registry items: ${items.length} (${shims.length} shims), ` +
      `failed: ${failed.length}, examples: ${manifest.examples.length - skipped.length}/${manifest.examples.length}`
  )
  for (const f of failed) console.log(`  FAIL ${f.name}: ${f.error}`)
  for (const s of skipped) console.log(`  SKIP ${s.name}: ${s.skipped}`)
}

if (process.argv[1] === import.meta.filename) await main()
