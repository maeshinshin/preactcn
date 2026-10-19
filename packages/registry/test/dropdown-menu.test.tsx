import { createRef, type ComponentChildren, type ComponentProps } from "preact"
import { fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
import { flush, mockAnimations, mockLayout, setupUser, useFakeTimers } from "./helpers"
import * as Dialog from "../src/radix/dialog"
import * as DropdownMenu from "../src/radix/dropdown-menu"

function Example({ root, content, children }: { root?: ComponentProps<typeof DropdownMenu.Root>; content?: Partial<ComponentProps<typeof DropdownMenu.Content>>; children?: ComponentChildren }) {
  return (
    <div>
      <button type="button">outside</button>
      <DropdownMenu.Root {...root}>
        <DropdownMenu.Trigger data-testid="trigger">Open</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content data-testid="content" sideOffset={4} {...content}>
            {children ?? (
              <>
                <DropdownMenu.Item>Profile</DropdownMenu.Item>
                <DropdownMenu.Item>Settings</DropdownMenu.Item>
              </>
            )}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}

const trigger = () => screen.getByTestId("trigger")
const content = () => screen.queryByTestId("content")
const outside = () => screen.getByRole("button", { name: "outside" })
const wrapper = () => screen.getByTestId("content").parentElement!

useFakeTimers()

describe("dropdown menu", () => {
  test("is closed by default and the trigger describes the popup", () => {
    render(<Example />)
    expect(screen.queryByRole("menu")).toBeNull()
    expect(trigger().getAttribute("type")).toBe("button")
    expect(trigger().getAttribute("aria-haspopup")).toBe("menu")
    expect(trigger().getAttribute("aria-expanded")).toBe("false")
    expect(trigger().getAttribute("aria-controls")).toBeNull()
    expect(trigger().getAttribute("data-state")).toBe("closed")
    expect(trigger().id).not.toBe("")
  })

  test("opens on a pointer down inside a popper wrapper in body, placed under the trigger and labelled by it", async () => {
    mockLayout({ anchor: { left: 100, top: 100, width: 50, height: 20 }, anchorId: "trigger" })
    const user = setupUser()
    const { container } = render(<Example />)
    await user.click(trigger())
    await flush(50)
    const menu = screen.getByRole("menu")
    expect(menu).toBe(content())
    expect(container.contains(menu)).toBe(false)
    expect(wrapper().hasAttribute("data-radix-popper-content-wrapper")).toBe(true)
    expect(wrapper().getAttribute("dir")).toBe("ltr")
    expect(wrapper().parentElement).toBe(document.body)
    expect(menu.getAttribute("aria-orientation")).toBe("vertical")
    expect(menu.getAttribute("data-state")).toBe("open")
    expect(menu.getAttribute("data-side")).toBe("bottom")
    expect(menu.getAttribute("data-align")).toBe("center")
    expect(menu.getAttribute("aria-labelledby")).toBe(trigger().id)
    expect(menu.getAttribute("dir")).toBe("ltr")
    expect(trigger().getAttribute("aria-controls")).toBe(menu.id)
    expect(trigger().getAttribute("aria-expanded")).toBe("true")
    expect(trigger().getAttribute("data-state")).toBe("open")
    expect(wrapper().style.transform).toBe("translate(85px, 124px)")
  })

  test("re-exposes the popper variables under the dropdown menu namespace", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(trigger())
    await flush(50)
    const style = content()!.style
    expect(style.getPropertyValue("--radix-dropdown-menu-content-transform-origin")).toBe("var(--radix-popper-transform-origin)")
    expect(style.getPropertyValue("--radix-dropdown-menu-content-available-width")).toBe("var(--radix-popper-available-width)")
    expect(style.getPropertyValue("--radix-dropdown-menu-content-available-height")).toBe("var(--radix-popper-available-height)")
    expect(style.getPropertyValue("--radix-dropdown-menu-trigger-width")).toBe("var(--radix-popper-anchor-width)")
    expect(style.getPropertyValue("--radix-dropdown-menu-trigger-height")).toBe("var(--radix-popper-anchor-height)")
    expect(style.outlineStyle).toBe("none")
  })

  test("a pointer down toggles it, but not with the right button or ctrl", async () => {
    const user = setupUser()
    const onOpenChange = vi.fn()
    render(<Example root={{ onOpenChange }} />)
    fireEvent.pointerDown(trigger(), { button: 2 })
    fireEvent.pointerDown(trigger(), { button: 0, ctrlKey: true })
    await flush()
    expect(content()).toBeNull()
    await user.click(trigger())
    await flush()
    expect(content()).not.toBeNull()
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
  })

  test("a pointer down opens it without focusing an item or the trigger: the menu itself has focus", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(trigger())
    await flush()
    expect(document.activeElement).toBe(content())
  })

  test.each([["{Enter}"], ["{ }"], ["{ArrowDown}"]])("%s on the focused trigger opens it and highlights the first item", async (key) => {
    const user = setupUser()
    render(<Example />)
    trigger().focus()
    await user.keyboard(key)
    await flush()
    expect(content()).not.toBeNull()
    expect(document.activeElement).toBe(screen.getByRole("menuitem", { name: "Profile" }))
    expect(document.activeElement!.hasAttribute("data-highlighted")).toBe(true)
  })

  test("a disabled trigger cannot open it", async () => {
    const user = setupUser()
    render(
      <DropdownMenu.Root>
        <DropdownMenu.Trigger disabled data-testid="trigger">
          Open
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content data-testid="content">
            <DropdownMenu.Item>Profile</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    )
    expect(trigger().hasAttribute("disabled")).toBe(true)
    expect(trigger().getAttribute("data-disabled")).toBe("")
    fireEvent.pointerDown(trigger(), { button: 0 })
    fireEvent.keyDown(trigger(), { key: "Enter" })
    fireEvent.keyDown(trigger(), { key: "ArrowDown" })
    await user.click(trigger())
    await flush()
    expect(content()).toBeNull()
  })

  test("controlled open", async () => {
    const user = setupUser()
    const onOpenChange = vi.fn()
    const { rerender } = render(<Example root={{ open: false, onOpenChange }} />)
    await user.click(trigger())
    await flush()
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(content()).toBeNull()
    rerender(<Example root={{ open: true, onOpenChange }} />)
    await flush()
    expect(content()).not.toBeNull()
    await user.keyboard("{Escape}")
    await flush()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    expect(content()).not.toBeNull()
    rerender(<Example root={{ open: false, onOpenChange }} />)
    await flush()
    expect(content()).toBeNull()
  })

  test("defaultOpen mounts it open", async () => {
    render(<Example root={{ defaultOpen: true }} />)
    await flush()
    expect(content()).not.toBeNull()
    expect(trigger().getAttribute("aria-expanded")).toBe("true")
  })

  test("Escape closes it and returns focus to the trigger", async () => {
    const user = setupUser()
    const onOpenChange = vi.fn()
    render(<Example root={{ onOpenChange }} />)
    await user.click(trigger())
    await flush()
    await user.keyboard("{Escape}")
    await flush()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    expect(content()).toBeNull()
    expect(document.activeElement).toBe(trigger())
    expect(trigger().getAttribute("data-state")).toBe("closed")
  })

  test("a pointer down on the trigger while open closes it once", async () => {
    const user = setupUser()
    const onOpenChange = vi.fn()
    render(<Example root={{ onOpenChange }} />)
    await user.click(trigger())
    await flush()
    await user.click(trigger())
    await flush()
    expect(onOpenChange.mock.calls).toEqual([[true], [false]])
    expect(content()).toBeNull()
  })

  test("event props can cancel the defaults", async () => {
    const user = setupUser()
    const onEscapeKeyDown = vi.fn((event: KeyboardEvent) => event.preventDefault())
    const onPointerDownOutside = vi.fn((event: Event) => event.preventDefault())
    const onOpenAutoFocus = vi.fn((event: Event) => event.preventDefault())
    render(<Example content={{ onEscapeKeyDown, onPointerDownOutside, onOpenAutoFocus }} />)
    await user.click(trigger())
    await flush()
    expect(onOpenAutoFocus).toHaveBeenCalledTimes(1)
    expect(document.activeElement).not.toBe(content())
    await user.keyboard("{Escape}")
    fireEvent.pointerDown(document.body)
    await flush()
    expect(onEscapeKeyDown).toHaveBeenCalledTimes(1)
    expect(onPointerDownOutside).toHaveBeenCalledTimes(1)
    expect(content()).not.toBeNull()
  })

  test("onCloseAutoFocus can keep focus off the trigger", async () => {
    const user = setupUser()
    const onCloseAutoFocus = vi.fn((event: Event) => event.preventDefault())
    render(<Example content={{ onCloseAutoFocus }} />)
    await user.click(trigger())
    await flush()
    await user.keyboard("{Escape}")
    await flush()
    expect(onCloseAutoFocus).toHaveBeenCalledTimes(1)
    expect(document.activeElement).not.toBe(trigger())
  })

  describe("modal", () => {
    test("by default hides and locks the page behind it and a pointer down outside closes it, returning focus to the trigger", async () => {
      const user = setupUser()
      render(<Example />)
      await user.click(trigger())
      await flush()
      expect(outside().closest("[inert]")).not.toBeNull()
      expect(content()!.closest("[inert]")).toBeNull()
      expect(document.body.style.overflow).toBe("hidden")
      await user.click(outside())
      await flush()
      expect(content()).toBeNull()
      expect(outside().closest("[inert]")).toBeNull()
      expect(document.body.style.overflow).toBe("")
      expect(document.activeElement).toBe(trigger())
    })

    test("focus moving outside does not close it", async () => {
      const user = setupUser()
      render(<Example />)
      await user.click(trigger())
      await flush()
      fireEvent.focusIn(outside())
      await flush()
      expect(content()).not.toBeNull()
    })

    test("a right click outside closes it without taking focus back", async () => {
      const user = setupUser()
      render(<Example />)
      await user.click(trigger())
      await flush()
      fireEvent.pointerDown(outside(), { button: 2 })
      await flush()
      expect(content()).toBeNull()
      expect(document.activeElement).not.toBe(trigger())
    })

    test("modal={false} leaves the page usable, closes on focus outside and does not steal focus back", async () => {
      const user = setupUser()
      render(<Example root={{ modal: false }} />)
      await user.click(trigger())
      await flush()
      expect(outside().closest("[inert]")).toBeNull()
      expect(document.body.style.overflow).toBe("")
      outside().focus()
      await flush()
      expect(content()).toBeNull()
      expect(document.activeElement).toBe(outside())
    })

    test("modal={false} closes on a pointer down outside and leaves focus where the user went", async () => {
      const user = setupUser()
      render(<Example root={{ modal: false }} />)
      await user.click(trigger())
      await flush()
      await user.click(outside())
      await flush()
      expect(content()).toBeNull()
      expect(document.activeElement).toBe(outside())
    })
  })

  test("stays mounted with data-state closed until the exit animation ends, and releases the page right away", async () => {
    const endAnimation = mockAnimations()
    const user = setupUser()
    render(<Example />)
    await user.click(trigger())
    await flush()
    const menu = content()!
    await user.keyboard("{Escape}")
    await flush()
    expect(content()).toBe(menu)
    expect(menu.getAttribute("data-state")).toBe("closed")
    expect(outside().closest("[inert]")).toBeNull()
    expect(document.body.style.overflow).toBe("")
    endAnimation(menu)
    await flush()
    expect(content()).toBeNull()
    expect(document.querySelector("[data-radix-popper-content-wrapper]")).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  test("asChild trigger with a plain function component", async () => {
    const user = setupUser()
    const Button = (props: ComponentProps<"button">) => <button type="button" {...props} />
    render(
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button>Launch</Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item>Profile</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    )
    const launch = screen.getByRole("button", { name: "Launch" })
    await user.click(launch)
    await flush()
    expect(launch.getAttribute("aria-expanded")).toBe("true")
    expect(launch.getAttribute("aria-haspopup")).toBe("menu")
    await user.keyboard("{Escape}")
    await flush()
    expect(document.activeElement).toBe(launch)
  })

  test("parts forward their refs", async () => {
    const triggerRef = createRef<HTMLButtonElement>()
    const contentRef = createRef<HTMLDivElement>()
    const itemRef = createRef<HTMLDivElement>()
    render(
      <DropdownMenu.Root defaultOpen>
        <DropdownMenu.Trigger ref={triggerRef}>Open</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content ref={contentRef}>
            <DropdownMenu.Item ref={itemRef}>Profile</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    )
    await flush()
    expect(triggerRef.current?.tagName).toBe("BUTTON")
    expect(contentRef.current?.getAttribute("role")).toBe("menu")
    expect(itemRef.current?.getAttribute("role")).toBe("menuitem")
  })

  test("dir is passed to the content", async () => {
    render(<Example root={{ defaultOpen: true, dir: "rtl" }} />)
    await flush()
    expect(content()!.getAttribute("dir")).toBe("rtl")
  })

  test("inside a dialog: Escape closes only the menu, and the dialog gets its focus back on the trigger", async () => {
    const user = setupUser()
    render(
      <Dialog.Root defaultOpen>
        <Dialog.Portal>
          <Dialog.Content data-testid="dialog">
            <Dialog.Title>Settings</Dialog.Title>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger data-testid="trigger">Open</DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content data-testid="content">
                  <DropdownMenu.Item>Profile</DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )
    await flush()
    await user.click(trigger())
    await flush()
    expect(content()!.closest("[inert]")).toBeNull()
    await user.keyboard("{Escape}")
    await flush()
    expect(content()).toBeNull()
    expect(screen.queryByTestId("dialog")).not.toBeNull()
    expect(screen.getByTestId("dialog").closest("[inert]")).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  test("Content outside a DropdownMenu throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<DropdownMenu.Content />)).toThrow(/Menu/)
    spy.mockRestore()
  })
})
