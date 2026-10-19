// Usage: pnpm recharts [version]   (default: the recharts version that upstream/radix-nova/chart.json depends on)
// Converts the source of the recharts GitHub tag to Preact and writes it to packages/recharts/src. Apart from PATCHES the conversion
// changes no recharts code: React imports go to packages/recharts/runtime/adapter.ts, every .tsx file gets the package-local jsx
// runtime, and a React API the adapter does not export makes it throw, so a recharts release that needs more fails here and not in a browser.
// Then `pnpm build` in packages/recharts compiles src to dist. The tag is cached in .generated/recharts/<version>.
import { execFileSync } from "node:child_process"
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { Node, Project, SyntaxKind, type SourceFile } from "ts-morph"

const root = resolve(import.meta.dirname, "../../..")
const packageDir = join(root, "packages/recharts")
const cacheDir = join(root, "packages/pipeline/.generated/recharts")

// Bump when runtime/ or this converter changes the package for a recharts version that stays the same.
const REVISION = 1
// Packages the adapter replaces. Any other React package is a dependency the adapter knows nothing about.
const REPLACED = new Set(["react", "react-dom", "react-is", "react-redux", "use-sync-external-store"])
const REACT_BOUND = new RegExp(`^(${[...REPLACED].join("|")})(/|$)`)
// recharts accepts immer 10 and 11 and @reduxjs/toolkit 1.9 and 2, but the adapter turns off auto-freeze on the immer that the store
// reduces with, and with two copies installed (RTK 2.11 moved to immer 11) it would reach the wrong one. These two stay on one major.
const ALIGNED: Record<string, string> = { "@reduxjs/toolkit": "^2.11.0", immer: "^11.0.0" }

export function assertVersion(version: string): void {
  if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(version)) throw new Error(`not a recharts version: ${JSON.stringify(version)}`)
}

export function upstreamRechartsVersion(chart: { dependencies?: string[] }): string {
  const pinned = chart.dependencies?.find((dependency) => dependency.startsWith("recharts@"))?.slice("recharts@".length)
  if (!pinned) throw new Error("chart.json does not pin a recharts version")
  assertVersion(pinned)
  return pinned
}

type Manifest = { dependencies?: Record<string, string> }

export function packageJson<T extends Record<string, any>>(own: T, upstream: Manifest, version: string) {
  assertVersion(version)
  const dependencies: Record<string, string> = { ...ALIGNED }
  for (const [name, range] of Object.entries(upstream.dependencies ?? {})) {
    if (REPLACED.has(name)) continue
    if (/^react($|-)|^@types\/react/.test(name)) throw new Error(`recharts depends on ${name}, which the adapter does not replace`)
    dependencies[name] ??= range
  }
  return { ...own, version: `${version}-preact.${REVISION}`, dependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => (a < b ? -1 : 1))) }
}

// Exact-match edits of recharts code, the only ones; each throws when its text is gone, so a release that changed it is looked at.
type Patch = { file: string; from: string; to: string }
export const PATCHES: Patch[] = [
  // In development and test builds recharts has RTK walk its whole state after every action to catch mutations. React freezes its
  // elements, which ends the walk there; Preact vnodes are not frozen and lead to the parent vnode, so the walk covers the app's whole
  // component tree and everything the components hold (in happy-dom it runs out of memory).
  {
    file: "state/store.ts",
    from: "immutableCheck: !['commonjs', 'es6', 'production'].includes(process.env.NODE_ENV ?? ''),",
    to: "immutableCheck: false,",
  },
]

type Options = { srcDir: string; outDir: string; runtimeDir: string; patches?: Patch[] }

// The names a namespace import is used with: `React.memo`, `React.ReactNode`, `<React.Fragment />`. Any other use is beyond the check.
// shortcut: a computed member that is not a string literal is not checked; upgrade if recharts starts to depend on one.
function namespaceMembers(file: SourceFile, local: string): string[] {
  const names: string[] = []
  for (const id of file.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (id.getText() !== local) continue
    const parent = id.getParent()!
    if (Node.isNamespaceImport(parent)) continue
    // `(React as any)['useId'.toString()]` is recharts' way to use useId where it exists: a computed member reads undefined when the
    // adapter lacks it, and only a string literal can be checked here
    let value: Node = id
    while (Node.isAsExpression(value.getParent()) || Node.isParenthesizedExpression(value.getParent())) value = value.getParent()!
    const access = value.getParent()
    if (Node.isElementAccessExpression(access) && access.getExpression() === value) {
      const key = access.getArgumentExpression()
      if (Node.isStringLiteral(key)) names.push(key.getLiteralValue())
    } else if (Node.isPropertyAccessExpression(parent) && parent.getExpression() === id) names.push(parent.getName())
    else if (Node.isQualifiedName(parent) && parent.getLeft() === id) names.push(parent.getRight().getText())
    else if ((Node.isPropertyAccessExpression(parent) || Node.isQualifiedName(parent)) && parent.getLastChild() === id) continue
    else throw new Error(`${file.getBaseName()}: the namespace "${local}" is used as a value`)
  }
  return names
}

export function convertRecharts({ srcDir, outDir, runtimeDir, patches = PATCHES }: Options): { files: number; rewritten: number } {
  const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true })
  const provided = new Set(project.addSourceFileAtPath(join(runtimeDir, "adapter.ts")).getExportSymbols().map((symbol) => symbol.getName()))

  rmSync(outDir, { recursive: true, force: true })
  cpSync(srcDir, outDir, { recursive: true })
  const runtimeOut = join(outDir, "_runtime")
  cpSync(runtimeDir, runtimeOut, { recursive: true })
  for (const { file, from, to } of patches) {
    const path = join(outDir, file)
    const text = existsSync(path) ? readFileSync(path, "utf8") : ""
    if (!text.includes(from)) throw new Error(`${file}: the text of a patch is gone: ${from}`)
    writeFileSync(path, text.replace(from, () => to))
  }

  let files = 0
  let rewritten = 0
  for (const file of project.addSourceFilesAtPaths(join(outDir, "**/*.{ts,tsx}"))) {
    if (file.getFilePath().startsWith(runtimeOut + "/")) continue
    files++
    const name = relative(outDir, file.getFilePath())
    const toRuntime = relative(dirname(file.getFilePath()), runtimeOut).replaceAll("\\", "/") || "."
    const runtime = toRuntime.startsWith(".") ? toRuntime : `./${toRuntime}`
    const edits: (() => void)[] = []

    for (const declaration of [...file.getImportDeclarations(), ...file.getExportDeclarations()]) {
      const specifier = declaration.getModuleSpecifier()
      if (!specifier || !REACT_BOUND.test(specifier.getLiteralValue())) continue
      const from = specifier.getLiteralValue()
      let names: string[]
      if (Node.isImportDeclaration(declaration)) {
        if (declaration.getDefaultImport()) throw new Error(`${name}: default import from "${from}"`)
        const namespace = declaration.getNamespaceImport()
        names = [...declaration.getNamedImports().map((named) => named.getName()), ...(namespace ? namespaceMembers(file, namespace.getText()) : [])]
      } else {
        if (!declaration.hasNamedExports()) throw new Error(`${name}: export * from "${from}"`)
        names = declaration.getNamedExports().map((named) => named.getName())
      }
      for (const member of names) if (!provided.has(member)) throw new Error(`${name}: "${from}" is used for "${member}", which runtime/adapter.ts does not export`)
      edits.push(() => specifier.setLiteralValue(`${runtime}/adapter`))
      rewritten++
    }

    // dynamic import, require, `typeof import()` and `declare module` name a module without an import declaration
    for (const literal of file.getDescendantsOfKind(SyntaxKind.StringLiteral)) {
      if (!REACT_BOUND.test(literal.getLiteralValue())) continue
      const parent = literal.getParent()!
      const loads =
        (Node.isCallExpression(parent) && /^(import|require)$/.test(parent.getExpression().getText())) ||
        Node.isModuleDeclaration(parent) ||
        (Node.isLiteralTypeNode(parent) && Node.isImportTypeNode(parent.getParent()!))
      if (loads) throw new Error(`${name}: "${literal.getLiteralValue()}" is loaded outside an import declaration`)
    }

    for (const edit of edits) edit()
    if (name.endsWith(".tsx")) file.insertText(0, `/** @jsxImportSource ${runtime} */\n`)
  }
  project.saveSync()
  return { files, rewritten }
}

async function fetchTag(version: string): Promise<string> {
  const dir = join(cacheDir, version)
  if (existsSync(join(dir, "src"))) return dir
  const res = await fetch(`https://codeload.github.com/recharts/recharts/tar.gz/refs/tags/v${version}`)
  if (!res.ok) throw new Error(`recharts v${version}: ${res.status} ${res.statusText}`)
  mkdirSync(cacheDir, { recursive: true })
  const work = mkdtempSync(join(cacheDir, ".download-")) // beside the target, so the rename stays on one file system
  try {
    writeFileSync(join(work, "tag.tgz"), Buffer.from(await res.arrayBuffer()))
    mkdirSync(join(work, "tag"))
    const top = `recharts-${version}`
    execFileSync("tar", ["-xzf", join(work, "tag.tgz"), "-C", join(work, "tag"), "--strip-components=1", `${top}/src`, `${top}/package.json`, `${top}/LICENSE`])
    renameSync(join(work, "tag"), dir)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
  return dir
}

async function main(): Promise<void> {
  const version = process.argv[2] ?? upstreamRechartsVersion(JSON.parse(readFileSync(join(root, "packages/pipeline/upstream/radix-nova/chart.json"), "utf8")))
  assertVersion(version)
  const tag = await fetchTag(version)
  const { files, rewritten } = convertRecharts({ srcDir: join(tag, "src"), outDir: join(packageDir, "src"), runtimeDir: join(packageDir, "runtime") })
  copyFileSync(join(tag, "LICENSE"), join(packageDir, "LICENSE"))
  const manifest = join(packageDir, "package.json")
  const next = packageJson(JSON.parse(readFileSync(manifest, "utf8")), JSON.parse(readFileSync(join(tag, "package.json"), "utf8")), version)
  writeFileSync(manifest, JSON.stringify(next, null, 2) + "\n")
  console.log(`recharts ${version}: ${files} files, ${rewritten} React imports -> packages/recharts/src (${next.version}); run pnpm build there`)
}

if (process.argv[1] === import.meta.filename) await main()
