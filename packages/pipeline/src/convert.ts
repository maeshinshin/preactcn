import {
  Node,
  Project,
  SyntaxKind,
  ts,
  type ExportDeclaration,
  type ImportDeclaration,
  type SourceFile,
} from "ts-morph"

export type Analysis = {
  usesCn: boolean
  usesIcons: boolean
  radixFamilies: string[]
  ui: string[]
  hooks: string[]
  example: boolean
  libs: string[]
  shims: string[]
  packages: string[]
  unresolved: string[]
}

const RADIX_FAMILIES = new Set([
  "accordion",
  "alert-dialog",
  "aspect-ratio",
  "avatar",
  "checkbox",
  "collapsible",
  "context-menu",
  "dialog",
  "direction",
  "dropdown-menu",
  "hover-card",
  "label",
  "menubar",
  "navigation-menu",
  "popover",
  "progress",
  "radio-group",
  "scroll-area",
  "select",
  "separator",
  "slider",
  "slot",
  "switch",
  "tabs",
  "toggle",
  "toggle-group",
  "tooltip",
])

// React-only packages that have a Preact shim in packages/registry/src/shims/<shimFile>.tsx, installed to src/lib/shims/.
// Moving a package from REACT_ONLY_PACKAGES to here, with its shim file, is how a library gets supported.
// An entry is a whole package (every subpath import throws) or one import specifier of a package that also has other subpaths
// (`@shadcn/react/questionnaire`): an unlisted subpath of it stays React-only, so keep the package in REACT_ONLY_PACKAGES.
export const SHIMMED_PACKAGES = new Set([
  "embla-carousel-react", "cmdk", "sonner", "next-themes", "input-otp", "vaul", "react-resizable-panels", "@base-ui/react",
  "@shadcn/react/message-scroller", "@shadcn/react/questionnaire",
  "react-day-picker", "react-day-picker/locale",
])

// React packages that have a Preact counterpart on npm (packages/<name after the scope>): the import is renamed and the item
// depends on the counterpart, pinned to the version in that package.json (generate.ts). A subpath throws, the counterpart exports none.
export const REPLACED_PACKAGES = new Map([["recharts", "@preactcn/recharts"]])

// React libraries that have no shim yet: importing one throws, so the item is quarantined instead of shipping code that needs React.
// A React-only package missing here fails later in the consumer, where `react` resolves nowhere (tsc, vite build).
const REACT_ONLY_PACKAGES = new Set([
  "@shadcn/react",
  "react-hook-form",
])

const ICON_PLACEHOLDER_MODULE = "@/app/(create)/components/icon-placeholder"
const ICON_LIBRARY_PROPS = new Set([
  "tabler",
  "hugeicons",
  "phosphor",
  "remixicon",
])
const REGISTRY_PREFIX = "@/registry/radix-nova/"
const MAX_LINE = 80

type Entry =
  | { from: "preact/hooks" | "preact"; kind: "value"; text: string }
  | { from: "preact"; kind: "type"; text: string; name: string }

const HOOKS = [
  "useState",
  "useEffect",
  "useLayoutEffect",
  "useMemo",
  "useRef",
  "useCallback",
  "useContext",
  "useId",
  "useReducer",
  "useImperativeHandle",
]
const PREACT_VALUES = ["createContext", "Fragment"]
// top-level type exports of preact (10.29 and 11); the JSX namespace no longer carries these in 11
const TYPE_RENAMES: Record<string, string> = {
  ComponentProps: "ComponentProps",
  ComponentPropsWithRef: "ComponentProps",
  ComponentPropsWithoutRef: "ComponentProps",
  ComponentType: "ComponentType",
  ReactNode: "ComponentChildren",
  CSSProperties: "CSSProperties",
  SyntheticEvent: "TargetedEvent",
  FormEvent: "TargetedEvent",
  ChangeEvent: "TargetedEvent",
  AnimationEvent: "TargetedAnimationEvent",
  ClipboardEvent: "TargetedClipboardEvent",
  CompositionEvent: "TargetedCompositionEvent",
  DragEvent: "TargetedDragEvent",
  FocusEvent: "TargetedFocusEvent",
  KeyboardEvent: "TargetedKeyboardEvent",
  MouseEvent: "TargetedMouseEvent",
  PointerEvent: "TargetedPointerEvent",
  TouchEvent: "TargetedTouchEvent",
  TransitionEvent: "TargetedTransitionEvent",
  UIEvent: "TargetedUIEvent",
  WheelEvent: "TargetedWheelEvent",
}

function lookup(member: string): Entry | undefined {
  if (HOOKS.includes(member))
    return { from: "preact/hooks", kind: "value", text: member }
  if (PREACT_VALUES.includes(member))
    return { from: "preact", kind: "value", text: member }
  const type = TYPE_RENAMES[member]
  if (type) return { from: "preact", kind: "type", text: type, name: type }
  return undefined
}

type Edit = { start: number; end: number; text: string }

const project = new Project({
  useInMemoryFileSystem: true,
  skipAddingFilesFromTsConfig: true,
  compilerOptions: { jsx: ts.JsxEmit.Preserve },
})

function parse(source: string): SourceFile {
  return project.createSourceFile("input.tsx", source, { overwrite: true })
}

function applyEdits(source: string, edits: Edit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end)
  let out = source
  let lowest = Infinity
  for (const e of sorted) {
    if (e.end > lowest) throw new Error(`Overlapping edits at ${e.start}`)
    out = out.slice(0, e.start) + e.text + out.slice(e.end)
    lowest = e.start
  }
  return out
}

function moduleDeclarations(
  file: SourceFile
): (ImportDeclaration | ExportDeclaration)[] {
  return [...file.getImportDeclarations(), ...file.getExportDeclarations()]
}

function removeLine(source: string, node: Node): Edit {
  const end = node.getEnd()
  return {
    start: node.getStart(),
    end: source[end] === "\n" ? end + 1 : end,
    text: "",
  }
}

function formatImport(names: string[], from: string, type = false): string {
  const kw = type ? "import type" : "import"
  const line = `${kw} { ${names.join(", ")} } from "${from}"`
  if (line.length <= MAX_LINE) return line
  return `${kw} {\n${names.map((n) => `  ${n},`).join("\n")}\n} from "${from}"`
}

function bySortKey(a: string, b: string): number {
  const x = a.toLowerCase()
  const y = b.toLowerCase()
  return x < y ? -1 : x > y ? 1 : 0
}

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()
}

function radixFamily(exportName: string): string {
  const family = kebab(exportName)
  if (!RADIX_FAMILIES.has(family))
    throw new Error(`No shim family for radix-ui export "${exportName}"`)
  return family
}

export function shimFile(pkg: string): string {
  return pkg.replace(/^@/, "").replaceAll("/", "-")
}

// a subpath of a shimmed package would slip through as a plain dependency on the React package
function isShimmed(specifier: string): boolean {
  if (SHIMMED_PACKAGES.has(specifier)) return true
  const root = packageRoot(specifier)
  if (SHIMMED_PACKAGES.has(root))
    throw new Error(`Unsupported subpath import "${specifier}" of shimmed package "${root}"`)
  return false
}

function replacement(specifier: string): string | undefined {
  const root = packageRoot(specifier)
  const target = REPLACED_PACKAGES.get(root)
  if (target && specifier !== root)
    throw new Error(`Unsupported subpath import "${specifier}" of replaced package "${root}"`)
  return target
}

function registryTarget(specifier: string): string {
  const rest = specifier.slice(REGISTRY_PREFIX.length)
  const ui = /^ui\/([\w-]+)$/.exec(rest)
  if (ui) return `@/components/ui/${ui[1]}`
  if (rest === "components/example") return "@/components/example"
  const hook = /^hooks\/([\w-]+)$/.exec(rest)
  if (hook) return `@/hooks/${hook[1]}`
  const lib = /^lib\/([\w-]+)$/.exec(rest)
  if (lib) return `@/lib/${lib[1]}`
  throw new Error(`Unsupported registry path "${specifier}"`)
}

function isNamePosition(node: Node): boolean {
  const parent = node.getParent()
  if (!parent) return false
  if (Node.isPropertyAccessExpression(parent)) return parent.getNameNode() === node
  if (Node.isQualifiedName(parent)) return parent.getRight() === node
  if (
    Node.isPropertyAssignment(parent) ||
    Node.isPropertySignature(parent) ||
    Node.isJsxAttribute(parent)
  )
    return parent.getNameNode() === node
  return false
}

function line(node: Node): number {
  return node.getStartLineNumber()
}

function convertReact(
  file: SourceFile,
  source: string,
  edits: Edit[],
  skip: Node[],
  needsCssProperties: boolean
): void {
  const decls = file.getImportDeclarations().filter(
    (d) => d.getModuleSpecifierValue() === "react"
  )
  const nsNode = (d: ImportDeclaration) =>
    d.getNamespaceImport() ?? d.getDefaultImport()
  // some upstream files use the global React namespace next to, or without, a named import from "react"
  const nsName = decls.map(nsNode).find(Boolean)?.getText() ?? "React"

  const values = new Map<string, Set<string>>()
  const types = new Set<string>()
  const need = (entry: Entry) => {
    if (entry.kind === "type") types.add(entry.name)
    else {
      if (!values.has(entry.from)) values.set(entry.from, new Set())
      values.get(entry.from)!.add(entry.text)
    }
  }
  if (needsCssProperties) need(lookup("CSSProperties")!)
  const replaceMember = (node: Node, member: string) => {
    if (node.getFirstAncestor((a) => skip.includes(a))) return
    const entry = lookup(member)
    if (!entry)
      throw new Error(
        `Unsupported React member "React.${member}" (line ${line(node)})`
      )
    need(entry)
    edits.push({ start: node.getStart(), end: node.getEnd(), text: entry.text })
  }

  const handled = new Set<Node>()
  if (nsName) {
    file.forEachDescendant((node) => {
      if (Node.isPropertyAccessExpression(node)) {
        const target = node.getExpression()
        if (Node.isIdentifier(target) && target.getText() === nsName) {
          handled.add(target)
          replaceMember(node, node.getName())
        }
      } else if (Node.isQualifiedName(node)) {
        const target = node.getLeft()
        if (Node.isIdentifier(target) && target.getText() === nsName) {
          handled.add(target)
          replaceMember(node, node.getRight().getText())
        }
      }
    })
  }

  const renames = new Map<string, string>()
  for (const d of decls) {
    if (d.getDefaultImport() && d.getNamedImports().length > 0)
      throw new Error("Unsupported default and named React import together")
    for (const spec of d.getNamedImports()) {
      if (spec.getAliasNode())
        throw new Error(`Unsupported aliased React import "${spec.getText()}"`)
      const member = spec.getName()
      const entry = lookup(member)
      if (!entry)
        throw new Error(`Unsupported React import "${member}" (line ${line(d)})`)
      need(entry)
      if (entry.text !== member) renames.set(member, entry.text)
    }
  }

  const inReactImport = (n: Node) => decls.some((d) => n.getFirstAncestor((a) => a === d))
  file.forEachDescendant((node) => {
    if (!Node.isIdentifier(node) || handled.has(node) || inReactImport(node)) return
    if (isNamePosition(node)) return
    const text = node.getText()
    if (text === nsName)
      throw new Error(`Unsupported bare use of "${nsName}" (line ${line(node)})`)
    const rename = renames.get(text)
    if (rename)
      edits.push({ start: node.getStart(), end: node.getEnd(), text: rename })
  })

  const taken = new Set<string>()
  for (const s of file.getStatements()) {
    if (Node.isImportDeclaration(s)) {
      if (s.getModuleSpecifierValue() === "react") continue
      for (const n of s.getNamedImports()) taken.add((n.getAliasNode() ?? n.getNameNode()).getText())
      const def = s.getDefaultImport()
      if (def) taken.add(def.getText())
      const ns = s.getNamespaceImport()
      if (ns) taken.add(ns.getText())
    } else if (Node.isVariableStatement(s)) {
      for (const d of s.getDeclarations()) taken.add(d.getName())
    } else if (
      Node.isFunctionDeclaration(s) ||
      Node.isClassDeclaration(s) ||
      Node.isInterfaceDeclaration(s) ||
      Node.isTypeAliasDeclaration(s) ||
      Node.isEnumDeclaration(s)
    ) {
      const name = s.getName()
      if (name) taken.add(name)
    }
  }

  const lines: string[] = []
  const valueFrom = (from: string) => [...(values.get(from) ?? [])].sort(bySortKey)
  if (valueFrom("preact").length)
    lines.push(formatImport(valueFrom("preact"), "preact"))
  if (types.size) lines.push(formatImport([...types].sort(bySortKey), "preact", true))
  if (valueFrom("preact/hooks").length)
    lines.push(formatImport(valueFrom("preact/hooks"), "preact/hooks"))

  const added = [...values.values()].flatMap((s) => [...s]).concat([...types])
  for (const name of added)
    if (taken.has(name))
      throw new Error(`Local declaration "${name}" collides with a Preact import`)

  if (decls.length === 0 && lines.length) {
    const first = file.getImportDeclarations()[0]
    if (!first) throw new Error("React.* is used but the file has no import to anchor the Preact imports")
    edits.push({ start: first.getStart(), end: first.getStart(), text: lines.join("\n") + "\n" })
  }
  decls.forEach((d, i) => {
    if (i === 0 && lines.length) {
      edits.push({ start: d.getStart(), end: d.getEnd(), text: lines.join("\n") })
    } else {
      edits.push(removeLine(source, d))
    }
  })
}

function convertIcons(
  file: SourceFile,
  source: string,
  edits: Edit[],
  withLucideProps: boolean
): void {
  const decl = file
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue() === ICON_PLACEHOLDER_MODULE)
  const used = new Set<string>()

  const elements = file.getDescendants().filter(
    (n) =>
      (Node.isJsxSelfClosingElement(n) || Node.isJsxOpeningElement(n)) &&
      n.getTagNameNode().getText() === "IconPlaceholder"
  )
  for (const el of elements) {
    if (!Node.isJsxSelfClosingElement(el))
      throw new Error(`IconPlaceholder with children (line ${line(el)})`)
    const attrs = el.getAttributes()
    const lucide = attrs.find(
      (a) => Node.isJsxAttribute(a) && a.getNameNode().getText() === "lucide"
    )
    const init = lucide && Node.isJsxAttribute(lucide) ? lucide.getInitializer() : undefined
    if (!init || !Node.isStringLiteral(init))
      throw new Error(
        `IconPlaceholder needs a string literal "lucide" prop (line ${line(el)})`
      )
    const name = init.getLiteralValue()
    used.add(name)

    const tag = el.getTagNameNode()
    edits.push({ start: tag.getStart(), end: tag.getEnd(), text: name })
    let previousEnd = tag.getEnd()
    let kept = 0
    for (const attr of attrs) {
      const dropped =
        Node.isJsxAttribute(attr) &&
        (attr === lucide || ICON_LIBRARY_PROPS.has(attr.getNameNode().getText()))
      if (dropped)
        edits.push({ start: previousEnd, end: attr.getEnd(), text: "" })
      else kept++
      previousEnd = attr.getEnd()
    }
    if (kept === 0)
      edits.push({ start: previousEnd, end: el.getEnd() - 2, text: " " })
  }

  if (!decl) {
    if (elements.length) throw new Error("IconPlaceholder is used but not imported")
    return
  }
  if (used.size === 0) edits.push(removeLine(source, decl))
  else
    edits.push({
      start: decl.getStart(),
      end: decl.getEnd(),
      text: formatImport(
        [...[...used].sort(bySortKey), ...(withLucideProps ? ["type LucideProps"] : [])],
        "lucide-preact"
      ),
    })
}

// lucide-preact's prop types reject the signal-aware svg props of ComponentProps<"svg">
function replaceSvgProps(file: SourceFile, edits: Edit[]): Node[] {
  const hasPlaceholder = file
    .getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)
    .some((n) => n.getTagNameNode().getText() === "IconPlaceholder")
  if (!hasPlaceholder) return []
  const refs = file.getDescendantsOfKind(SyntaxKind.TypeReference).filter((t) => {
    const name = t.getTypeName().getText()
    const args = t.getTypeArguments()
    return (
      (name === "ComponentProps" || name.endsWith(".ComponentProps")) &&
      args.length === 1 &&
      args[0]!.getText() === '"svg"'
    )
  })
  for (const ref of refs)
    edits.push({ start: ref.getStart(), end: ref.getEnd(), text: "LucideProps" })
  return refs
}

// Preact types `style` as a string, an object or a signal, and an object spread rejects the first and the last
function replaceStyleSpreads(file: SourceFile, edits: Edit[]): boolean {
  const spreads = file
    .getDescendantsOfKind(SyntaxKind.SpreadAssignment)
    .map((s) => s.getExpression())
    .filter((e) => Node.isIdentifier(e) && e.getText() === "style")
  for (const e of spreads) edits.push({ start: e.getStart(), end: e.getEnd(), text: "(style as CSSProperties)" })
  return spreads.length > 0
}

// Preact core sets svg attributes verbatim, so React's camelCase presentation attributes (strokeLinecap) must be kebab-case;
// Same families as preact/compat's own table, trimmed to the common ones.
const SVG_CAMEL = /^(?:clip(?!PathU)|fill|stroke|marker(?!H|W|U)|font|text(?!L)|letter|word|stop|flood|lighting|dominant|alignment|baseline|color|shape|pointer|paint)[A-Z]/

function convertSvgAttributes(file: SourceFile, edits: Edit[]): void {
  for (const attr of file.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
    const name = attr.getNameNode()
    const element = attr.getParent()?.getParent()
    if (!Node.isJsxOpeningElement(element) && !Node.isJsxSelfClosingElement(element)) continue
    if (!/^[a-z]/.test(element.getTagNameNode().getText()) || !SVG_CAMEL.test(name.getText())) continue
    edits.push({
      start: name.getStart(),
      end: name.getEnd(),
      text: name.getText().replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()),
    })
  }
}

export function convertSource(source: string): string {
  const file = parse(source)
  const edits: Edit[] = []

  for (const decl of moduleDeclarations(file)) {
    const literal = decl.getModuleSpecifier()
    if (!literal) continue
    const specifier = decl.getModuleSpecifierValue() as string

    if (specifier === "cn") {
      edits.push({
        start: literal.getStart(),
        end: literal.getEnd(),
        text: '"@/lib/utils"',
      })
    } else if (specifier.startsWith(REGISTRY_PREFIX)) {
      edits.push({
        start: literal.getStart(),
        end: literal.getEnd(),
        text: `"${registryTarget(specifier)}"`,
      })
    } else if (isShimmed(specifier)) {
      edits.push({
        start: literal.getStart(),
        end: literal.getEnd(),
        text: `"@/lib/shims/${shimFile(specifier)}"`,
      })
    } else if (replacement(specifier)) {
      edits.push({
        start: literal.getStart(),
        end: literal.getEnd(),
        text: `"${replacement(specifier)}"`,
      })
    } else if (REACT_ONLY_PACKAGES.has(packageRoot(specifier))) {
      throw new Error(`"${specifier}" needs React and has no Preact shim: write one in packages/registry/src/shims and move the package from REACT_ONLY_PACKAGES to SHIMMED_PACKAGES`)
    } else if (specifier === "radix-ui") {
      if (!Node.isImportDeclaration(decl))
        throw new Error('Unsupported export from "radix-ui"')
      if (decl.getDefaultImport() || decl.getNamespaceImport())
        throw new Error('Unsupported default or namespace import of "radix-ui"')
      const lines = decl.getNamedImports().map((n) => {
        const local = (n.getAliasNode() ?? n.getNameNode()).getText()
        return `import * as ${local} from "@/lib/radix/${radixFamily(n.getName())}"`
      })
      edits.push({
        start: decl.getStart(),
        end: decl.getEnd(),
        text: lines.join("\n"),
      })
    }
  }

  const svgRefs = replaceSvgProps(file, edits)
  convertIcons(file, source, edits, svgRefs.length > 0)
  const styleSpreads = replaceStyleSpreads(file, edits)
  convertReact(file, source, edits, svgRefs, styleSpreads)
  convertSvgAttributes(file, edits)

  // Preact has no server components, so Next.js's client-boundary directive means nothing; it goes with the blank lines after it
  const first = file.getStatements()[0]
  if (first && /^["']use client["'];?$/.test(first.getText())) {
    edits.push({ start: first.getStart(), end: first.getEnd() + /^\n*/.exec(source.slice(first.getEnd()))![0].length, text: "" })
  }

  return applyEdits(source, edits)
}

export function moduleSpecifiers(source: string): string[] {
  return moduleDeclarations(parse(source)).flatMap((d) => {
    const specifier = d.getModuleSpecifierValue()
    return specifier === undefined ? [] : [specifier]
  })
}

export function packageRoot(specifier: string): string {
  const parts = specifier.split("/")
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!
}

export function analyzeSource(source: string): Analysis {
  const file = parse(source)
  const out = {
    usesCn: false,
    usesIcons: false,
    radixFamilies: new Set<string>(),
    ui: new Set<string>(),
    hooks: new Set<string>(),
    example: false,
    libs: new Set<string>(),
    shims: new Set<string>(),
    packages: new Set<string>(),
    unresolved: [] as string[],
  }

  for (const decl of moduleDeclarations(file)) {
    const specifier = decl.getModuleSpecifierValue()
    if (specifier === undefined) continue

    if (specifier === "cn") out.usesCn = true
    else if (specifier === ICON_PLACEHOLDER_MODULE) out.usesIcons = true
    else if (specifier === "radix-ui") {
      if (!Node.isImportDeclaration(decl)) continue
      for (const n of decl.getNamedImports())
        out.radixFamilies.add(radixFamily(n.getName()))
    } else if (specifier.startsWith(REGISTRY_PREFIX)) {
      const target = registryTarget(specifier)
      if (target.startsWith("@/components/ui/"))
        out.ui.add(target.slice("@/components/ui/".length))
      else if (target.startsWith("@/hooks/"))
        out.hooks.add(target.slice("@/hooks/".length))
      else if (target === "@/components/example") out.example = true
      else if (target === "@/lib/utils") out.usesCn = true
      else out.libs.add(target.slice("@/lib/".length))
    } else if (isShimmed(specifier)) {
      out.shims.add(shimFile(specifier))
    } else if (replacement(specifier)) {
      out.packages.add(replacement(specifier)!)
    } else if (specifier.startsWith("@/") || packageRoot(specifier) === "next") {
      out.unresolved.push(specifier)
    } else if (!specifier.startsWith(".") && specifier !== "react") {
      out.packages.add(packageRoot(specifier))
    }
  }

  return {
    usesCn: out.usesCn,
    usesIcons: out.usesIcons,
    radixFamilies: [...out.radixFamilies].sort(),
    ui: [...out.ui].sort(),
    hooks: [...out.hooks].sort(),
    example: out.example,
    libs: [...out.libs].sort(),
    shims: [...out.shims].sort(),
    packages: [...out.packages].sort(),
    unresolved: out.unresolved,
  }
}
