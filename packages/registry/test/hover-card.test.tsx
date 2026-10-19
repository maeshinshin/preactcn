import { type ComponentProps } from "preact"
import { fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
import { flush, mockAnimations, mockLayout, setupUser, useFakeTimers } from "./helpers"
import * as HoverCard from "../src/radix/hover-card"

function Example({ root, content }: { root?: ComponentProps<typeof HoverCard.Root>; content?: Partial<ComponentProps<typeof HoverCard.Content>> }) {
  return (
    <HoverCard.Root {...root}>
      <HoverCard.Trigger data-testid="trigger" href="/profile">
        @nextjs
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content data-testid="content" sideOffset={4} {...content}>
          <a href="/more">More</a>
          <button type="button">Follow</button>
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  )
}

const trigger = () => screen.getByTestId("trigger")
const content = () => screen.queryByTestId("content")

useFakeTimers()

describe("hover card", () => {
  test("is closed by default and the trigger is a link", () => {
    render(<Example />)
    expect(content()).toBeNull()
    expect(trigger().tagName).toBe("A")
    expect(trigger().getAttribute("data-state")).toBe("closed")
  })

  test("hovering opens it after openDelay, in a popper wrapper in body with the hover card variables", async () => {
    mockLayout({ anchor: { left: 100, top: 100, width: 50, height: 20 }, anchorId: "trigger" })
    const user = setupUser()
    const onOpenChange = vi.fn()
    render(<Example root={{ onOpenChange }} />)
    await user.hover(trigger())
    await flush(699)
    expect(content()).toBeNull()
    await flush(1)
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(content()).not.toBeNull()
    expect(trigger().getAttribute("data-state")).toBe("open")
    expect(content()!.getAttribute("data-state")).toBe("open")
    expect(content()!.parentElement!.hasAttribute("data-radix-popper-content-wrapper")).toBe(true)
    expect(content()!.parentElement!.parentElement).toBe(document.body)
    await flush(50)
    expect(content()!.getAttribute("data-side")).toBe("bottom")
    expect(content()!.parentElement!.style.transform).toBe("translate(85px, 124px)")
    const style = content()!.style
    expect(style.getPropertyValue("--radix-hover-card-content-transform-origin")).toBe("var(--radix-popper-transform-origin)")
    expect(style.getPropertyValue("--radix-hover-card-content-available-width")).toBe("var(--radix-popper-available-width)")
    expect(style.getPropertyValue("--radix-hover-card-content-available-height")).toBe("var(--radix-popper-available-height)")
    expect(style.getPropertyValue("--radix-hover-card-trigger-width")).toBe("var(--radix-popper-anchor-width)")
    expect(style.getPropertyValue("--radix-hover-card-trigger-height")).toBe("var(--radix-popper-anchor-height)")
  })

  test("leaving before openDelay never opens it", async () => {
    const user = setupUser()
    render(<Example root={{ openDelay: 500 }} />)
    await user.hover(trigger())
    await flush(300)
    await user.unhover(trigger())
    // Past the moment it would have opened
    await flush(250)
    expect(content()).toBeNull()
    await flush(2000)
    expect(content()).toBeNull()
  })

  test("leaving closes it after closeDelay; entering the content keeps it open", async () => {
    const user = setupUser()
    render(<Example root={{ openDelay: 100, closeDelay: 300 }} />)
    await user.hover(trigger())
    await flush(100)
    expect(content()).not.toBeNull()
    await user.unhover(trigger())
    await flush(299)
    expect(content()).not.toBeNull()
    await user.hover(content()!)
    // Past the moment the pending close would have fired
    await flush(50)
    expect(content()).not.toBeNull()
    await flush(2000)
    expect(content()).not.toBeNull()
    await user.unhover(content()!)
    await flush(299)
    expect(content()).not.toBeNull()
    await flush(1)
    expect(content()).toBeNull()
    expect(trigger().getAttribute("data-state")).toBe("closed")
  })

  test("keyboard focus opens it and blur closes it, without moving focus into the card", async () => {
    const user = setupUser()
    render(<Example root={{ openDelay: 100, closeDelay: 100 }} />)
    await user.tab()
    expect(document.activeElement).toBe(trigger())
    await flush(100)
    expect(content()).not.toBeNull()
    expect(document.activeElement).toBe(trigger())
    await user.tab({ shift: true })
    await flush(100)
    expect(content()).toBeNull()
  })

  test("takes its links and buttons out of the tab order", async () => {
    const user = setupUser()
    render(<Example root={{ defaultOpen: true }} />)
    await flush()
    expect(screen.getByRole("link", { name: "More" }).getAttribute("tabindex")).toBe("-1")
    expect(screen.getByRole("button", { name: "Follow" }).getAttribute("tabindex")).toBe("-1")
    await user.tab()
    expect(document.activeElement).toBe(trigger())
    await user.tab()
    expect(document.activeElement).not.toBe(screen.getByRole("link", { name: "More" }))
  })

  test("Escape and a pointer down outside close it at once; focus moving elsewhere does not", async () => {
    const user = setupUser()
    render(
      <div>
        <button type="button">other</button>
        <Example root={{ defaultOpen: true, closeDelay: 10_000 }} />
      </div>
    )
    await flush()
    screen.getByRole("button", { name: "other" }).focus()
    await flush()
    expect(content()).not.toBeNull()
    await user.keyboard("{Escape}")
    await flush()
    expect(content()).toBeNull()
  })

  test("a pointer down outside closes it", async () => {
    render(<Example root={{ defaultOpen: true }} />)
    await flush()
    await flush()
    fireEvent.pointerDown(document.body)
    await flush()
    expect(content()).toBeNull()
  })

  test("touch pointers do not open or close it", async () => {
    render(<Example root={{ openDelay: 0 }} />)
    fireEvent.pointerEnter(trigger(), { pointerType: "touch" })
    await flush(100)
    expect(content()).toBeNull()
  })

  test("controlled and defaultOpen", async () => {
    const onOpenChange = vi.fn()
    const user = setupUser()
    const { rerender } = render(<Example root={{ open: false, onOpenChange, openDelay: 0 }} />)
    await user.hover(trigger())
    await flush()
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(content()).toBeNull()
    rerender(<Example root={{ open: true, onOpenChange }} />)
    await flush()
    expect(content()).not.toBeNull()
    rerender(<Example root={{ open: false, onOpenChange }} />)
    await flush()
    expect(content()).toBeNull()
  })

  test("defaultOpen mounts it open", async () => {
    render(<Example root={{ defaultOpen: true }} />)
    await flush()
    expect(content()).not.toBeNull()
  })

  test("stays mounted with data-state closed until the exit animation ends", async () => {
    const endAnimation = mockAnimations()
    const user = setupUser()
    render(<Example root={{ defaultOpen: true }} />)
    await flush()
    const open = content()!
    await flush()
    await user.keyboard("{Escape}")
    await flush()
    expect(content()).toBe(open)
    expect(open.getAttribute("data-state")).toBe("closed")
    endAnimation(open)
    await flush()
    expect(content()).toBeNull()
  })

  test("asChild trigger works with a plain function component", async () => {
    const user = setupUser()
    const Link = (props: any) => <a href="/x" {...props} />
    render(
      <HoverCard.Root openDelay={0}>
        <HoverCard.Trigger asChild>
          <Link>Profile</Link>
        </HoverCard.Trigger>
        <HoverCard.Portal>
          <HoverCard.Content data-testid="content">card</HoverCard.Content>
        </HoverCard.Portal>
      </HoverCard.Root>
    )
    const link = screen.getByRole("link", { name: "Profile" })
    await user.hover(link)
    await flush()
    expect(content()).not.toBeNull()
    expect(link.getAttribute("data-state")).toBe("open")
  })

  test("Content outside a HoverCard throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<HoverCard.Content />)).toThrow(/HoverCard/)
    spy.mockRestore()
  })
})
