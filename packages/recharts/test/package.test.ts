// @vitest-environment node
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(import.meta.dirname, "..")
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const dist = join(root, "dist")
const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]))

describe("the built package", () => {
  it("loads in Node without a bundler and exports the components the shadcn chart uses", () => {
    const names = JSON.parse(
      execFileSync(process.execPath, ["--input-type=module", "-e", `import("${join(dist, "index.js")}").then((m) => console.log(JSON.stringify(Object.keys(m))))`], { encoding: "utf8" })
    ) as string[]
    for (const name of ["ResponsiveContainer", "Tooltip", "Legend", "BarChart", "Bar", "Cell", "LabelList", "ErrorBar", "AreaChart", "LineChart", "PieChart", "RadarChart", "RadialBarChart"])
      expect(names).toContain(name)
  })

  it("imports no React package, in code or in declarations", () => {
    const name = `["'](?:react|react-dom|react-is|react-redux|use-sync-external-store)(?:\\/[^"']*)?["']`
    const react = new RegExp(`^(?:import|export)\\b[^;]*?\\bfrom\\s*${name}|\\bimport\\(${name}\\)|^import\\s*${name}`, "m")
    const offenders = files(dist).filter((file) => /\.(js|d\.ts)$/.test(file) && react.test(readFileSync(file, "utf8")))
    expect(offenders).toEqual([])
  })

  it("keeps every relative import resolvable under Node's rules", () => {
    const relative = /(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g
    const missing = files(dist)
      .filter((file) => /\.(js|d\.ts)$/.test(file))
      .flatMap((file) => [...readFileSync(file, "utf8").matchAll(relative)].map((match) => [file, match[1]!] as const))
      .filter(([file, specifier]) => !existsSync(resolve(file, "..", specifier)))
    expect(missing).toEqual([])
  })

  it("declares Preact as a peer, no React package as a dependency, and entry points that exist", () => {
    expect(manifest.peerDependencies).toEqual({ preact: ">=10.29 <12" })
    expect(Object.keys(manifest.dependencies).filter((name) => /^react|^@types\/react|use-sync-external-store/.test(name))).toEqual([])
    for (const path of [manifest.main, manifest.types, manifest.exports["."].default, manifest.exports["."].types]) expect(existsSync(join(root, path))).toBe(true)
    expect(existsSync(join(root, "LICENSE"))).toBe(true)
  })

  it("is versioned after the recharts version the shadcn chart depends on", () => {
    const chart = JSON.parse(readFileSync(join(root, "../pipeline/upstream/radix-nova/chart.json"), "utf8")) as { dependencies: string[] }
    const recharts = chart.dependencies.find((dependency) => dependency.startsWith("recharts@"))!.slice("recharts@".length)
    expect(manifest.version).toMatch(new RegExp(`^${recharts.replaceAll(".", "\\.")}-preact\\.\\d+$`))
  })
})
