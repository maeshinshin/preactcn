import { createRef, type ComponentProps } from "preact"
import { fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
import { flush, mockLayout, setupUser, useFakeTimers } from "./helpers"
import * as ContextMenu from "../src/radix/context-menu"

function Example({ root, trigger, content }: { root?: ComponentProps<typeof ContextMenu.Root>; trigger?: ComponentProps<typeof ContextMenu.Trigger>; content?: ComponentProps<typeof ContextMenu.Content> }) {
  return (
    <div>
      <button type="button">outside</button>
      <ContextMenu.Root {...root}>
        <ContextMenu.Trigger data-testid="trigger" {...trigger}>
          Right click here
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content data-testid="content" {...content}>
            <ContextMenu.Item>Back</ContextMenu.Item>
            <ContextMenu.Item>Reload</ContextMenu.Item>
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger>More</ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent data-testid="sub-content">
                  <ContextMenu.Item>Save as</ContextMenu.Item>
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    </div>
  )
}

const trigger = () => screen.getByTestId("trigger")
const content = () => screen.queryByTestId("content")
const outside = () => screen.getByRole("button", { name: "outside" })
const wrapper = () => screen.getByTestId("content").parentElement!
const active = () => document.activeElement as HTMLElement

// A mouse right click: the contextmenu event carries the pointer position
const rightClick = (x = 200, y = 300) => fireEvent.contextMenu(trigger(), { clientX: x, clientY: y })

useFakeTimers()

describe("context menu", () => {
  test("is closed by default and the trigger is a plain span", () => {
    render(<Example />)
    expect(content()).toBeNull()
    expect(trigger().tagName).toBe("SPAN")
    expect(trigger().getAttribute("data-state")).toBe("closed")
    expect(trigger().hasAttribute("aria-haspopup")).toBe(false)
  })

  test("opens on contextmenu next to the pointer and keeps the native menu away", async () => {
    mockLayout({ anchor: { left: 0, top: 0, width: 0, height: 0 } })
    const { container } = render(<Example />)
    const prevented = !rightClick(200, 300)
    await flush(50)
    expect(prevented).toBe(true)
    const menu = screen.getByRole("menu")
    expect(menu).toBe(content())
    expect(container.contains(menu)).toBe(false)
    expect(trigger().getAttribute("data-state")).toBe("open")
    expect(menu.getAttribute("data-side")).toBe("right")
    expect(menu.getAttribute("data-align")).toBe("start")
    // To the right of the pointer with a 2px gap, top edge on the pointer
    expect(wrapper().style.transform).toBe("translate(202px, 300px)")
  })

  test("a second right click elsewhere moves the open menu", async () => {
    mockLayout({ anchor: { left: 0, top: 0, width: 0, height: 0 } })
    render(<Example root={{ modal: false }} />)
    rightClick(200, 300)
    await flush(50)
    rightClick(400, 100)
    await flush(50)
    expect(wrapper().style.transform).toBe("translate(402px, 100px)")
  })

  test("side, sideOffset and align can be overridden", async () => {
    mockLayout({ anchor: { left: 0, top: 0, width: 0, height: 0 } })
    render(<Example content={{ side: "bottom", sideOffset: 6, align: "center" }} />)
    rightClick(400, 300)
    await flush(50)
    expect(content()!.getAttribute("data-side")).toBe("bottom")
    expect(content()!.getAttribute("data-align")).toBe("center")
    expect(wrapper().style.transform).toBe("translate(360px, 306px)")
  })

  test("re-exposes the popper variables under the context menu namespace, for the submenu too", async () => {
    const user = setupUser()
    render(<Example />)
    rightClick()
    await flush(50)
    const names = ["content-transform-origin", "content-available-width", "content-available-height", "trigger-width", "trigger-height"]
    for (const name of names) expect(content()!.style.getPropertyValue(`--radix-context-menu-${name}`)).toMatch(/^var\(--radix-popper-/)
    await user.click(screen.getByRole("menuitem", { name: "More" }))
    await flush(50)
    for (const name of names) expect(screen.getByTestId("sub-content").style.getPropertyValue(`--radix-context-menu-${name}`)).toMatch(/^var\(--radix-popper-/)
  })

  test("a disabled trigger leaves the native context menu alone", async () => {
    render(<Example trigger={{ disabled: true }} />)
    expect(trigger().getAttribute("data-disabled")).toBe("")
    const prevented = !rightClick()
    await flush()
    expect(prevented).toBe(false)
    expect(content()).toBeNull()
  })

  test("the menu itself takes focus, and the keyboard moves into the items", async () => {
    const user = setupUser()
    render(<Example />)
    rightClick()
    await flush()
    expect(active()).toBe(content())
    await user.keyboard("{ArrowDown}")
    expect(active()).toBe(screen.getByRole("menuitem", { name: "Back" }))
  })

  test("reports open changes; Escape closes it and gives focus back to what had it", async () => {
    const user = setupUser()
    const onOpenChange = vi.fn()
    render(<Example root={{ onOpenChange }} />)
    outside().focus()
    rightClick()
    await flush()
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    await user.keyboard("{Escape}")
    await flush()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    expect(content()).toBeNull()
    expect(active()).toBe(outside())
  })

  test("selecting an item closes it", async () => {
    const user = setupUser()
    render(<Example />)
    rightClick()
    await flush()
    await user.click(screen.getByRole("menuitem", { name: "Back" }))
    await flush()
    expect(content()).toBeNull()
  })

  test("controlled open", async () => {
    const onOpenChange = vi.fn()
    const { rerender } = render(<Example root={{ open: false, onOpenChange }} />)
    rightClick()
    await flush()
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(content()).toBeNull()
    rerender(<Example root={{ open: true, onOpenChange }} />)
    await flush()
    expect(content()).not.toBeNull()
  })

  test("modal by default: the page behind is hidden and locked, and a pointer down outside closes it", async () => {
    const user = setupUser()
    render(<Example />)
    rightClick()
    await flush()
    expect(outside().closest("[inert]")).not.toBeNull()
    expect(document.body.style.overflow).toBe("hidden")
    await user.click(outside())
    await flush()
    expect(content()).toBeNull()
    expect(outside().closest("[inert]")).toBeNull()
    expect(document.body.style.overflow).toBe("")
  })

  test("modal={false} leaves the page usable and focus stays where the user went", async () => {
    const user = setupUser()
    render(<Example root={{ modal: false }} />)
    rightClick()
    await flush()
    expect(outside().closest("[inert]")).toBeNull()
    await user.click(outside())
    await flush()
    expect(content()).toBeNull()
    expect(active()).toBe(outside())
  })

  describe("long press", () => {
    const touch = { pointerType: "touch", clientX: 150, clientY: 250 }

    test("a touch held for 700ms opens it at the touch point", async () => {
      mockLayout({ anchor: { left: 0, top: 0, width: 0, height: 0 } })
      render(<Example />)
      fireEvent.pointerDown(trigger(), touch)
      await flush(699)
      expect(content()).toBeNull()
      await flush(1)
      expect(content()).not.toBeNull()
      await flush(50)
      expect(wrapper().style.transform).toBe("translate(152px, 250px)")
    })

    test.each([["pointerMove"], ["pointerUp"], ["pointerCancel"]] as const)("%s before that cancels it", async (event) => {
      render(<Example />)
      fireEvent.pointerDown(trigger(), touch)
      await flush(300)
      fireEvent[event](trigger(), touch)
      await flush(1000)
      expect(content()).toBeNull()
    })

    test("a mouse pointer down does not start it", async () => {
      render(<Example />)
      fireEvent.pointerDown(trigger(), { pointerType: "mouse", clientX: 1, clientY: 1 })
      await flush(1000)
      expect(content()).toBeNull()
    })

    test("a touch on the trigger closes an open menu before the next press starts", async () => {
      render(<Example root={{ modal: false }} />)
      rightClick()
      await flush()
      fireEvent.pointerDown(trigger(), touch)
      await flush()
      expect(content()).toBeNull()
    })

    test("a disabled trigger ignores it", async () => {
      render(<Example trigger={{ disabled: true }} />)
      fireEvent.pointerDown(trigger(), touch)
      await flush(1000)
      expect(content()).toBeNull()
    })

    test("the timer is dropped when the trigger goes away", async () => {
      const { unmount } = render(<Example />)
      fireEvent.pointerDown(trigger(), touch)
      unmount()
      await flush(1000)
      expect(document.querySelector("[role=menu]")).toBeNull()
    })
  })

  test("the trigger can render as its child and parts forward their refs", async () => {
    const triggerRef = createRef<HTMLElement>()
    const contentRef = createRef<HTMLDivElement>()
    render(
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild ref={triggerRef}>
          <section data-testid="area">area</section>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content ref={contentRef}>
            <ContextMenu.CheckboxItem checked>Show</ContextMenu.CheckboxItem>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
    )
    fireEvent.contextMenu(screen.getByTestId("area"), { clientX: 1, clientY: 1 })
    await flush()
    expect(triggerRef.current?.tagName).toBe("SECTION")
    expect(screen.getByTestId("area").getAttribute("data-state")).toBe("open")
    expect(contentRef.current?.getAttribute("role")).toBe("menu")
    expect(screen.getByRole("menuitemcheckbox").getAttribute("aria-checked")).toBe("true")
  })
})
