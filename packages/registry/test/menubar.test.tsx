import { createRef, type ComponentProps } from "preact"
import { useState } from "preact/hooks"
import { fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
import { flush, setupUser, useFakeTimers } from "./helpers"
import * as Menubar from "../src/radix/menubar"

function Example({ root, loop }: { root?: ComponentProps<typeof Menubar.Root>; loop?: boolean }) {
  return (
    <div>
      <button type="button">outside</button>
      <Menubar.Root data-testid="bar" loop={loop} {...root}>
        <Menubar.Menu>
          <Menubar.Trigger data-testid="file">File</Menubar.Trigger>
          <Menubar.Portal>
            <Menubar.Content data-testid="file-content">
              <Menubar.Item>New</Menubar.Item>
              <Menubar.Sub>
                <Menubar.SubTrigger data-testid="share">Share</Menubar.SubTrigger>
                <Menubar.Portal>
                  <Menubar.SubContent data-testid="share-content">
                    <Menubar.Item>Email</Menubar.Item>
                  </Menubar.SubContent>
                </Menubar.Portal>
              </Menubar.Sub>
              <Menubar.Item>Print</Menubar.Item>
            </Menubar.Content>
          </Menubar.Portal>
        </Menubar.Menu>
        <Menubar.Menu>
          <Menubar.Trigger data-testid="edit">Edit</Menubar.Trigger>
          <Menubar.Portal>
            <Menubar.Content data-testid="edit-content">
              <Menubar.Item>Undo</Menubar.Item>
              <Menubar.Item>Redo</Menubar.Item>
            </Menubar.Content>
          </Menubar.Portal>
        </Menubar.Menu>
        <Menubar.Menu>
          <Menubar.Trigger data-testid="view" disabled>
            View
          </Menubar.Trigger>
          <Menubar.Portal>
            <Menubar.Content data-testid="view-content">
              <Menubar.Item>Zoom</Menubar.Item>
            </Menubar.Content>
          </Menubar.Portal>
        </Menubar.Menu>
        <Menubar.Menu>
          <Menubar.Trigger data-testid="help">Help</Menubar.Trigger>
          <Menubar.Portal>
            <Menubar.Content data-testid="help-content">
              <Menubar.Item>About</Menubar.Item>
            </Menubar.Content>
          </Menubar.Portal>
        </Menubar.Menu>
      </Menubar.Root>
    </div>
  )
}

const t = (id: string) => screen.getByTestId(id)
const q = (id: string) => screen.queryByTestId(id)
const outside = () => screen.getByRole("button", { name: "outside" })
const active = () => document.activeElement as HTMLElement
const item = (name: string) => screen.getByRole("menuitem", { name })

useFakeTimers()

describe("menubar", () => {
  test("the bar has role menubar and its triggers are menu items describing their popup", () => {
    render(<Example />)
    expect(t("bar").getAttribute("role")).toBe("menubar")
    expect(t("file").tagName).toBe("BUTTON")
    expect(t("file").getAttribute("type")).toBe("button")
    expect(t("file").getAttribute("role")).toBe("menuitem")
    expect(t("file").getAttribute("aria-haspopup")).toBe("menu")
    expect(t("file").getAttribute("aria-expanded")).toBe("false")
    expect(t("file").hasAttribute("aria-controls")).toBe(false)
    expect(t("file").getAttribute("data-state")).toBe("closed")
    expect(t("file").id).not.toBe("")
    expect(t("view").hasAttribute("disabled")).toBe(true)
    expect(t("view").getAttribute("data-disabled")).toBe("")
  })

  test("a pointer down on a trigger opens its menu, labelled by the trigger, without locking the page", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(t("file"))
    await flush(50)
    const menu = t("file-content")
    expect(menu.getAttribute("role")).toBe("menu")
    expect(menu.getAttribute("aria-labelledby")).toBe(t("file").id)
    expect(menu.hasAttribute("data-radix-menubar-content")).toBe(true)
    expect(menu.getAttribute("data-align")).toBe("start")
    expect(t("file").getAttribute("aria-expanded")).toBe("true")
    expect(t("file").getAttribute("aria-controls")).toBe(menu.id)
    expect(t("file").getAttribute("data-state")).toBe("open")
    expect(outside().closest("[inert]")).toBeNull()
    expect(document.body.style.overflow).toBe("")
    // Opened with the pointer: the menu has focus but no item is highlighted
    expect(active()).toBe(menu)
  })

  test("re-exposes the popper variables under the menubar namespace, for submenus too", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(t("file"))
    await flush(50)
    const names = ["content-transform-origin", "content-available-width", "content-available-height", "trigger-width", "trigger-height"]
    for (const name of names) expect(t("file-content").style.getPropertyValue(`--radix-menubar-${name}`)).toMatch(/^var\(--radix-popper-/)
    await user.click(t("share"))
    await flush(50)
    for (const name of names) expect(t("share-content").style.getPropertyValue(`--radix-menubar-${name}`)).toMatch(/^var\(--radix-popper-/)
    expect(t("share").hasAttribute("data-radix-menubar-subtrigger")).toBe(true)
    expect(t("share-content").hasAttribute("data-radix-menubar-content")).toBe(true)
  })

  test("hovering another trigger switches the open menu and moves focus there; hovering with nothing open does nothing", async () => {
    const user = setupUser()
    render(<Example />)
    await user.hover(t("edit"))
    await flush(50)
    expect(q("edit-content")).toBeNull()
    await user.click(t("file"))
    await flush(50)
    await user.hover(t("edit"))
    await flush(50)
    expect(q("file-content")).toBeNull()
    expect(t("edit-content")).not.toBeNull()
    expect(t("edit").getAttribute("aria-expanded")).toBe("true")
  })

  test.each([["{Enter}"], [" "], ["{ArrowDown}"]])("%s on a focused trigger opens its menu and highlights the first item", async (key) => {
    const user = setupUser()
    render(<Example />)
    t("file").focus()
    await user.keyboard(key)
    await flush(50)
    expect(q("file-content")).not.toBeNull()
    expect(active()).toBe(item("New"))
  })

  test("Enter on the trigger while its menu is open closes it", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(t("file"))
    await flush(50)
    // A key press can reach the trigger while its menu is open, e.g. through assistive technology
    fireEvent.keyDown(t("file"), { key: "Enter" })
    await flush(50)
    expect(q("file-content")).toBeNull()
  })

  test("ArrowRight and ArrowLeft inside a menu open the neighbouring menu, skipping disabled triggers and looping", async () => {
    const user = setupUser()
    render(<Example />)
    t("file").focus()
    await user.keyboard("{ArrowDown}")
    await flush(50)
    await user.keyboard("{ArrowRight}")
    await flush(50)
    expect(q("file-content")).toBeNull()
    expect(q("edit-content")).not.toBeNull()
    // Switching does not highlight an item: only the trigger's own key press does
    expect(active()).toBe(t("edit-content"))
    await user.keyboard("{ArrowRight}")
    await flush(50)
    expect(q("help-content")).not.toBeNull()
    expect(q("view-content")).toBeNull()
    await user.keyboard("{ArrowRight}")
    await flush(50)
    expect(q("file-content")).not.toBeNull()
    await user.keyboard("{ArrowLeft}")
    await flush(50)
    expect(q("help-content")).not.toBeNull()
  })

  test("without loop the neighbours stop at the ends", async () => {
    const user = setupUser()
    render(<Example loop={false} />)
    t("help").focus()
    await user.keyboard("{ArrowDown}")
    await flush(50)
    await user.keyboard("{ArrowRight}")
    await flush(50)
    expect(q("help-content")).not.toBeNull()
  })

  test("ArrowRight on a submenu trigger opens the submenu instead of switching, ArrowLeft in it closes only the submenu", async () => {
    const user = setupUser()
    render(<Example />)
    t("file").focus()
    await user.keyboard("{ArrowDown}{ArrowDown}")
    expect(active()).toBe(t("share"))
    await user.keyboard("{ArrowRight}")
    await flush(50)
    expect(q("share-content")).not.toBeNull()
    expect(q("file-content")).not.toBeNull()
    expect(active()).toBe(item("Email"))
    await user.keyboard("{ArrowLeft}")
    await flush(50)
    expect(q("share-content")).toBeNull()
    expect(q("file-content")).not.toBeNull()
    expect(active()).toBe(t("share"))
  })

  test("Escape closes the menu and returns focus to its trigger", async () => {
    const user = setupUser()
    const onValueChange = vi.fn()
    render(<Example root={{ onValueChange }} />)
    await user.click(t("file"))
    await flush(50)
    await user.keyboard("{Escape}")
    await flush(50)
    expect(q("file-content")).toBeNull()
    expect(active()).toBe(t("file"))
    expect(onValueChange.mock.calls.map(([value]) => (value === "" ? "" : "open"))).toEqual(["open", ""])
  })

  test("a pointer down outside closes the menu and leaves focus where the user went", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(t("file"))
    await flush(50)
    await user.click(outside())
    await flush(50)
    expect(q("file-content")).toBeNull()
    expect(active()).toBe(outside())
  })

  test("a pointer down on the trigger of the open menu closes it", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(t("file"))
    await flush(50)
    await user.click(t("file"))
    await flush(50)
    expect(q("file-content")).toBeNull()
  })

  test("selecting an item closes the menu", async () => {
    const user = setupUser()
    const onSelect = vi.fn()
    render(
      <Menubar.Root>
        <Menubar.Menu>
          <Menubar.Trigger>File</Menubar.Trigger>
          <Menubar.Portal>
            <Menubar.Content>
              <Menubar.Item onSelect={onSelect}>New</Menubar.Item>
            </Menubar.Content>
          </Menubar.Portal>
        </Menubar.Menu>
      </Menubar.Root>
    )
    await user.click(screen.getByRole("menuitem", { name: "File" }))
    await flush(50)
    await user.click(screen.getByRole("menuitem", { name: "New" }))
    await flush(50)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("menu")).toBeNull()
  })

  test("a disabled trigger cannot open its menu", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(t("view"))
    fireEvent.pointerDown(t("view"), { button: 0 })
    await flush(50)
    expect(q("view-content")).toBeNull()
  })

  describe("moving between triggers", () => {
    test("arrows move focus along the bar, skipping disabled triggers, and Home and End jump to the ends", async () => {
      const user = setupUser()
      render(<Example />)
      t("file").focus()
      await user.keyboard("{ArrowRight}")
      expect(active()).toBe(t("edit"))
      await user.keyboard("{ArrowRight}")
      expect(active()).toBe(t("help"))
      await user.keyboard("{ArrowRight}")
      expect(active()).toBe(t("file"))
      await user.keyboard("{ArrowLeft}")
      expect(active()).toBe(t("help"))
      await user.keyboard("{Home}")
      expect(active()).toBe(t("file"))
      await user.keyboard("{End}")
      expect(active()).toBe(t("help"))
    })

    test("without loop the arrows stop at the ends", async () => {
      const user = setupUser()
      render(<Example loop={false} />)
      t("help").focus()
      await user.keyboard("{ArrowRight}")
      expect(active()).toBe(t("help"))
      t("file").focus()
      await user.keyboard("{ArrowLeft}")
      expect(active()).toBe(t("file"))
    })

    test("in rtl the arrows are mirrored", async () => {
      const user = setupUser()
      render(<Example root={{ dir: "rtl" }} />)
      t("file").focus()
      await user.keyboard("{ArrowLeft}")
      expect(active()).toBe(t("edit"))
    })

    test("only the trigger that last had focus stays in the tab order", async () => {
      const user = setupUser()
      render(<Example />)
      expect(["file", "edit", "help"].map((id) => t(id).tabIndex)).toEqual([0, 0, 0])
      await user.tab()
      expect(active()).toBe(outside())
      await user.tab()
      expect(active()).toBe(t("file"))
      expect(["file", "edit", "help"].map((id) => t(id).tabIndex)).toEqual([0, -1, -1])
      await user.keyboard("{ArrowRight}")
      expect(["file", "edit", "help"].map((id) => t(id).tabIndex)).toEqual([-1, 0, -1])
      await user.tab({ shift: true })
      expect(active()).toBe(outside())
    })

    test("opening a menu makes its trigger the tab stop", async () => {
      const user = setupUser()
      render(<Example />)
      await user.click(t("help"))
      await flush(50)
      expect(["file", "edit", "help"].map((id) => t(id).tabIndex)).toEqual([-1, -1, 0])
    })
  })

  describe("value", () => {
    test("defaultValue opens a menu, and Menu takes a value of its own", async () => {
      render(
        <Menubar.Root defaultValue="edit">
          <Menubar.Menu value="file">
            <Menubar.Trigger>File</Menubar.Trigger>
            <Menubar.Portal>
              <Menubar.Content data-testid="file-content">
                <Menubar.Item>New</Menubar.Item>
              </Menubar.Content>
            </Menubar.Portal>
          </Menubar.Menu>
          <Menubar.Menu value="edit">
            <Menubar.Trigger>Edit</Menubar.Trigger>
            <Menubar.Portal>
              <Menubar.Content data-testid="edit-content">
                <Menubar.Item>Undo</Menubar.Item>
              </Menubar.Content>
            </Menubar.Portal>
          </Menubar.Menu>
        </Menubar.Root>
      )
      await flush(50)
      expect(q("file-content")).toBeNull()
      expect(q("edit-content")).not.toBeNull()
    })

    test("controlled value reports the requested menu and waits for the parent", async () => {
      const user = setupUser()
      const onValueChange = vi.fn()
      function Controlled() {
        const [value, setValue] = useState("")
        return (
          <Menubar.Root
            value={value}
            onValueChange={(next: string) => {
              onValueChange(next)
              if (next !== "file") setValue(next)
            }}
          >
            <Menubar.Menu value="file">
              <Menubar.Trigger>File</Menubar.Trigger>
              <Menubar.Portal>
                <Menubar.Content data-testid="file-content">
                  <Menubar.Item>New</Menubar.Item>
                </Menubar.Content>
              </Menubar.Portal>
            </Menubar.Menu>
            <Menubar.Menu value="edit">
              <Menubar.Trigger>Edit</Menubar.Trigger>
              <Menubar.Portal>
                <Menubar.Content data-testid="edit-content">
                  <Menubar.Item>Undo</Menubar.Item>
                </Menubar.Content>
              </Menubar.Portal>
            </Menubar.Menu>
          </Menubar.Root>
        )
      }
      render(<Controlled />)
      await user.click(screen.getByRole("menuitem", { name: "File" }))
      await flush(50)
      expect(onValueChange).toHaveBeenLastCalledWith("file")
      expect(q("file-content")).toBeNull()
      await user.click(screen.getByRole("menuitem", { name: "Edit" }))
      await flush(50)
      expect(q("edit-content")).not.toBeNull()
    })
  })

  test("parts forward their refs", () => {
    const barRef = createRef<HTMLDivElement>()
    const triggerRef = createRef<HTMLButtonElement>()
    render(
      <Menubar.Root ref={barRef}>
        <Menubar.Menu>
          <Menubar.Trigger ref={triggerRef}>File</Menubar.Trigger>
        </Menubar.Menu>
      </Menubar.Root>
    )
    expect(barRef.current?.getAttribute("role")).toBe("menubar")
    expect(triggerRef.current?.tagName).toBe("BUTTON")
  })
})
