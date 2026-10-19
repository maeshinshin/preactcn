import { type ComponentChildren, type ComponentProps } from "preact"
import { fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
import { flush, mockAnimations, mockLayout, setupUser, useFakeTimers } from "./helpers"
import * as Tooltip from "../src/radix/tooltip"

type RootProps = ComponentProps<typeof Tooltip.Root>

function Example({
  provider,
  root,
  content,
  label = "Add to library",
  children,
}: {
  provider?: ComponentProps<typeof Tooltip.Provider>
  root?: RootProps
  content?: Partial<ComponentProps<typeof Tooltip.Content>>
  label?: string
  children?: ComponentChildren
}) {
  return (
    <Tooltip.Provider {...provider}>
      <Tooltip.Root {...root}>
        <Tooltip.Trigger data-testid="trigger">Hover me</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content data-testid="content" {...content}>
            {label}
            {children}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}

const trigger = () => screen.getByTestId("trigger")
const content = () => screen.queryByTestId("content")

useFakeTimers()

describe("tooltip", () => {
  test("is closed by default and the trigger is a plain button without a popup role", () => {
    render(<Example />)
    expect(content()).toBeNull()
    expect(trigger().tagName).toBe("BUTTON")
    expect(trigger().hasAttribute("type")).toBe(false)
    expect(trigger().getAttribute("data-state")).toBe("closed")
    expect(trigger().hasAttribute("aria-describedby")).toBe(false)
  })

  test("hovering opens it after the delay and describes the trigger with a visually hidden tooltip", async () => {
    mockLayout({ anchor: { left: 100, top: 100, width: 50, height: 20 }, anchorId: "trigger" })
    const user = setupUser()
    const onOpenChange = vi.fn()
    render(<Example provider={{ delayDuration: 700 }} root={{ onOpenChange }} />)
    await user.hover(trigger())
    await flush(699)
    expect(content()).toBeNull()
    await flush(1)
    expect(content()).not.toBeNull()
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(trigger().getAttribute("data-state")).toBe("delayed-open")
    expect(content()!.getAttribute("data-state")).toBe("delayed-open")
    const tooltip = screen.getByRole("tooltip")
    expect(trigger().getAttribute("aria-describedby")).toBe(tooltip.id)
    expect(tooltip.textContent).toBe("Add to library")
    expect(tooltip.parentElement).toBe(content())
    expect(tooltip.style.position).toBe("absolute")
    expect(tooltip.style.width).toBe("1px")
    expect(tooltip.style.height).toBe("1px")
    expect(tooltip.style.margin).toBe("-1px")
    expect(content()!.parentElement!.hasAttribute("data-radix-popper-content-wrapper")).toBe(true)
    expect(content()!.parentElement!.parentElement).toBe(document.body)
    await flush(50)
    expect(content()!.getAttribute("data-side")).toBe("top")
    expect(content()!.style.getPropertyValue("--radix-tooltip-content-transform-origin")).toBe("var(--radix-popper-transform-origin)")
    expect(content()!.style.getPropertyValue("--radix-tooltip-trigger-width")).toBe("var(--radix-popper-anchor-width)")
  })

  test("leaving before the delay elapsed never opens it", async () => {
    const user = setupUser()
    render(<Example provider={{ delayDuration: 700 }} />)
    await user.hover(trigger())
    await flush(300)
    await user.unhover(trigger())
    await flush(1000)
    expect(content()).toBeNull()
  })

  test("leaving closes it after a short grace; entering the content keeps it open", async () => {
    const user = setupUser()
    render(<Example provider={{ delayDuration: 0 }} />)
    await user.hover(trigger())
    await flush()
    expect(content()).not.toBeNull()
    await user.unhover(trigger())
    await user.hover(content()!)
    await flush(1000)
    expect(content()).not.toBeNull()
    await user.unhover(content()!)
    await flush(1000)
    expect(content()).toBeNull()
    expect(trigger().getAttribute("data-state")).toBe("closed")
  })

  test("a quick second hover within skipDelayDuration opens instantly", async () => {
    const user = setupUser()
    render(
      <Tooltip.Provider delayDuration={700} skipDelayDuration={300}>
        {["a", "b"].map((id) => (
          <Tooltip.Root key={id}>
            <Tooltip.Trigger data-testid={`trigger-${id}`}>{id}</Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content data-testid={`content-${id}`}>tip {id}</Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        ))}
      </Tooltip.Provider>
    )
    await user.hover(screen.getByTestId("trigger-a"))
    await flush(700)
    expect(screen.getByTestId("content-a").getAttribute("data-state")).toBe("delayed-open")
    await user.hover(screen.getByTestId("trigger-b"))
    await flush()
    expect(screen.getByTestId("content-b").getAttribute("data-state")).toBe("instant-open")
    // Opening one tooltip closes the other
    expect(screen.queryByTestId("content-a")).toBeNull()
  })

  test("after the skip window the delay applies again", async () => {
    const user = setupUser()
    render(<Example provider={{ delayDuration: 500, skipDelayDuration: 300 }} />)
    await user.hover(trigger())
    await flush(500)
    await user.unhover(trigger())
    await flush(1000)
    expect(content()).toBeNull()
    await user.hover(trigger())
    await flush(499)
    expect(content()).toBeNull()
    await flush(1)
    expect(content()).not.toBeNull()
  })

  test("keyboard focus opens it immediately and blur closes it", async () => {
    const user = setupUser()
    render(
      <div>
        <button type="button">before</button>
        <Example provider={{ delayDuration: 700 }} />
      </div>
    )
    await user.tab()
    await user.tab()
    expect(document.activeElement).toBe(trigger())
    await flush()
    expect(content()).not.toBeNull()
    expect(content()!.getAttribute("data-state")).toBe("instant-open")
    await user.tab({ shift: true })
    await flush()
    expect(content()).toBeNull()
  })

  test("pressing the trigger closes it and the focus from the press does not reopen it", async () => {
    const user = setupUser()
    render(<Example provider={{ delayDuration: 0 }} />)
    await user.hover(trigger())
    await flush()
    expect(content()).not.toBeNull()
    await user.pointer({ keys: "[MouseLeft>]", target: trigger() })
    await flush()
    expect(content()).toBeNull()
    await user.pointer({ keys: "[/MouseLeft]" })
    await flush()
    expect(content()).toBeNull()
  })

  test("Escape and a pointer down outside close it", async () => {
    const user = setupUser()
    render(<Example provider={{ delayDuration: 0 }} />)
    await user.hover(trigger())
    await flush()
    await user.keyboard("{Escape}")
    await flush()
    expect(content()).toBeNull()
    await user.unhover(trigger())
    await flush(500)
    await user.hover(trigger())
    await flush()
    expect(content()).not.toBeNull()
    fireEvent.pointerDown(document.body)
    await flush()
    expect(content()).toBeNull()
  })

  test("focus moving elsewhere does not dismiss a hovered tooltip", async () => {
    const user = setupUser()
    render(
      <div>
        <button type="button">other</button>
        <Example provider={{ delayDuration: 0 }} />
      </div>
    )
    await user.hover(trigger())
    await flush()
    screen.getByRole("button", { name: "other" }).focus()
    await flush()
    expect(content()).not.toBeNull()
  })

  test("touch pointers do not open it", async () => {
    render(<Example provider={{ delayDuration: 0 }} />)
    fireEvent.pointerMove(trigger(), { pointerType: "touch" })
    await flush(100)
    expect(content()).toBeNull()
  })

  test("the arrow renders once, in the visible content", async () => {
    const user = setupUser()
    render(
      <Example provider={{ delayDuration: 0 }}>
        <Tooltip.Arrow data-testid="arrow" />
      </Example>
    )
    await user.hover(trigger())
    await flush()
    expect(screen.getAllByTestId("arrow")).toHaveLength(1)
    expect(screen.getByTestId("arrow").closest("[role=tooltip]")).toBeNull()
  })

  test("aria-label is what the hidden tooltip announces", async () => {
    const user = setupUser()
    render(<Example provider={{ delayDuration: 0 }} content={{ "aria-label": "Adds the item" }} />)
    await user.hover(trigger())
    await flush()
    expect(screen.getByRole("tooltip").textContent).toBe("Adds the item")
  })

  test("controlled and defaultOpen", async () => {
    const onOpenChange = vi.fn()
    const user = setupUser()
    const { rerender } = render(<Example provider={{ delayDuration: 0 }} root={{ open: false, onOpenChange }} />)
    await user.hover(trigger())
    await flush()
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(content()).toBeNull()
    rerender(<Example provider={{ delayDuration: 0 }} root={{ open: true, onOpenChange }} />)
    await flush()
    expect(content()).not.toBeNull()
    rerender(<Example provider={{ delayDuration: 0 }} root={{ open: false, onOpenChange }} />)
    await flush()
    expect(content()).toBeNull()
  })

  test("defaultOpen mounts it open", async () => {
    render(<Example root={{ defaultOpen: true }} />)
    await flush()
    expect(content()).not.toBeNull()
  })

  test("stays mounted with data-state closed until the exit animation ends", async () => {
    const endAnimation = mockAnimations({ open: "fade-in", closed: "fade-out" })
    const user = setupUser()
    render(<Example provider={{ delayDuration: 0 }} />)
    await user.hover(trigger())
    await flush()
    const open = content()!
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
    const Button = (props: ComponentProps<"button">) => <button type="button" {...props} />
    render(
      <Tooltip.Provider delayDuration={0}>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <Button>Icon</Button>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content data-testid="content">tip</Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </Tooltip.Provider>
    )
    const icon = screen.getByRole("button", { name: "Icon" })
    await user.hover(icon)
    await flush()
    expect(content()).not.toBeNull()
    expect(icon.getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id)
    expect(icon.getAttribute("data-state")).toBe("delayed-open")
  })

  test("a Tooltip outside a Provider throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<Tooltip.Root />)).toThrow(/TooltipProvider/)
    spy.mockRestore()
  })
})
