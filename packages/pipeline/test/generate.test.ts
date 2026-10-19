import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { dependencyList } from "../src/generate.ts"

const version: string = JSON.parse(readFileSync(join(import.meta.dirname, "../../recharts/package.json"), "utf8")).version
const upstream = `recharts@${version.replace(/-preact\.\d+$/, "")}`

describe("dependencyList", () => {
  it("swaps a replaced React package for its Preact package, pinned to the version in packages/recharts", () => {
    expect(dependencyList([upstream, "react"], ["@preactcn/recharts", "class-variance-authority"], false)).toEqual([
      `@preactcn/recharts@${version}`,
      "class-variance-authority",
    ])
  })

  it("rejects a package that was generated from another upstream version", () => {
    expect(() => dependencyList(["recharts@0.0.1"], ["@preactcn/recharts"], false)).toThrow(/pnpm recharts/)
  })
})
