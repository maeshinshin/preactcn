import { type ComponentProps } from "preact"
import { useState } from "preact/hooks"
import { fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
import { flush, mockAnimations, setupUser, useFakeTimers } from "./helpers"
import * as Dialog from "../src/radix/dialog"
import * as Popover from "../src/radix/popover"

type RootProps = ComponentProps<typeof Dialog.Root>
type ContentProps = ComponentProps<typeof Dialog.Content>

function Example({ root, content }: { root?: Partial<RootProps>; content?: Partial<ContentProps> }) {
  return (
    <Dialog.Root {...root}>
      <Dialog.Trigger>Open</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay data-testid="overlay" />
        <Dialog.Content data-testid="content" {...content}>
          <Dialog.Title>Edit profile</Dialog.Title>
          <Dialog.Description>Make changes here.</Dialog.Description>
          <input aria-label="name" />
          <Dialog.Close>Done</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

const trigger = () => screen.getByRole("button", { name: "Open" })
const content = () => screen.getByTestId("content")

useFakeTimers()

describe("dialog", () => {
  test("is closed by default and the trigger describes the popup", () => {
    render(<Example />)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.queryByTestId("overlay")).toBeNull()
    expect(trigger().getAttribute("type")).toBe("button")
    expect(trigger().getAttribute("aria-haspopup")).toBe("dialog")
    expect(trigger().getAttribute("aria-expanded")).toBe("false")
    expect(trigger().getAttribute("data-state")).toBe("closed")
  })

  test("opens on click: overlay and content are body children wired together with aria", async () => {
    const user = setupUser()
    const { container } = render(<Example />)
    expect(trigger().hasAttribute("aria-controls")).toBe(false)
    await user.click(trigger())
    await flush()
    const dialog = screen.getByRole("dialog")
    expect(dialog).toBe(content())
    expect(container.contains(dialog)).toBe(false)
    expect(dialog.parentElement).toBe(document.body)
    expect(screen.getByTestId("overlay").parentElement).toBe(document.body)
    expect(trigger().getAttribute("aria-expanded")).toBe("true")
    expect(trigger().getAttribute("data-state")).toBe("open")
    expect(trigger().getAttribute("aria-controls")).toBe(dialog.id)
    expect(dialog.getAttribute("data-state")).toBe("open")
    expect(dialog.getAttribute("tabindex")).toBe("-1")
    expect(screen.getByTestId("overlay").getAttribute("data-state")).toBe("open")
    const title = screen.getByRole("heading", { name: "Edit profile" })
    expect(title.tagName).toBe("H2")
    expect(dialog.getAttribute("aria-labelledby")).toBe(title.id)
    const description = screen.getByText("Make changes here.")
    expect(description.tagName).toBe("P")
    expect(dialog.getAttribute("aria-describedby")).toBe(description.id)
  })

  test("moves focus into the content, hides the rest of the page and locks scroll", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(trigger())
    await flush()
    expect(document.activeElement).toBe(screen.getByLabelText("name"))
    expect(trigger().closest("[inert]")).not.toBeNull()
    expect(content().closest("[inert]")).toBeNull()
    expect(screen.getByTestId("overlay").closest("[inert]")).toBeNull()
    expect(document.body.style.overflow).toBe("hidden")
  })

  test("traps Tab inside the content", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(trigger())
    await flush()
    expect(document.activeElement).toBe(screen.getByLabelText("name"))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Done" }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByLabelText("name"))
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Done" }))
  })

  test("Escape closes, restores the page and returns focus to the trigger", async () => {
    const user = setupUser()
    const onOpenChange = vi.fn()
    render(<Example root={{ onOpenChange }} />)
    await user.click(trigger())
    await flush()
    await user.keyboard("{Escape}")
    await flush()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(screen.queryByTestId("overlay")).toBeNull()
    expect(trigger().closest("[inert]")).toBeNull()
    expect(document.body.style.overflow).toBe("")
    expect(document.activeElement).toBe(trigger())
  })

  test("a pointer down on the overlay closes; inside the content or with the right button it does not", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(trigger())
    await flush()
    await user.click(screen.getByLabelText("name"))
    fireEvent.pointerDown(screen.getByTestId("overlay"), { button: 2 })
    fireEvent.pointerDown(screen.getByTestId("overlay"), { button: 0, ctrlKey: true })
    expect(screen.queryByRole("dialog")).not.toBeNull()
    fireEvent.pointerDown(screen.getByTestId("overlay"), { button: 0 })
    await flush()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  test("Close closes", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(trigger())
    await flush()
    await user.click(screen.getByRole("button", { name: "Done" }))
    await flush()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  test("defaultOpen mounts it open", async () => {
    render(<Example root={{ defaultOpen: true }} />)
    await flush()
    expect(screen.getByRole("dialog")).not.toBeNull()
    expect(trigger().getAttribute("aria-expanded")).toBe("true")
  })

  test("controlled: the parent decides", async () => {
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
    await user.keyboard("{Escape}")
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    expect(screen.getByRole("dialog")).not.toBeNull()
    rerender(<Example root={{ open: false, onOpenChange }} />)
    await flush()
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  test("stays mounted with data-state closed until the exit animation ends", async () => {
    const endAnimation = mockAnimations()
    const user = setupUser()
    render(<Example />)
    await user.click(trigger())
    await flush()
    const dialog = content()
    const overlay = screen.getByTestId("overlay")
    await user.keyboard("{Escape}")
    await flush()
    expect(content()).toBe(dialog)
    expect(dialog.getAttribute("data-state")).toBe("closed")
    expect(overlay.getAttribute("data-state")).toBe("closed")
    expect(trigger().getAttribute("data-state")).toBe("closed")
    expect(document.body.style.overflow).toBe("hidden")
    endAnimation(dialog)
    endAnimation(overlay)
    await flush()
    expect(screen.queryByTestId("content")).toBeNull()
    expect(screen.queryByTestId("overlay")).toBeNull()
    expect(document.body.style.overflow).toBe("")
    expect(document.activeElement).toBe(trigger())
  })

  test("asChild trigger and close work with a plain function component", async () => {
    const user = setupUser()
    const Button = (props: ComponentProps<"button">) => <button type="button" {...props} />
    render(
      <Dialog.Root>
        <Dialog.Trigger asChild>
          <Button>Launch</Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Content>
            <Dialog.Title>t</Dialog.Title>
            <Dialog.Close asChild>
              <Button>Dismiss</Button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )
    const launch = screen.getByRole("button", { name: "Launch" })
    expect(launch.getAttribute("aria-haspopup")).toBe("dialog")
    await user.click(launch)
    await flush()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Dismiss" }))
    await user.click(screen.getByRole("button", { name: "Dismiss" }))
    await flush()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(launch)
  })

  test("without a trigger, closing returns focus to what had it before (command palette, sidebar sheet)", async () => {
    const user = setupUser()
    function Controlled() {
      const [open, setOpen] = useState(false)
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Shortcut
          </button>
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Portal>
              <Dialog.Content>
                <Dialog.Title>Palette</Dialog.Title>
                <input aria-label="search" />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      )
    }
    render(<Controlled />)
    const opener = screen.getByRole("button", { name: "Shortcut" })
    opener.focus()
    fireEvent.click(opener)
    await flush()
    expect(document.activeElement).toBe(screen.getByLabelText("search"))
    await user.keyboard("{Escape}")
    await flush()
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  test("Title and Description can sit outside Content", async () => {
    const user = setupUser()
    render(
      <Dialog.Root>
        <Dialog.Trigger>Open</Dialog.Trigger>
        <Dialog.Title>Outside title</Dialog.Title>
        <Dialog.Portal>
          <Dialog.Content>body</Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )
    await user.click(trigger())
    await flush()
    expect(screen.getByRole("dialog").getAttribute("aria-labelledby")).toBe(screen.getByText("Outside title").id)
  })

  test("event props can cancel the defaults", async () => {
    const user = setupUser()
    const onEscapeKeyDown = vi.fn((event: KeyboardEvent) => event.preventDefault())
    const onPointerDownOutside = vi.fn((event: Event) => event.preventDefault())
    const onOpenAutoFocus = vi.fn((event: Event) => event.preventDefault())
    const onCloseAutoFocus = vi.fn((event: Event) => event.preventDefault())
    render(<Example content={{ onEscapeKeyDown, onPointerDownOutside, onOpenAutoFocus, onCloseAutoFocus }} />)
    await user.click(trigger())
    await flush()
    expect(onOpenAutoFocus).toHaveBeenCalledTimes(1)
    expect(document.activeElement).not.toBe(screen.getByLabelText("name"))
    await user.keyboard("{Escape}")
    fireEvent.pointerDown(screen.getByTestId("overlay"))
    expect(onEscapeKeyDown).toHaveBeenCalledTimes(1)
    expect(onPointerDownOutside).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("dialog")).not.toBeNull()
    await user.click(screen.getByRole("button", { name: "Done" }))
    await flush()
    expect(onCloseAutoFocus).toHaveBeenCalledTimes(1)
    expect(document.activeElement).not.toBe(trigger())
  })

  test("only the topmost of nested dialogs reacts to Escape and the page is restored in order", async () => {
    const user = setupUser()
    function Nested() {
      const [inner, setInner] = useState(false)
      return (
        <Dialog.Root defaultOpen>
          <Dialog.Portal>
            <Dialog.Content data-testid="outer">
              <Dialog.Title>outer</Dialog.Title>
              <Dialog.Root open={inner} onOpenChange={setInner}>
                <Dialog.Trigger>Open inner</Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Content data-testid="inner">
                    <Dialog.Title>inner</Dialog.Title>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )
    }
    render(<Nested />)
    await flush()
    await user.click(screen.getByRole("button", { name: "Open inner" }))
    await flush()
    expect(screen.getByTestId("outer").closest("[inert]")).not.toBeNull()
    expect(screen.getByTestId("inner").closest("[inert]")).toBeNull()
    await user.keyboard("{Escape}")
    await flush()
    expect(screen.queryByTestId("inner")).toBeNull()
    expect(screen.getByTestId("outer")).not.toBeNull()
    expect(screen.getByTestId("outer").closest("[inert]")).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open inner" }))
    expect(document.body.style.overflow).toBe("hidden")
  })

  describe("modal={false}", () => {
    const nonModal = { modal: false }

    function Page({ root, content }: { root?: Partial<RootProps>; content?: Partial<ContentProps> }) {
      return (
        <div>
          <button type="button" onClick={() => (clicks.count += 1)}>
            page button
          </button>
          <Example root={{ ...nonModal, ...root }} content={content} />
        </div>
      )
    }
    const clicks = { count: 0 }

    test("renders no overlay, does not hide the page and does not lock scroll", async () => {
      const user = setupUser()
      render(<Page />)
      await user.click(trigger())
      await flush()
      expect(screen.getByRole("dialog")).not.toBeNull()
      expect(screen.queryByTestId("overlay")).toBeNull()
      expect(document.querySelector("[inert]")).toBeNull()
      expect(document.body.style.overflow).toBe("")
      expect(document.activeElement).toBe(screen.getByLabelText("name"))
      expect(trigger().getAttribute("aria-expanded")).toBe("true")
    })

    test("still loops Tab inside the content", async () => {
      const user = setupUser()
      render(<Page />)
      await user.click(trigger())
      await flush()
      await user.tab()
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Done" }))
      await user.tab()
      expect(document.activeElement).toBe(screen.getByLabelText("name"))
    })

    test("a pointer interaction outside closes it and still reaches the page, without taking focus back", async () => {
      clicks.count = 0
      const user = setupUser()
      render(<Page />)
      await user.click(trigger())
      await flush()
      await user.click(screen.getByRole("button", { name: "page button" }))
      await flush()
      expect(clicks.count).toBe(1)
      expect(screen.queryByRole("dialog")).toBeNull()
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "page button" }))
    })

    test("focus moving outside closes it", async () => {
      const user = setupUser()
      render(<Page />)
      await user.click(trigger())
      await flush()
      screen.getByRole("button", { name: "page button" }).focus()
      await flush()
      expect(screen.queryByRole("dialog")).toBeNull()
    })

    test("Escape closes it and returns focus to the trigger", async () => {
      const user = setupUser()
      render(<Page />)
      await user.click(trigger())
      await flush()
      await user.keyboard("{Escape}")
      await flush()
      expect(screen.queryByRole("dialog")).toBeNull()
      expect(document.activeElement).toBe(trigger())
    })

    test("clicking the trigger while open closes it once instead of reopening", async () => {
      const user = setupUser()
      const onOpenChange = vi.fn()
      render(<Page root={{ onOpenChange }} />)
      await user.click(trigger())
      await flush()
      await user.click(trigger())
      await flush()
      expect(onOpenChange.mock.calls).toEqual([[true], [false]])
      expect(screen.queryByRole("dialog")).toBeNull()
    })

    test("controlled like the upstream combobox example, with Close still closing", async () => {
      const user = setupUser()
      function Controlled() {
        const [open, setOpen] = useState(false)
        return <Example root={{ open, onOpenChange: setOpen, modal: false }} />
      }
      render(<Controlled />)
      await user.click(trigger())
      await flush()
      expect(screen.getByRole("dialog")).not.toBeNull()
      await user.click(screen.getByRole("button", { name: "Done" }))
      await flush()
      expect(screen.queryByRole("dialog")).toBeNull()
    })

    test("a popover inside it works and its clicks do not dismiss the dialog", async () => {
      const user = setupUser()
      render(
        <Dialog.Root modal={false} defaultOpen>
          <Dialog.Portal>
            <Dialog.Content data-testid="dialog">
              <Dialog.Title>Settings</Dialog.Title>
              <Popover.Root>
                <Popover.Trigger>Pick</Popover.Trigger>
                <Popover.Portal>
                  <Popover.Content data-testid="popover">
                    <button type="button">Inner</button>
                  </Popover.Content>
                </Popover.Portal>
              </Popover.Root>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )
      await flush()
      await user.click(screen.getByRole("button", { name: "Pick" }))
      await flush()
      await user.click(screen.getByRole("button", { name: "Inner" }))
      await flush()
      expect(screen.queryByTestId("dialog")).not.toBeNull()
      expect(screen.queryByTestId("popover")).not.toBeNull()
    })

    test("modal defaults to true", async () => {
      const user = setupUser()
      render(<Example root={{ modal: undefined }} />)
      await user.click(trigger())
      await flush()
      expect(screen.queryByTestId("overlay")).not.toBeNull()
      expect(trigger().closest("[inert]")).not.toBeNull()
    })
  })

  test("Content outside a Dialog throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<Dialog.Content />)).toThrow(/Dialog/)
    spy.mockRestore()
  })
})
