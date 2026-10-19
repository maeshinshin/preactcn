import { describe, expect, it } from "vitest"
import { assertTag, wanted } from "../src/sync.ts"

describe("assertTag", () => {
  it("accepts a shadcn release tag", () => {
    expect(() => assertTag("shadcn@4.21.4")).not.toThrow()
  })

  it("rejects other packages, bare versions and shell input", () => {
    for (const tag of ["@shadcn/registry@0.1.3", "4.21.4", "shadcn@4.21", "shadcn@4.21.4; rm -rf /", "shadcn@latest"])
      expect(() => assertTag(tag)).toThrow()
  })
})

describe("wanted", () => {
  it("keeps converted item types that have files, sorted", () => {
    const items = [
      { name: "b", type: "registry:ui", files: [{}] },
      { name: "a", type: "registry:example", files: [{}] },
      { name: "form", type: "registry:ui", files: [] },
      { name: "font-geist", type: "registry:font" },
      { name: "login-01", type: "registry:block", files: [{}] },
    ]
    expect(wanted(items)).toEqual(["a", "b"])
  })
})
