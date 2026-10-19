import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { assertVersion, convertRecharts, packageJson, upstreamRechartsVersion } from "../src/recharts.ts"

let dir: string
beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "recharts-"))))
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const write = (path: string, text: string) => (mkdirSync(dirname(join(dir, path)), { recursive: true }), writeFileSync(join(dir, path), text))
const read = (path: string) => readFileSync(join(dir, path), "utf8")

// a runtime with the names the fixtures use, in the three files the real one has
const ADAPTER = `
export const useState = 1
export const memo = 1
export const Fragment = 1
export const createPortal = 1
export const isFragment = 1
export const Provider = 1
export const useSyncExternalStoreWithSelector = 1
export { Component } from "preact"
export type ReactNode = unknown
export type CheckFrequency = "never"
export type Subscription = unknown
export type SVGProps<T> = T
export type JSX = unknown
`
function convert(files: Record<string, string>) {
  write("runtime/adapter.ts", ADAPTER)
  write("runtime/jsx-runtime.ts", "export const jsx = 1")
  write("runtime/fix-props.ts", "export const fixProps = 1")
  for (const [path, text] of Object.entries(files)) write(`src/${path}`, text)
  return convertRecharts({ srcDir: join(dir, "src"), outDir: join(dir, "out"), runtimeDir: join(dir, "runtime"), patches: [] })
}

describe("convertRecharts", () => {
  it("points every React import at the adapter, from any depth", () => {
    const { files } = convert({
      "a.ts": `import { useState } from 'react'\nimport { createPortal } from 'react-dom'\n`,
      "deep/er/b.ts": [
        `import { isFragment } from 'react-is'`,
        `import { Component } from 'react'`,
        `import { Provider, type Subscription } from "react-redux"`,
        `import type { CheckFrequency } from 'react-redux/es/hooks/useSelector'`,
        `import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector'`,
        `export { memo } from 'react'`,
      ].join("\n"),
    })
    expect(files).toBe(2)
    expect(read("out/a.ts")).toBe(`import { useState } from './_runtime/adapter'\nimport { createPortal } from './_runtime/adapter'\n`)
    const b = read("out/deep/er/b.ts")
    expect(b.match(/from (['"])\.\.\/\.\.\/_runtime\/adapter\1/g)).toHaveLength(6)
    expect(b).not.toMatch(/react|use-sync/)
  })

  it("keeps the quotes and every other import, and ignores React in comments and strings", () => {
    convert({
      "x.ts": `// import { x } from 'react'\nimport clsx from 'clsx'\nimport { y } from "./y"\nimport { useState } from "react"\nconst s = "react-is"\n`,
    })
    expect(read("out/x.ts")).toBe(
      `// import { x } from 'react'\nimport clsx from 'clsx'\nimport { y } from "./y"\nimport { useState } from "./_runtime/adapter"\nconst s = "react-is"\n`
    )
  })

  it("accepts namespace imports and checks the members used as values, types and in jsx", () => {
    convert({
      "ns.tsx": `import * as React from 'react'\nexport const a = React.memo\nexport type T = React.ReactNode\nexport type P = React.SVGProps<SVGElement>\nexport type J = React.JSX\nexport const b = <React.Fragment />\n`,
    })
    expect(read("out/ns.tsx")).toContain(`import * as React from './_runtime/adapter'`)
  })

  it("checks a computed namespace member that is a string literal and lets other computed members through", () => {
    expect(() => convert({ "c.ts": `import * as React from 'react'\nexport const a = (React as any)['useId'.toString()]\nexport const b = (React as any)['memo']` })).not.toThrow()
    expect(() => convert({ "c.ts": `import * as React from 'react'\nexport const b = (React as any)['useTransition']` })).toThrow(/useTransition/)
  })

  it.each([
    ["a named import", `import { useTransition } from 'react'`, "useTransition"],
    ["a type import", `import type { Suspense } from 'react'`, "Suspense"],
    ["a re-export", `export { startTransition } from 'react'`, "startTransition"],
    ["a name of another package", `import { useDispatch } from 'react-redux'`, "useDispatch"],
    ["a namespace member", `import * as React from 'react'\nexport const a = React.useTransition`, "useTransition"],
    ["a namespace member in a type", `import * as React from 'react'\nexport type A = React.Suspense`, "Suspense"],
    ["a subpath", `import { jsx } from 'react/jsx-runtime'`, "jsx"],
  ])("throws on %s the adapter does not provide", (_, source, name) => {
    expect(() => convert({ "bad.ts": source })).toThrow(new RegExp(`bad\\.ts.*${name}`))
  })

  it.each([
    ["a default import", `import React from 'react'`],
    ["a namespace used as a value", `import * as React from 'react'\nexport const all = React`],
    ["export star", `export * from 'react'`],
    ["a dynamic import", `export const lazy = () => import('react')`],
    ["a require call", `const r = require('react-dom')`],
    ["an import type", `export type R = typeof import('react')`],
    ["a module augmentation", `declare module 'react' { interface Foo {} }`],
  ])("throws on %s", (_, source) => {
    expect(() => convert({ "bad.ts": source })).toThrow(/bad\.ts/)
  })

  it("adds the jsx import source to tsx files only, relative to the file", () => {
    convert({ "A.tsx": `export const a = <i />\n`, "sub/B.tsx": `export const b = <i />\n`, "c.ts": `export const c = 1\n` })
    expect(read("out/A.tsx")).toBe(`/** @jsxImportSource ./_runtime */\nexport const a = <i />\n`)
    expect(read("out/sub/B.tsx")).toBe(`/** @jsxImportSource ../_runtime */\nexport const b = <i />\n`)
    expect(read("out/c.ts")).toBe(`export const c = 1\n`)
  })

  it("copies the runtime next to the converted source and replaces an earlier output", () => {
    write("out/old.ts", "stale")
    convert({ "a.ts": "export {}\n" })
    expect(existsSync(join(dir, "out/old.ts"))).toBe(false)
    expect(read("out/_runtime/adapter.ts")).toBe(ADAPTER)
    expect(read("out/_runtime/jsx-runtime.ts")).toBe("export const jsx = 1")
    expect(read("out/_runtime/fix-props.ts")).toBe("export const fixProps = 1")
  })
})

describe("patches", () => {
  const patch = { file: "state/store.ts", from: "check: true", to: "check: false" }
  const run = (files: Record<string, string>, patches = [patch]) => {
    write("runtime/adapter.ts", ADAPTER)
    for (const [path, text] of Object.entries(files)) write(`src/${path}`, text)
    return convertRecharts({ srcDir: join(dir, "src"), outDir: join(dir, "out"), runtimeDir: join(dir, "runtime"), patches })
  }

  it("replaces the exact text, once, before anything else reads the file", () => {
    run({ "state/store.ts": "const a = { check: true, other: check: true }\n" })
    expect(read("out/state/store.ts")).toBe("const a = { check: false, other: check: true }\n")
  })

  it("throws when the text or the file is gone", () => {
    expect(() => run({ "state/store.ts": "const a = 1\n" })).toThrow("state/store.ts")
    expect(() => run({ "a.ts": "const a = 1\n" })).toThrow("state/store.ts")
  })
})

describe("packageJson", () => {
  const own = { name: "@preactcn/recharts", version: "0.0.0", scripts: { build: "x" }, peerDependencies: { preact: ">=10.29 <12" }, devDependencies: { vitest: "1" } }
  const upstream = {
    dependencies: { "@reduxjs/toolkit": "^1.9.0 || 2.x.x", clsx: "^2.1.1", immer: "^10.1.1", "react-redux": "8.x.x || 9.x.x", "use-sync-external-store": "^1.2.2" },
    peerDependencies: { react: "^19", "react-dom": "^19", "react-is": "^19" },
  }

  it("takes the framework-free dependencies of the tag, sorted, and keeps the rest of the file", () => {
    const next = packageJson(own, upstream, "3.8.0")
    expect(Object.keys(next.dependencies)).toEqual(["@reduxjs/toolkit", "clsx", "immer"])
    expect(next.dependencies.clsx).toBe("^2.1.1")
    expect(next.scripts).toEqual({ build: "x" })
    expect(next.peerDependencies).toEqual({ preact: ">=10.29 <12" })
    expect(next.devDependencies).toEqual({ vitest: "1" })
  })

  it("versions the package as the recharts version plus the revision of the conversion", () => {
    expect(packageJson(own, upstream, "3.8.0").version).toMatch(/^3\.8\.0-preact\.\d+$/)
  })

  it("keeps immer and the store on one major, because the adapter must reach the immer the store uses", () => {
    const { dependencies } = packageJson(own, upstream, "3.8.0")
    expect(dependencies.immer).toBe("^11.0.0")
    expect(dependencies["@reduxjs/toolkit"]).toBe("^2.11.0")
  })

  it("throws on a React-bound dependency it does not replace", () => {
    expect(() => packageJson(own, { dependencies: { "react-transition-group": "^4" } }, "3.8.0")).toThrow("react-transition-group")
    expect(() => packageJson(own, { dependencies: { "@types/react": "^19" } }, "3.8.0")).toThrow("@types/react")
  })
})

describe("upstreamRechartsVersion", () => {
  it("reads the exact recharts version the shadcn chart item depends on", () => {
    expect(upstreamRechartsVersion({ dependencies: ["cn", "recharts@3.8.0"] })).toBe("3.8.0")
  })

  it("throws when there is none or it is not pinned", () => {
    expect(() => upstreamRechartsVersion({ dependencies: ["cn"] })).toThrow()
    expect(() => upstreamRechartsVersion({ dependencies: ["recharts@^3.8.0"] })).toThrow()
    expect(() => upstreamRechartsVersion({ dependencies: ["recharts"] })).toThrow()
  })
})

describe("assertVersion", () => {
  it("accepts release and prerelease versions and rejects anything that is not a path-safe version", () => {
    for (const v of ["3.8.0", "3.10.1", "3.9.0-beta.1"]) expect(() => assertVersion(v)).not.toThrow()
    for (const v of ["3.8", "latest", "../3.8.0", "3.8.0; rm -rf /", "v3.8.0", ""]) expect(() => assertVersion(v)).toThrow()
  })
})
