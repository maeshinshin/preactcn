import { type ComponentChildren, type ComponentProps } from "preact"
import { useState } from "preact/hooks"
import { fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
import { flush, mockAnimations, mockLayout, setupUser, useFakeTimers } from "./helpers"
import * as Dialog from "../src/radix/dialog"
import * as Popover from "../src/radix/popover"

type ContentProps = ComponentProps<typeof Popover.Content>

function Example({ root, content, children }: { root?: ComponentProps<typeof Popover.Root>; content?: Partial<ContentProps>; children?: ComponentChildren }) {
  return (
    <div>
      <button type="button">outside</button>
      <Popover.Root {...root}>
        <Popover.Trigger data-testid="trigger">Open</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content data-testid="content" sideOffset={4} {...content}>
            <input aria-label="width" />
            <button type="button">Apply</button>
            {children}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  )
}

const trigger = () => screen.getByTestId("trigger")
const wrapper = () => screen.getByTestId("content").parentElement!

useFakeTimers()

describe("popover", () => {
  test("is closed by default and the trigger describes the popup", () => {
    render(<Example />)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(trigger().getAttribute("type")).toBe("button")
    expect(trigger().getAttribute("aria-haspopup")).toBe("dialog")
    expect(trigger().getAttribute("aria-expanded")).toBe("false")
    expect(trigger().hasAttribute("aria-controls")).toBe(false)
    expect(trigger().hasAttribute("data-radix-popper-side")).toBe(false)
    expect(trigger().getAttribute("data-state")).toBe("closed")
  })

  test("opens on click inside a popper wrapper in body, placed relative to the trigger", async () => {
    mockLayout({ anchor: { left: 100, top: 100, width: 50, height: 20 }, anchorId: "trigger" })
    const user = setupUser()
    const { container } = render(<Example content={{ align: "start" }} />)
    await user.click(trigger())
    await flush(50)
    const dialog = screen.getByRole("dialog")
    expect(dialog).toBe(screen.getByTestId("content"))
    expect(container.contains(dialog)).toBe(false)
    expect(wrapper().hasAttribute("data-radix-popper-content-wrapper")).toBe(true)
    expect(wrapper().parentElement).toBe(document.body)
    expect(trigger().getAttribute("aria-expanded")).toBe("true")
    expect(trigger().getAttribute("data-state")).toBe("open")
    expect(trigger().getAttribute("aria-controls")).toBe(dialog.id)
    expect(trigger().getAttribute("data-radix-popper-side")).toBe("bottom")
    expect(trigger().getAttribute("data-radix-popper-align")).toBe("start")
    expect(dialog.getAttribute("data-state")).toBe("open")
    expect(dialog.getAttribute("data-side")).toBe("bottom")
    expect(dialog.getAttribute("data-align")).toBe("start")
    expect(dialog.getAttribute("tabindex")).toBe("-1")
    expect(wrapper().style.transform).toBe("translate(100px, 124px)")
  })

  test("re-exposes the popper variables under the popover namespace", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(trigger())
    await flush(50)
    const style = screen.getByTestId("content").style
    expect(style.getPropertyValue("--radix-popover-content-transform-origin")).toBe("var(--radix-popper-transform-origin)")
    expect(style.getPropertyValue("--radix-popover-content-available-width")).toBe("var(--radix-popper-available-width)")
    expect(style.getPropertyValue("--radix-popover-content-available-height")).toBe("var(--radix-popper-available-height)")
    expect(style.getPropertyValue("--radix-popover-trigger-width")).toBe("var(--radix-popper-anchor-width)")
    expect(style.getPropertyValue("--radix-popover-trigger-height")).toBe("var(--radix-popper-anchor-height)")
  })

  test("moves focus into the content, loops Tab, and leaves the page interactive", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(trigger())
    await flush()
    expect(document.activeElement).toBe(screen.getByLabelText("width"))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Apply" }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByLabelText("width"))
    expect(trigger().closest("[inert]")).toBeNull()
    expect(document.body.style.overflow).toBe("")
  })

  test("Escape closes and returns focus to the trigger", async () => {
    const user = setupUser()
    const onOpenChange = vi.fn()
    render(<Example root={{ onOpenChange }} />)
    await user.click(trigger())
    await flush()
    await user.keyboard("{Escape}")
    await flush()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  test("a pointer down outside closes without taking focus back; inside it stays open", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(trigger())
    await flush()
    await user.click(screen.getByLabelText("width"))
    expect(screen.queryByRole("dialog")).not.toBeNull()
    await user.click(screen.getByRole("button", { name: "outside" }))
    await flush()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "outside" }))
  })

  test("focus moving outside closes it", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(trigger())
    await flush()
    screen.getByRole("button", { name: "outside" }).focus()
    await flush()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "outside" }))
  })

  test("clicking the trigger while open closes it once instead of reopening", async () => {
    const user = setupUser()
    const onOpenChange = vi.fn()
    render(<Example root={{ onOpenChange }} />)
    await user.click(trigger())
    await flush()
    await user.click(trigger())
    await flush()
    expect(onOpenChange.mock.calls).toEqual([[true], [false]])
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  test("a focus outside right after a pointer down on the trigger does not dismiss", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(trigger())
    await flush()
    fireEvent.pointerDown(trigger())
    screen.getByRole("button", { name: "outside" }).focus()
    await flush()
    expect(screen.queryByRole("dialog")).not.toBeNull()
  })

  test("controlled open", async () => {
    const user = setupUser()
    const onOpenChange = vi.fn()
    const { rerender } = render(<Example root={{ open: false, onOpenChange }} />)
    await user.click(trigger())
    await flush()
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(screen.queryByRole("dialog")).toBeNull()
    rerender(<Example root={{ open: true, onOpenChange }} />)
    await flush()
    expect(screen.getByRole("dialog")).not.toBeNull()
    rerender(<Example root={{ open: false, onOpenChange }} />)
    await flush()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  test("defaultOpen mounts it open", async () => {
    render(<Example root={{ defaultOpen: true }} />)
    await flush()
    expect(screen.getByRole("dialog")).not.toBeNull()
    expect(trigger().getAttribute("aria-expanded")).toBe("true")
  })

  test("Anchor replaces the trigger as the positioning reference", async () => {
    mockLayout({ anchor: { left: 400, top: 300, width: 100, height: 20 }, anchorId: "anchor" })
    const user = setupUser()
    render(
      <Popover.Root>
        <Popover.Anchor data-testid="anchor">anchor</Popover.Anchor>
        <Popover.Trigger data-testid="trigger">Open</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content data-testid="content">body</Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    )
    await flush()
    await user.click(trigger())
    await flush(50)
    expect(wrapper().style.transform).toBe("translate(410px, 320px)")
  })

  test("without a trigger, Escape returns focus to what had it before", async () => {
    const user = setupUser()
    function Controlled() {
      const [open, setOpen] = useState(false)
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Opener
          </button>
          <Popover.Root open={open} onOpenChange={setOpen}>
            <Popover.Anchor>anchor</Popover.Anchor>
            <Popover.Portal>
              <Popover.Content>
                <input aria-label="field" />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
        </div>
      )
    }
    render(<Controlled />)
    const opener = screen.getByRole("button", { name: "Opener" })
    opener.focus()
    fireEvent.click(opener)
    await flush()
    expect(document.activeElement).toBe(screen.getByLabelText("field"))
    await user.keyboard("{Escape}")
    await flush()
    expect(document.activeElement).toBe(opener)
  })

  test("stays mounted with data-state closed until the exit animation ends", async () => {
    const endAnimation = mockAnimations()
    const user = setupUser()
    render(<Example />)
    await user.click(trigger())
    await flush()
    const content = screen.getByTestId("content")
    await user.keyboard("{Escape}")
    await flush()
    expect(screen.getByTestId("content")).toBe(content)
    expect(content.getAttribute("data-state")).toBe("closed")
    endAnimation(content)
    await flush()
    expect(screen.queryByTestId("content")).toBeNull()
    expect(document.querySelector("[data-radix-popper-content-wrapper]")).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  test("asChild trigger with a plain function component gets the focus back", async () => {
    const user = setupUser()
    const Button = (props: ComponentProps<"button">) => <button type="button" {...props} />
    render(
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button>Launch</Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content>body</Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    )
    const launch = screen.getByRole("button", { name: "Launch" })
    await user.click(launch)
    await flush()
    expect(launch.getAttribute("aria-expanded")).toBe("true")
    await user.keyboard("{Escape}")
    await flush()
    expect(document.activeElement).toBe(launch)
  })

  test("event props can cancel the defaults", async () => {
    const user = setupUser()
    const onEscapeKeyDown = vi.fn((event: KeyboardEvent) => event.preventDefault())
    const onInteractOutside = vi.fn((event: Event) => event.preventDefault())
    const onOpenAutoFocus = vi.fn((event: Event) => event.preventDefault())
    render(<Example content={{ onEscapeKeyDown, onInteractOutside, onOpenAutoFocus }} />)
    await user.click(trigger())
    await flush()
    expect(onOpenAutoFocus).toHaveBeenCalledTimes(1)
    expect(document.activeElement).not.toBe(screen.getByLabelText("width"))
    await user.keyboard("{Escape}")
    fireEvent.pointerDown(document.body)
    expect(onEscapeKeyDown).toHaveBeenCalledTimes(1)
    expect(onInteractOutside).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("dialog")).not.toBeNull()
  })

  test("inside a dialog: Escape closes only the popover and clicks inside it do not dismiss the dialog", async () => {
    const user = setupUser()
    render(
      <Dialog.Root defaultOpen>
        <Dialog.Portal>
          <Dialog.Content data-testid="dialog">
            <Dialog.Title>Settings</Dialog.Title>
            <Popover.Root>
              <Popover.Trigger data-testid="trigger">Open</Popover.Trigger>
              <Popover.Portal>
                <Popover.Content data-testid="content">
                  <button type="button">Inner</button>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )
    await flush()
    await user.click(trigger())
    await flush()
    expect(screen.getByTestId("content").closest("[inert]")).toBeNull()
    await user.click(screen.getByRole("button", { name: "Inner" }))
    await flush()
    expect(screen.queryByTestId("dialog")).not.toBeNull()
    expect(screen.queryByTestId("content")).not.toBeNull()
    await user.keyboard("{Escape}")
    await flush()
    expect(screen.queryByTestId("content")).toBeNull()
    expect(screen.queryByTestId("dialog")).not.toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  test("a popover nested in a popover keeps the outer one open", async () => {
    const user = setupUser()
    render(
      <Popover.Root>
        <Popover.Trigger data-testid="outer-trigger">Outer</Popover.Trigger>
        <Popover.Portal>
          <Popover.Content data-testid="outer">
            <Popover.Root>
              <Popover.Trigger>Inner trigger</Popover.Trigger>
              <Popover.Portal>
                <Popover.Content data-testid="inner">
                  <button type="button">Deep</button>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    )
    await user.click(screen.getByTestId("outer-trigger"))
    await flush()
    await user.click(screen.getByRole("button", { name: "Inner trigger" }))
    await flush()
    expect(screen.queryByTestId("inner")).not.toBeNull()
    expect(screen.queryByTestId("outer")).not.toBeNull()
    await user.click(screen.getByRole("button", { name: "Deep" }))
    await flush()
    expect(screen.queryByTestId("outer")).not.toBeNull()
    await user.keyboard("{Escape}")
    await flush()
    expect(screen.queryByTestId("inner")).toBeNull()
    expect(screen.queryByTestId("outer")).not.toBeNull()
  })

  test("Content outside a Popover throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<Popover.Content />)).toThrow(/Popover/)
    spy.mockRestore()
  })
})
