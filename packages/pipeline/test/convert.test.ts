import { describe, expect, it } from "vitest"
import { analyzeSource, convertSource, shimFile } from "../src/convert.ts"

describe("cn import", () => {
  it('points "cn" at "@/lib/utils"', () => {
    const out = convertSource('import { cn } from "cn"\n\ncn("a")\n')
    expect(out).toBe('import { cn } from "@/lib/utils"\n\ncn("a")\n')
  })
})

describe("radix-ui imports", () => {
  it("rewrites an aliased member into a namespace import of its family", () => {
    const out = convertSource(
      'import { Dialog as DialogPrimitive } from "radix-ui"\n')
    expect(out).toBe('import * as DialogPrimitive from "@/lib/radix/dialog"\n')
  })

  it("kebab-cases multi-word families", () => {
    const out = convertSource(
      'import { AlertDialog as AlertDialogPrimitive } from "radix-ui"\n')
    expect(out).toBe(
      'import * as AlertDialogPrimitive from "@/lib/radix/alert-dialog"\n'
    )
  })

  it("keeps the member name when there is no alias", () => {
    const out = convertSource('import { Slot } from "radix-ui"\n')
    expect(out).toBe('import * as Slot from "@/lib/radix/slot"\n')
  })

  it("splits several specifiers into one import per family", () => {
    const out = convertSource(
      'import { Dialog as DialogPrimitive, Slot } from "radix-ui"\n')
    expect(out).toBe(
      'import * as DialogPrimitive from "@/lib/radix/dialog"\n' +
        'import * as Slot from "@/lib/radix/slot"\n'
    )
  })

  it("throws on a member that has no shim family", () => {
    expect(() =>
      convertSource('import { Portal } from "radix-ui"\n')
    ).toThrow(/Portal/)
  })

  it("throws on a namespace import of radix-ui", () => {
    expect(() =>
      convertSource('import * as Radix from "radix-ui"\n')
    ).toThrow(/radix-ui/)
  })
})

describe("shimmed React packages", () => {
  const carousel =
    'import useEmblaCarousel, {\n  type UseEmblaCarouselType,\n} from "embla-carousel-react"\n'

  it("points the import at the local shim and keeps the imported names", () => {
    expect(convertSource(carousel)).toBe(
      'import useEmblaCarousel, {\n  type UseEmblaCarouselType,\n} from "@/lib/shims/embla-carousel-react"\n'
    )
  })

  it("also rewrites re-exports", () => {
    expect(
      convertSource('export { default } from "embla-carousel-react"\n')
    ).toBe('export { default } from "@/lib/shims/embla-carousel-react"\n')
  })

  it("throws on a subpath import, which the shim does not cover", () => {
    const sub = 'import x from "embla-carousel-react/foo"\n'
    expect(() => convertSource(sub)).toThrow(/embla-carousel-react\/foo/)
    expect(() => analyzeSource(sub)).toThrow(/embla-carousel-react\/foo/)
  })

  it("names the shim file after the package, scope dropped", () => {
    expect(shimFile("embla-carousel-react")).toBe("embla-carousel-react")
    expect(shimFile("@shadcn/react")).toBe("shadcn-react")
    expect(shimFile("@shadcn/react/message-scroller")).toBe("shadcn-react-message-scroller")
  })

  it("reports the shim instead of a package", () => {
    const out = analyzeSource(carousel)
    expect(out.shims).toEqual(["embla-carousel-react"])
    expect(out.packages).toEqual([])
  })

  it("converts a file that only imports shimmed packages with the React rules", () => {
    const out = convertSource(
      'import * as React from "react"\n' + carousel + "\nconst [a, b] = React.useState(0)\n")
    expect(out).toContain('import { useState } from "preact/hooks"')
    expect(out).not.toContain('"react"')
  })
})

describe("shimmed subpaths of a React package", () => {
  const scroller = 'import { MessageScroller } from "@shadcn/react/message-scroller"\n'

  it("points a registered subpath at its own shim", () => {
    expect(convertSource(scroller)).toBe(
      'import { MessageScroller } from "@/lib/shims/shadcn-react-message-scroller"\n'
    )
  })

  it("reports the shim, and no package", () => {
    const out = analyzeSource(scroller)
    expect(out.shims).toEqual(["shadcn-react-message-scroller"])
    expect(out.packages).toEqual([])
  })

  it("throws on an unregistered subpath of the same package", () => {
    expect(() => convertSource(scroller + 'import { Other } from "@shadcn/react/other"\n')).toThrow(/@shadcn\/react\/other.*no Preact shim/)
  })
})

describe("React packages replaced by an npm package", () => {
  const imports = 'import * as RechartsPrimitive from "recharts"\nimport type { TooltipValueType } from "recharts"\n'

  it("points the import at the Preact package, for plain, type and namespace imports", () => {
    expect(convertSource(imports)).toBe(
      'import * as RechartsPrimitive from "@preactcn/recharts"\nimport type { TooltipValueType } from "@preactcn/recharts"\n'
    )
  })

  it("throws on a subpath import, which the package does not export", () => {
    const sub = 'import x from "recharts/types/util"\n'
    expect(() => convertSource(sub)).toThrow(/recharts\/types\/util/)
    expect(() => analyzeSource(sub)).toThrow(/recharts\/types\/util/)
  })

  it("reports the Preact package as a dependency", () => {
    const out = analyzeSource(imports)
    expect(out.packages).toEqual(["@preactcn/recharts"])
  })
})

describe("React-only packages", () => {
  it("throws on a library that needs React and has no shim, so the item is quarantined", () => {
    expect(() => convertSource('import { useForm } from "react-hook-form"\n')).toThrow(/react-hook-form.*no Preact shim/)
  })
})

describe("IconPlaceholder", () => {
  const imp =
    'import { IconPlaceholder } from "@/app/(create)/components/icon-placeholder"\n'

  it("becomes the lucide component and drops the other icon libraries", () => {
    const out = convertSource(
      imp +
        "\nconst a = (\n  <IconPlaceholder\n    lucide=\"CheckIcon\"\n    tabler=\"IconCheck\"\n    hugeicons=\"Tick02Icon\"\n    phosphor=\"CheckIcon\"\n    remixicon=\"RiCheckLine\"\n  />\n)\n")
    expect(out).toBe(
      'import { CheckIcon } from "lucide-preact"\n\nconst a = (\n  <CheckIcon />\n)\n'
    )
  })

  it("keeps the remaining props in place", () => {
    const out = convertSource(
      imp +
        '\nconst a = <IconPlaceholder lucide="XIcon" tabler="IconX" className="size-4" data-icon="inline-end" />\n')
    expect(out).toContain(
      '<XIcon className="size-4" data-icon="inline-end" />'
    )
  })

  it("keeps remaining props on their own lines in a multi-line element", () => {
    const out = convertSource(
      imp +
        '\nconst a = (\n  <IconPlaceholder\n    lucide="XIcon"\n    tabler="IconX"\n    className="size-4"\n  />\n)\n')
    expect(out).toContain('<XIcon\n    className="size-4"\n  />')
  })

  it("keeps spread props", () => {
    const out = convertSource(
      imp + '\nconst a = <IconPlaceholder lucide="XIcon" {...props} />\n')
    expect(out).toContain("<XIcon {...props} />")
  })

  it("imports each icon once, sorted, in one statement", () => {
    const out = convertSource(
      imp +
        '\nconst a = <><IconPlaceholder lucide="XIcon" /><IconPlaceholder lucide="CheckIcon" /><IconPlaceholder lucide="XIcon" /></>\n')
    expect(out.split("\n")[0]).toBe('import { CheckIcon, XIcon } from "lucide-preact"')
  })

  it("wraps a long import over several lines", () => {
    const names = ["ChevronDownIcon", "ChevronLeftIcon", "ChevronRightIcon", "ChevronUpIcon"]
    const body = names
      .map((n) => `<IconPlaceholder lucide="${n}" />`)
      .join("")
    const out = convertSource(imp + `\nconst a = <>${body}</>\n`)
    expect(out).toContain(
      'import {\n  ChevronDownIcon,\n  ChevronLeftIcon,\n  ChevronRightIcon,\n  ChevronUpIcon,\n} from "lucide-preact"\n'
    )
  })

  it("throws when the lucide prop is not a string literal", () => {
    expect(() =>
      convertSource(imp + "\nconst a = <IconPlaceholder lucide={name} />\n")
    ).toThrow(/lucide/)
  })

  it("throws when the lucide prop is missing", () => {
    expect(() =>
      convertSource(imp + '\nconst a = <IconPlaceholder tabler="IconX" />\n')
    ).toThrow(/lucide/)
  })
})

describe("registry path rewrites", () => {
  it.each([
    ["@/registry/radix-nova/ui/button", "@/components/ui/button"],
    ["@/registry/radix-nova/components/example", "@/components/example"],
    ["@/registry/radix-nova/hooks/use-mobile", "@/hooks/use-mobile"],
    ["@/registry/radix-nova/lib/utils", "@/lib/utils"],
    ["@/registry/radix-nova/lib/highlighter", "@/lib/highlighter"],
  ])("%s -> %s", (from, to) => {
    const out = convertSource(`import { X } from "${from}"\n`)
    expect(out).toBe(`import { X } from "${to}"\n`)
  })

  it("rewrites multi-line import specifiers", () => {
    const out = convertSource(
      'import {\n  Example,\n  ExampleWrapper,\n} from "@/registry/radix-nova/components/example"\n')
    expect(out).toBe(
      'import {\n  Example,\n  ExampleWrapper,\n} from "@/components/example"\n'
    )
  })

  it("throws on an unknown radix-nova path", () => {
    expect(() =>
      convertSource('import { X } from "@/registry/radix-nova/blocks/x"\n')
    ).toThrow(/blocks/)
  })
})

describe("React to Preact", () => {
  const react = 'import * as React from "react"\n'

  it("drops the React import when nothing from it is used", () => {
    expect(convertSource(react + "\nconst a = 1\n")).toBe(
      "\nconst a = 1\n"
    )
  })

  it("maps ComponentProps variants to ComponentProps from preact", () => {
    const out = convertSource(
      react +
        '\ntype A = React.ComponentProps<"div">\ntype B = React.ComponentPropsWithRef<"p">\ntype C = React.ComponentPropsWithoutRef<"p">\n')
    expect(out).toBe(
      'import type { ComponentProps } from "preact"\n\ntype A = ComponentProps<"div">\ntype B = ComponentProps<"p">\ntype C = ComponentProps<"p">\n'
    )
  })

  it("casts a spread of style, which Preact types as a string or signal as well", () => {
    const out = convertSource(react + "\nconst a = { x: 1, ...style }\n")
    expect(out).toBe(
      'import type { CSSProperties } from "preact"\n\nconst a = { x: 1, ...(style as CSSProperties) }\n'
    )
  })

  it("maps ReactNode and ComponentType", () => {
    const out = convertSource(
      react +
        "\ntype A = { c: React.ReactNode; k: React.ComponentType }\n")
    expect(out).toBe(
      'import type { ComponentChildren, ComponentType } from "preact"\n\ntype A = { c: ComponentChildren; k: ComponentType }\n'
    )
  })

  it("maps CSSProperties to the top-level CSSProperties type of preact", () => {
    const out = convertSource(
      react + "\nconst s = {} as React.CSSProperties\n")
    expect(out).toBe(
      'import type { CSSProperties } from "preact"\n\nconst s = {} as CSSProperties\n'
    )
  })

  it("maps createContext and Fragment to value imports from preact", () => {
    const out = convertSource(
      react +
        "\nconst C = React.createContext<number | null>(null)\nconst f = <React.Fragment key=\"a\">x</React.Fragment>\n")
    expect(out).toBe(
      'import { createContext, Fragment } from "preact"\n\nconst C = createContext<number | null>(null)\nconst f = <Fragment key="a">x</Fragment>\n'
    )
  })

  it("maps hooks to preact/hooks", () => {
    const out = convertSource(
      react +
        "\nfunction f() {\n  const [a, setA] = React.useState(0)\n  React.useEffect(() => {}, [])\n  return React.useId()\n}\n")
    expect(out).toBe(
      'import { useEffect, useId, useState } from "preact/hooks"\n\nfunction f() {\n  const [a, setA] = useState(0)\n  useEffect(() => {}, [])\n  return useId()\n}\n'
    )
  })

  it("maps keyboard and form events to the top-level Targeted event types", () => {
    const out = convertSource(
      react +
        "\ntype K = React.KeyboardEvent<HTMLDivElement>\ntype F = React.FormEvent<HTMLFormElement>\ntype M = React.MouseEvent<HTMLButtonElement>\n")
    expect(out).toBe(
      'import type {\n  TargetedEvent,\n  TargetedKeyboardEvent,\n  TargetedMouseEvent,\n} from "preact"\n\ntype K = TargetedKeyboardEvent<HTMLDivElement>\ntype F = TargetedEvent<HTMLFormElement>\ntype M = TargetedMouseEvent<HTMLButtonElement>\n'
    )
  })

  it("never emits the JSX namespace, which Preact 11 no longer fills with these types", () => {
    const members = [
      "ComponentProps<\"div\">",
      "ReactNode",
      "ComponentType",
      "CSSProperties",
      "KeyboardEvent<HTMLElement>",
      "FormEvent<HTMLFormElement>",
      "ChangeEvent<HTMLInputElement>",
      "SyntheticEvent<HTMLElement>",
      "AnimationEvent<HTMLElement>",
      "ClipboardEvent<HTMLElement>",
      "CompositionEvent<HTMLElement>",
      "DragEvent<HTMLElement>",
      "FocusEvent<HTMLElement>",
      "MouseEvent<HTMLElement>",
      "PointerEvent<HTMLElement>",
      "TouchEvent<HTMLElement>",
      "TransitionEvent<HTMLElement>",
      "UIEvent<HTMLElement>",
      "WheelEvent<HTMLElement>",
    ]
    const source = react + members.map((m, i) => `type T${i} = React.${m}\n`).join("")
    const out = convertSource(source)
    expect(out).not.toContain("JSX")
    expect(out.split("\n")[0]).toMatch(/^import type \{ .* \} from "preact"$|^import type \{$/)
  })

  it("emits value, type and hooks imports side by side", () => {
    const out = convertSource(
      react +
        'type P = React.ComponentProps<"div">\nconst C = React.createContext(0)\nconst [a] = React.useState(0)\n')
    expect(out.split("\n").slice(0, 3)).toEqual([
      'import { createContext } from "preact"',
      'import type { ComponentProps } from "preact"',
      'import { useState } from "preact/hooks"',
    ])
  })

  it("moves named hook imports to preact/hooks", () => {
    const out = convertSource(
      'import { useMemo, useState } from "react"\n\nuseMemo(() => 1, [])\n')
    expect(out).toBe(
      'import { useMemo, useState } from "preact/hooks"\n\nuseMemo(() => 1, [])\n'
    )
  })

  it("renames named type imports at their use sites", () => {
    const out = convertSource(
      'import type { ReactNode } from "react"\n\nconst x: ReactNode = null\n')
    expect(out).toBe(
      'import type { ComponentChildren } from "preact"\n\nconst x: ComponentChildren = null\n'
    )
  })

  it("throws on a React member outside the table", () => {
    expect(() =>
      convertSource(react + "\nconst x = React.forwardRef(() => null)\n")
    ).toThrow(/forwardRef/)
  })

  it("throws on a bare use of the React namespace", () => {
    expect(() => convertSource(react + "\nconsole.log(React)\n")).toThrow(
      /React/
    )
  })

  it("throws when a new import name collides with a local declaration", () => {
    expect(() =>
      convertSource(
        react + 'type ComponentProps = number\ntype A = React.ComponentProps<"p">\n')
    ).toThrow(/ComponentProps/)
  })

  it("converts React.* used without any React import", () => {
    const out = convertSource(
      'import { cn } from "cn"\n\ntype A = React.ComponentProps<"div">\n')
    expect(out).toBe(
      'import type { ComponentProps } from "preact"\nimport { cn } from "@/lib/utils"\n\ntype A = ComponentProps<"div">\n'
    )
  })

  it("converts React.* used next to a named import from react", () => {
    const out = convertSource(
      'import { useMemo } from "react"\n\ntype A = React.ComponentProps<"div">\n\nuseMemo(() => 1, [])\n')
    expect(out).toBe(
      'import type { ComponentProps } from "preact"\nimport { useMemo } from "preact/hooks"\n\ntype A = ComponentProps<"div">\n\nuseMemo(() => 1, [])\n'
    )
  })

  it("uses LucideProps for ComponentProps<\"svg\"> in files with icons", () => {
    const out = convertSource(
      'import { IconPlaceholder } from "@/app/(create)/components/icon-placeholder"\n\nfunction S(props: React.ComponentProps<"svg">) {\n  return <IconPlaceholder lucide="Loader2Icon" {...props} />\n}\n')
    expect(out).toBe(
      'import { Loader2Icon, type LucideProps } from "lucide-preact"\n\nfunction S(props: LucideProps) {\n  return <Loader2Icon {...props} />\n}\n'
    )
  })
})

describe("svg attributes", () => {
  const svg = 'const a = <line strokeLinecap="round" strokeWidth="32" clipPath="url(#a)" viewBox="0 0 1 1" />\n'

  it("writes camelCase presentation attributes of intrinsic elements in kebab-case", () => {
    expect(convertSource(svg)).toBe(
      'const a = <line stroke-linecap="round" stroke-width="32" clip-path="url(#a)" viewBox="0 0 1 1" />\n'
    )
  })

  it("leaves component props alone", () => {
    const component = "const a = <Chart strokeWidth={2} />\n"
    expect(convertSource(component)).toBe(component)
  })
})

describe("untouched code", () => {
  it("leaves unrelated formatting byte-identical", () => {
    const body =
      '\nconst x   =  {a:1,\n   b:   "two"}\n\n\nfunction   f( a ){return a}\n'
    const out = convertSource('import { cn } from "cn"\n' + body)
    expect(out).toBe('import { cn } from "@/lib/utils"\n' + body)
  })

  it("leaves a directive prologue alone", () => {
    const out = convertSource('"use client"\n\nimport { cn } from "cn"\n')
    expect(out).toBe('"use client"\n\nimport { cn } from "@/lib/utils"\n')
  })
})

describe("analyzeSource", () => {
  const src = [
    '"use client"',
    'import * as React from "react"',
    'import { cn } from "cn"',
    'import { Dialog as DialogPrimitive, Slot } from "radix-ui"',
    'import { cva } from "class-variance-authority"',
    'import { Button } from "@/registry/radix-nova/ui/button"',
    'import { useIsMobile } from "@/registry/radix-nova/hooks/use-mobile"',
    'import { Example } from "@/registry/radix-nova/components/example"',
    'import { IconPlaceholder } from "@/app/(create)/components/icon-placeholder"',
    'import { Area } from "recharts"',
    'import { useForm } from "react-hook-form"',
    'import { DayPicker } from "react-day-picker"',
    'import { es } from "react-day-picker/locale"',
    "",
  ].join("\n")

  it("reports what the item needs", () => {
    expect(analyzeSource(src)).toEqual({
      usesCn: true,
      usesIcons: true,
      radixFamilies: ["dialog", "slot"],
      ui: ["button"],
      hooks: ["use-mobile"],
      example: true,
      libs: [],
      shims: ["react-day-picker", "react-day-picker-locale"],
      packages: ["@preactcn/recharts", "class-variance-authority", "react-hook-form"],
      unresolved: [],
    })
  })

  it("lists the lib files an item imports besides utils", () => {
    const out = analyzeSource(
      'import { cn } from "@/registry/radix-nova/lib/utils"\nimport { load } from "@/registry/radix-nova/lib/highlighter"\n'
    )
    expect(out.libs).toEqual(["highlighter"])
    expect(out.usesCn).toBe(true)
  })

  it("lists imports that no rule handles", () => {
    const out = analyzeSource(
      'import Image from "next/image"\nimport { x } from "@/lib/ai"\n'
    )
    expect(out.unresolved).toEqual(["next/image", "@/lib/ai"])
  })
})
