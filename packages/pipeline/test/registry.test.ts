import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { shimFile } from "../src/convert.ts"

type Item = {
  name: string
  type: string
  dependencies?: string[]
  registryDependencies?: string[]
  files: { path: string; target?: string }[]
}

// the output of `pnpm generate`, committed next to the sources
const registry: { items: Item[] } = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../registry/registry.json"), "utf8")
)
const item = (name: string) => registry.items.find((i) => i.name === name)!

describe("generated registry", () => {
  it("ships a shim as its own file under src/lib/shims with the packages it imports", () => {
    expect(item("shim-embla-carousel-react")).toMatchObject({
      type: "registry:lib",
      dependencies: ["embla-carousel", "embla-carousel-reactive-utils"],
      files: [
        {
          path: "src/shims/embla-carousel-react.ts",
          target: "src/lib/shims/embla-carousel-react.ts",
        },
      ],
    })
  })

  it("makes an item that imports a shimmed package depend on the shim, not on the React package", () => {
    const carousel = item("carousel")
    expect(carousel.registryDependencies).toContain("@preactcn/shim-embla-carousel-react")
    expect(carousel.dependencies).not.toContain("embla-carousel-react")
  })

  it.each([
    ["input-otp", "input-otp"],
    ["command", "cmdk"],
    ["sonner", "sonner"],
    ["drawer", "vaul"],
    ["resizable", "react-resizable-panels"],
    ["combobox", "@base-ui/react"],
    ["calendar", "react-day-picker"],
  ])("runs %s on its shim without preact/compat", (name, pkg) => {
    const ui = item(name)
    expect(ui.registryDependencies).toContain(`@preactcn/shim-${shimFile(pkg)}`)
    expect(ui.dependencies ?? []).not.toContain(pkg)
  })

  it("runs chart on the @preactcn/recharts package, pinned to the version in packages/recharts", () => {
    const { version } = JSON.parse(readFileSync(join(import.meta.dirname, "../../recharts/package.json"), "utf8"))
    expect(item("chart").dependencies).toEqual([`@preactcn/recharts@${version}`])
  })

  it("ships a hook together with the lib file it imports, and the hook that upstream's code-block pulls in", () => {
    expect(item("use-highlighted-code")).toMatchObject({
      dependencies: ["shiki"],
      files: [
        { path: "src/hooks/use-highlighted-code.ts", type: "registry:hook" },
        { path: "src/libs/highlighter.tsx", type: "registry:lib" },
      ],
    })
    expect(item("code-block").registryDependencies).toContain("@preactcn/use-highlighted-code")
  })

  it("depends on no React package", () => {
    expect(registry.items.flatMap((i) => i.dependencies ?? []).filter((d) => /^react(-dom)?(@|$)/.test(d))).toEqual([])
  })

  it("ships the shims for next-themes and sonner's styles as one item each", () => {
    expect(item("shim-next-themes")).toBeDefined()
    expect(item("shim-sonner").files.map((f) => f.target)).toContain("src/lib/shims/internal/sonner-styles.ts")
  })

  it.each([
    ["message-scroller", "shadcn-react-message-scroller"],
    ["questionnaire", "shadcn-react-questionnaire"],
  ])("runs %s on its @shadcn/react subpath shim without the package or preact/compat", (name, shim) => {
    const ui = item(name)
    expect(ui.registryDependencies).toContain(`@preactcn/shim-${shim}`)
    expect(ui.dependencies ?? []).not.toContain("@shadcn/react")
  })

  it("ships the react-day-picker shim with date-fns and its locale subpath as a second shim on top of it", () => {
    expect(item("shim-react-day-picker").dependencies).toEqual(["@date-fns/tz", "date-fns"])
    expect(item("shim-react-day-picker-locale")).toMatchObject({
      dependencies: ["date-fns"],
      registryDependencies: ["@preactcn/shim-react-day-picker"],
      files: [{ target: "src/lib/shims/react-day-picker-locale.ts" }],
    })
  })

  it("ships the vaul shim with its styles and the dialog shim it builds on", () => {
    const vaul = item("shim-vaul")
    expect(vaul.files.map((f) => f.target)).toContain("src/lib/shims/internal/vaul-styles.ts")
    expect(vaul.registryDependencies).toContain("@preactcn/radix-dialog")
  })

  it("ships the Base UI shim with every file it reaches, across the radix and shims roots", () => {
    const base = item("shim-base-ui-react")
    expect(base.dependencies).toContain("@floating-ui/dom")
    expect(base.files.map((f) => f.target)).toEqual(
      expect.arrayContaining([
        "src/lib/shims/base-ui-react.tsx",
        "src/lib/shims/internal/base-ui-combobox.tsx",
        "src/lib/shims/internal/base-ui-combobox-position.ts",
        "src/lib/shims/internal/shadcn-react-use-render.ts",
        "src/lib/radix/internal/dismissable-layer.ts",
        "src/lib/radix/internal/presence.tsx",
        "src/lib/radix/internal/modal-layer.ts",
      ])
    )
  })
})
