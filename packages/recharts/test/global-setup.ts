// Converts the upstream shadcn chart and its example with the pipeline's codemod, as a project that installs @preactcn/recharts gets them.
// The example loses what is not under test: icons and the app-only search params hook.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { convertSource } from "../../pipeline/src/convert.ts"
import { applyTypeFixes } from "../../pipeline/src/generate.ts"

const upstream = resolve(import.meta.dirname, "../../pipeline/upstream/radix-nova")
const gen = join(import.meta.dirname, ".gen")
const item = (name: string) => JSON.parse(readFileSync(join(upstream, `${name}.json`), "utf8")).files[0].content as string
const write = (path: string, text: string) => (mkdirSync(dirname(join(gen, path)), { recursive: true }), writeFileSync(join(gen, path), text))

export default function setup() {
  const example = item("chart-example")
    .replace(/<IconPlaceholder[\s\S]*?\/>/g, "")
    .replace(/import \{ IconPlaceholder \}.*\n/, "")
    .replace(/import \{ useDesignSystemSearchParams \}.*\n/, 'const useDesignSystemSearchParams = () => [{ style: "nova" }] as const\n')
  write("ui/chart.tsx", applyTypeFixes("chart", convertSource(item("chart"))))
  write("examples/chart-example.tsx", convertSource(example))
}

if (process.argv[1] === import.meta.filename) setup()
