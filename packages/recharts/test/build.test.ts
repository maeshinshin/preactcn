import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { addExtensions } from "../scripts/build.ts"

let dist: string
beforeEach(() => void (dist = mkdtempSync(join(tmpdir(), "dist-"))))
afterEach(() => rmSync(dist, { recursive: true, force: true }))
const write = (path: string, text: string) => (mkdirSync(dirname(join(dist, path)), { recursive: true }), writeFileSync(join(dist, path), text))
const read = (path: string) => readFileSync(join(dist, path), "utf8")

describe("addExtensions", () => {
  it("completes relative specifiers of every import and export form, in modules and declarations", () => {
    for (const file of ["a/b", "a/c", "a/dir/index", "x"]) (write(`${file}.js`, ""), write(`${file}.d.ts`, ""))
    const source = [
      `import { a } from "./b";`,
      `import './c';`,
      `export * from '../x';`,
      `export { z } from "./dir";`,
      `import {\n  m,\n  n\n} from "./b";`,
      `const lazy = () => import("./c");`,
    ].join("\n")
    write("a/m.js", source)
    write("a/m.d.ts", `export type T = import("./b").T;\n` + source)
    expect(addExtensions(dist)).toBe(2)
    expect(read("a/m.js")).toBe(
      [
        `import { a } from "./b.js";`,
        `import './c.js';`,
        `export * from '../x.js';`,
        `export { z } from "./dir/index.js";`,
        `import {\n  m,\n  n\n} from "./b.js";`,
        `const lazy = () => import("./c.js");`,
      ].join("\n")
    )
    expect(read("a/m.d.ts").startsWith(`export type T = import("./b.js").T;`)).toBe(true)
  })

  it("leaves packages, specifiers that already have an extension and unknown files alone", () => {
    write("a/b.js", "")
    const source = `import x from "preact";\nimport y from "preact/hooks";\nimport z from "./b.js";\nimport w from "./missing";\nimport v from "./data.json";\n`
    write("a/m.js", source)
    expect(addExtensions(dist)).toBe(0)
    expect(read("a/m.js")).toBe(source)
  })

  it("finishes the jsx runtime import tsc writes", () => {
    write("_runtime/jsx-runtime.js", "")
    write("cartesian/Bar.js", `import { jsx as _jsx } from "../_runtime/jsx-runtime";\n`)
    addExtensions(dist)
    expect(read("cartesian/Bar.js")).toBe(`import { jsx as _jsx } from "../_runtime/jsx-runtime.js";\n`)
  })
})
