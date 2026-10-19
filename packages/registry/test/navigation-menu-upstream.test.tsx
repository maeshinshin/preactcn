import { createRef, type ComponentProps } from "preact"
import { fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, test } from "vitest"
import { flush, setupUser, useFakeTimers } from "./helpers"
import * as NavigationMenuPrimitive from "../src/radix/navigation-menu"

// The wrapper written the way the pipeline turns the upstream shadcn component into Preact code (class strings left out)
function NavigationMenu({
  className,
  children,
  viewport = true,
  ...props
}: ComponentProps<typeof NavigationMenuPrimitive.Root> & {
  viewport?: boolean
}) {
  return (
    <NavigationMenuPrimitive.Root data-slot="navigation-menu" data-viewport={viewport} className={["group/navigation-menu", className].join(" ")} {...props}>
      {children}
      {viewport && <NavigationMenuViewport />}
    </NavigationMenuPrimitive.Root>
  )
}

function NavigationMenuList({ className, ...props }: ComponentProps<typeof NavigationMenuPrimitive.List>) {
  return <NavigationMenuPrimitive.List data-slot="navigation-menu-list" className={["group", className].join(" ")} {...props} />
}

function NavigationMenuItem({ className, ...props }: ComponentProps<typeof NavigationMenuPrimitive.Item>) {
  return <NavigationMenuPrimitive.Item data-slot="navigation-menu-item" className={["relative", className].join(" ")} {...props} />
}

function NavigationMenuTrigger({ className, children, ...props }: ComponentProps<typeof NavigationMenuPrimitive.Trigger>) {
  return (
    <NavigationMenuPrimitive.Trigger data-slot="navigation-menu-trigger" className={["group", className].join(" ")} {...props}>
      {children} <svg aria-hidden="true" />
    </NavigationMenuPrimitive.Trigger>
  )
}

function NavigationMenuContent({ className, ...props }: ComponentProps<typeof NavigationMenuPrimitive.Content>) {
  return <NavigationMenuPrimitive.Content data-slot="navigation-menu-content" className={["top-0", className].join(" ")} {...props} />
}

function NavigationMenuViewport({ className, ...props }: ComponentProps<typeof NavigationMenuPrimitive.Viewport>) {
  return (
    <div className="absolute top-full left-0 isolate z-50 flex justify-center" data-testid="viewport-frame">
      <NavigationMenuPrimitive.Viewport data-slot="navigation-menu-viewport" className={["origin-top-center", className].join(" ")} {...props} />
    </div>
  )
}

function NavigationMenuLink({ className, ...props }: ComponentProps<typeof NavigationMenuPrimitive.Link>) {
  return <NavigationMenuPrimitive.Link data-slot="navigation-menu-link" className={["flex", className].join(" ")} {...props} />
}

function NavigationMenuIndicator({ className, ...props }: ComponentProps<typeof NavigationMenuPrimitive.Indicator>) {
  return (
    <NavigationMenuPrimitive.Indicator data-slot="navigation-menu-indicator" className={["top-full", className].join(" ")} {...props}>
      <div className="relative top-[60%] h-2 w-2 rotate-45" />
    </NavigationMenuPrimitive.Indicator>
  )
}

// The next/link shim the examples get
const Link = (props: ComponentProps<"a">) => <a {...props} />

function Example({ viewport }: { viewport?: boolean }) {
  return (
    <NavigationMenu viewport={viewport}>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Getting started</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul>
              <li>
                <NavigationMenuLink asChild>
                  <Link href="/docs" onClick={(event) => event.preventDefault()}>
                    Introduction
                  </Link>
                </NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink asChild className="trigger-style">
            <Link href="/docs">Documentation</Link>
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
      <NavigationMenuIndicator />
    </NavigationMenu>
  )
}

useFakeTimers()

describe("upstream navigation menu wrapper", () => {
  test("with the default Viewport the content opens inside it, in the frame the wrapper puts around it", async () => {
    const user = setupUser()
    const { container } = render(<Example />)
    const nav = container.querySelector("nav")!
    expect(nav.getAttribute("data-slot")).toBe("navigation-menu")
    expect(nav.getAttribute("data-viewport")).toBe("true")
    expect(nav.className).toContain("group/navigation-menu")

    await user.click(screen.getByRole("button", { name: "Getting started" }))
    await flush(200)
    await flush()
    const content = container.querySelector("[data-slot=navigation-menu-content]")!
    const viewport = container.querySelector("[data-slot=navigation-menu-viewport]")!
    expect(content.parentElement).toBe(viewport)
    expect(viewport.parentElement).toBe(screen.getByTestId("viewport-frame"))
    expect(screen.getByRole("link", { name: "Introduction" }).getAttribute("data-slot")).toBe("navigation-menu-link")
  })

  test("with viewport={false} the content opens in place and the viewport frame is not rendered", async () => {
    const user = setupUser()
    const { container } = render(<Example viewport={false} />)
    expect(container.querySelector("nav")!.getAttribute("data-viewport")).toBe("false")
    await user.click(screen.getByRole("button", { name: "Getting started" }))
    await flush(200)
    const content = container.querySelector("[data-slot=navigation-menu-content]")!
    expect(content.parentElement).toBe(container.querySelector("[data-slot=navigation-menu-item]"))
    expect(screen.queryByTestId("viewport-frame")).toBeNull()
    expect(content.getAttribute("data-state")).toBe("open")
  })

  test("a link that is asChild keeps the wrapper's slot and class, and the trigger renders its icon after the label", () => {
    const { container } = render(<Example />)
    const link = screen.getByRole("link", { name: "Documentation" })
    expect(link.getAttribute("data-slot")).toBe("navigation-menu-link")
    expect(link.className).toContain("flex")
    expect(link.className).toContain("trigger-style")
    const trigger = screen.getByRole("button", { name: "Getting started" })
    expect(trigger.querySelector("svg")).not.toBeNull()
    expect(container.querySelector("[data-slot=navigation-menu-trigger]")).toBe(trigger)
  })

  test("the Indicator wrapper renders its arrow inside the primitive's element", async () => {
    render(<Example viewport={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Getting started" }))
    await flush()
    await flush()
    const indicator = document.querySelector("[data-slot=navigation-menu-indicator]")!
    expect(indicator.getAttribute("data-state")).toBe("visible")
    expect(indicator.firstElementChild!.className).toContain("rotate-45")
  })
})

describe("prop types", () => {
  test("parts accept a ref of any element type and a handler with a narrower argument", () => {
    // `pnpm typecheck` is the assertion
    const ref = createRef<HTMLDivElement>()
    const onValueChange = (value: string) => void value
    render(
      <NavigationMenuPrimitive.Root onValueChange={onValueChange}>
        <NavigationMenuPrimitive.List>
          <NavigationMenuPrimitive.Item value="a">
            <NavigationMenuPrimitive.Trigger ref={ref} />
            <NavigationMenuPrimitive.Link ref={ref} onSelect={(event: Event) => void event} />
          </NavigationMenuPrimitive.Item>
        </NavigationMenuPrimitive.List>
      </NavigationMenuPrimitive.Root>
    )
    expect(ref.current).not.toBeNull()
  })
})
