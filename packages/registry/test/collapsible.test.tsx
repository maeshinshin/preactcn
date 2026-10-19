import { useState } from "preact/hooks"
import { act, render, screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, test, vi } from "vitest"
import * as Collapsible from "../src/radix/collapsible"

type RootProps = Parameters<typeof Collapsible.Root>[0]

function Basic(props: Partial<RootProps>) {
  return (
    <Collapsible.Root data-testid="root" {...props}>
      <Collapsible.CollapsibleTrigger>Toggle</Collapsible.CollapsibleTrigger>
      <Collapsible.CollapsibleContent data-testid="content">Content</Collapsible.CollapsibleContent>
    </Collapsible.Root>
  )
}

afterEach(() => vi.restoreAllMocks())

describe("collapsible", () => {
  test("closed by default: aria-expanded false, content hidden and empty", () => {
    render(<Basic />)
    const trigger = screen.getByRole("button")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(trigger.getAttribute("data-state")).toBe("closed")
    expect(trigger.getAttribute("type")).toBe("button")
    expect(screen.getByTestId("root").getAttribute("data-state")).toBe("closed")
    const content = screen.getByTestId("content")
    expect(content.hasAttribute("hidden")).toBe(true)
    expect(content.textContent).toBe("")
  })

  test("click toggles, wires aria-controls to the content id", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<Basic onOpenChange={onOpenChange} />)
    const trigger = screen.getByRole("button")
    expect(trigger.hasAttribute("aria-controls")).toBe(false)
    await user.click(trigger)
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(trigger.getAttribute("data-state")).toBe("open")
    const content = screen.getByTestId("content")
    expect(content.textContent).toBe("Content")
    expect(content.getAttribute("data-state")).toBe("open")
    expect(content.id).toBe(trigger.getAttribute("aria-controls"))
    expect(content.hasAttribute("hidden")).toBe(false)
    await user.keyboard("{Enter}")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(content.hasAttribute("hidden")).toBe(true)
    expect(content.textContent).toBe("")
  })

  test("defaultOpen and controlled open", async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Basic defaultOpen />)
    expect(screen.getByTestId("content")).not.toBeNull()
    unmount()
    function Parent() {
      const [open, setOpen] = useState(false)
      return <Basic open={open} onOpenChange={setOpen} />
    }
    render(<Parent />)
    await user.click(screen.getByRole("button"))
    expect(screen.getByTestId("content")).not.toBeNull()
  })

  test("controlled open ignores clicks without a handler", async () => {
    const user = userEvent.setup()
    render(<Basic open={false} />)
    await user.click(screen.getByRole("button"))
    expect(screen.getByTestId("content").hasAttribute("hidden")).toBe(true)
  })

  test("disabled", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<Basic disabled onOpenChange={onOpenChange} />)
    const trigger = screen.getByRole("button")
    await user.click(trigger)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(trigger.getAttribute("data-disabled")).toBe("")
    expect(screen.getByTestId("root").getAttribute("data-disabled")).toBe("")
  })

  test("asChild trigger and root", async () => {
    const user = userEvent.setup()
    render(
      <Collapsible.Root asChild>
        <section data-testid="root">
          <Collapsible.CollapsibleTrigger asChild>
            <a href="#x">go</a>
          </Collapsible.CollapsibleTrigger>
          <Collapsible.CollapsibleContent>c</Collapsible.CollapsibleContent>
        </section>
      </Collapsible.Root>
    )
    expect(screen.getByTestId("root").tagName).toBe("SECTION")
    await user.click(screen.getByRole("link"))
    expect(screen.getByRole("link").getAttribute("aria-expanded")).toBe("true")
  })

  test("exposes the measured size as CSS variables", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ width: 120, height: 40 } as DOMRect)
    render(<Basic defaultOpen />)
    const style = screen.getByTestId("content").style
    expect(style.getPropertyValue("--radix-collapsible-content-height")).toBe("40px")
    expect(style.getPropertyValue("--radix-collapsible-content-width")).toBe("120px")
  })

  test("keeps the content visible with data-state closed until the exit animation ends", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "getComputedStyle").mockImplementation((node) => {
      return {
        get animationName() {
          return (node as HTMLElement).getAttribute("data-state") === "closed" ? "slide-up" : "slide-down"
        },
        display: "block",
      } as CSSStyleDeclaration
    })
    render(<Basic defaultOpen />)
    await user.click(screen.getByRole("button"))
    const content = screen.getByTestId("content")
    expect(content.getAttribute("data-state")).toBe("closed")
    expect(content.hasAttribute("hidden")).toBe(false)
    expect(content.textContent).toBe("Content")
    act(() => {
      content.dispatchEvent(Object.assign(new Event("animationend", { bubbles: true }), { animationName: "slide-up" }))
    })
    expect(content.hasAttribute("hidden")).toBe(true)
    expect(content.textContent).toBe("")
  })
})
