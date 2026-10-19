import { createRef, type ComponentChildren, type ComponentProps } from "preact"
import { useState } from "preact/hooks"
import { fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
import { flush, mockAnimations, mockLayout, setupUser, useFakeTimers } from "./helpers"
import * as Dialog from "../src/radix/dialog"
import * as Select from "../src/radix/select"

function Item({ value, children, disabled }: { value: string; children: ComponentChildren; disabled?: boolean }) {
  return (
    <Select.Item value={value} disabled={disabled}>
      <Select.ItemIndicator data-testid={`indicator-${value}`}>v</Select.ItemIndicator>
      <Select.ItemText>{children}</Select.ItemText>
    </Select.Item>
  )
}

function Example({
  root,
  trigger,
  content,
  withValueChildren,
}: {
  root?: ComponentProps<typeof Select.Root>
  trigger?: ComponentProps<typeof Select.Trigger>
  content?: ComponentProps<typeof Select.Content>
  withValueChildren?: ComponentChildren
}) {
  return (
    <div>
      <button type="button">outside</button>
      <Select.Root {...root}>
        <Select.Trigger data-testid="trigger" {...trigger}>
          <Select.Value data-testid="value" placeholder="Pick a fruit">
            {withValueChildren}
          </Select.Value>
          <Select.Icon data-testid="icon" />
        </Select.Trigger>
        <Select.Portal>
          <Select.Content data-testid="content" position="popper" {...content}>
            <Select.ScrollUpButton data-testid="up">up</Select.ScrollUpButton>
            <Select.Viewport data-testid="viewport">
              <Select.Group data-testid="group">
                <Select.Label data-testid="label">Fruits</Select.Label>
                <Item value="apple">Apple</Item>
                <Item value="banana">Banana</Item>
                <Item value="grapes" disabled>
                  Grapes
                </Item>
                <Item value="pineapple">Pineapple</Item>
              </Select.Group>
              <Select.Separator data-testid="separator" />
              <Item value="carrot">Carrot</Item>
            </Select.Viewport>
            <Select.ScrollDownButton data-testid="down">down</Select.ScrollDownButton>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  )
}

const trigger = () => screen.getByTestId("trigger")
const valueNode = () => screen.getByTestId("value")
const content = () => screen.queryByTestId("content")
const outside = () => screen.getByRole("button", { name: "outside" })
const option = (name: string) => screen.getByRole("option", { name })
const active = () => document.activeElement as HTMLElement

// happy-dom reports 0 for pageX and pageY, which the drag logic reads
function firePointer(type: string, target: Document | Element, { x, y, pointerType = "mouse" }: { x: number; y: number; pointerType?: string }) {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerType, button: 0, clientX: x, clientY: y })
  Object.defineProperty(event, "pageX", { value: x })
  Object.defineProperty(event, "pageY", { value: y })
  fireEvent(target, event)
}

// A press on the trigger: the list opens, and the release that follows must not select what appeared under the pointer
async function openWithMouse(user: ReturnType<typeof setupUser>) {
  await user.pointer({ keys: "[MouseLeft>]", target: trigger() })
  await flush(50)
  await user.pointer({ keys: "[/MouseLeft]" })
}

useFakeTimers()

describe("select trigger and value", () => {
  test("is a closed combobox showing the placeholder", () => {
    render(<Example />)
    expect(trigger().getAttribute("role")).toBe("combobox")
    expect(trigger().getAttribute("type")).toBe("button")
    expect(trigger().getAttribute("aria-expanded")).toBe("false")
    expect(trigger().hasAttribute("aria-controls")).toBe(false)
    expect(trigger().getAttribute("aria-autocomplete")).toBe("none")
    expect(trigger().getAttribute("data-state")).toBe("closed")
    expect(trigger().getAttribute("data-placeholder")).toBe("")
    expect(trigger().getAttribute("dir")).toBe("ltr")
    expect(valueNode().textContent).toBe("Pick a fruit")
    expect(valueNode().style.pointerEvents).toBe("none")
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(screen.queryAllByRole("option")).toHaveLength(0)
  })

  test("the icon is decorative and defaults to a triangle", () => {
    render(<Example />)
    expect(screen.getByTestId("icon").getAttribute("aria-hidden")).toBe("true")
    expect(screen.getByTestId("icon").textContent).toBe("▼")
  })

  test("the icon can render as its child", () => {
    render(
      <Select.Root>
        <Select.Trigger>
          <Select.Icon asChild>
            <svg data-testid="chevron" />
          </Select.Icon>
        </Select.Trigger>
      </Select.Root>
    )
    expect(screen.getByTestId("chevron").getAttribute("aria-hidden")).toBe("true")
  })

  test("a value shows the text of its item while the list is closed, and the items stay out of the page", async () => {
    render(<Example root={{ defaultValue: "banana" }} />)
    await flush()
    expect(valueNode().textContent).toBe("Banana")
    expect(trigger().hasAttribute("data-placeholder")).toBe(false)
    expect(screen.queryAllByText("Apple")).toHaveLength(0)
    expect(screen.queryAllByText("Banana")).toHaveLength(1)
    expect(screen.queryAllByRole("option")).toHaveLength(0)
    expect(document.body.querySelector("[data-radix-select-viewport]")).toBeNull()
  })

  test("the value follows a controlled value and shows rich item content", async () => {
    function Rich({ value }: { value: string }) {
      return (
        <Select.Root value={value}>
          <Select.Trigger data-testid="trigger">
            <Select.Value data-testid="value" placeholder="Pick" />
          </Select.Trigger>
          <Select.Portal>
            <Select.Content>
              <Select.Viewport>
                <Select.Item value="a">
                  <Select.ItemText>
                    <b>Alpha</b> one
                  </Select.ItemText>
                </Select.Item>
                <Select.Item value="b">
                  <Select.ItemText>Beta</Select.ItemText>
                </Select.Item>
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      )
    }
    const { rerender } = render(<Rich value="a" />)
    await flush()
    expect(valueNode().innerHTML).toBe("<b>Alpha</b> one")
    rerender(<Rich value="b" />)
    await flush()
    expect(valueNode().textContent).toBe("Beta")
    rerender(<Rich value="" />)
    await flush()
    expect(valueNode().textContent).toBe("Pick")
    expect(trigger().getAttribute("data-placeholder")).toBe("")
  })

  test("a value with children of its own shows those", async () => {
    render(<Example root={{ defaultValue: "banana" }} withValueChildren="Custom" />)
    await flush()
    expect(valueNode().textContent).toBe("Custom")
  })

  test("a placeholder can be any content", () => {
    render(
      <Select.Root>
        <Select.Trigger>
          <Select.Value data-testid="value" placeholder={<em>Choose</em>} />
        </Select.Trigger>
      </Select.Root>
    )
    expect(valueNode().innerHTML).toBe("<em>Choose</em>")
  })

  test("className and style on the value are ignored", () => {
    render(
      <Select.Root>
        <Select.Trigger>
          <Select.Value data-testid="value" className="styled" style={{ color: "red" }} />
        </Select.Trigger>
      </Select.Root>
    )
    expect(valueNode().className).toBe("")
    expect(valueNode().style.color).toBe("")
  })

  test("required is announced and a disabled root or trigger cannot open", async () => {
    const user = setupUser()
    const { unmount } = render(<Example root={{ required: true }} />)
    expect(trigger().getAttribute("aria-required")).toBe("true")
    unmount()
    for (const props of [{ root: { disabled: true } }, { trigger: { disabled: true } }]) {
      const { unmount } = render(<Example {...props} />)
      expect(trigger().hasAttribute("disabled")).toBe(true)
      expect(trigger().getAttribute("data-disabled")).toBe("")
      await user.click(trigger())
      fireEvent.keyDown(trigger(), { key: "Enter" })
      await flush()
      expect(content()).toBeNull()
      unmount()
    }
  })
})

describe("opening", () => {
  test("a mouse press opens the list in a popper wrapper in body and describes it", async () => {
    mockLayout({ anchor: { left: 100, top: 100, width: 50, height: 20 }, anchorId: "trigger" })
    const user = setupUser()
    const { container } = render(<Example />)
    await user.pointer({ keys: "[MouseLeft>]", target: trigger() })
    await flush(50)
    const list = screen.getByRole("listbox")
    expect(list).toBe(content())
    expect(container.contains(list)).toBe(false)
    expect(list.parentElement!.hasAttribute("data-radix-popper-content-wrapper")).toBe(true)
    expect(list.parentElement!.parentElement).toBe(document.body)
    expect(list.getAttribute("data-state")).toBe("open")
    expect(list.getAttribute("dir")).toBe("ltr")
    expect(list.getAttribute("data-side")).toBe("bottom")
    expect(list.getAttribute("data-align")).toBe("start")
    expect(trigger().getAttribute("aria-expanded")).toBe("true")
    expect(trigger().getAttribute("aria-controls")).toBe(list.id)
    expect(trigger().getAttribute("data-state")).toBe("open")
    // Flex layout for the scroll buttons, and no outline on a list that may take focus
    expect(list.style.display).toBe("flex")
    expect(list.style.flexDirection).toBe("column")
    expect(list.style.boxSizing).toBe("border-box")
  })

  test("the popper position keeps a margin to the viewport and exposes the select variables", async () => {
    mockLayout({ anchor: { left: 0, top: 100, width: 50, height: 20 }, anchorId: "trigger" })
    const user = setupUser()
    render(<Example content={{ align: "start" }} />)
    await user.pointer({ keys: "[MouseLeft>]", target: trigger() })
    await flush(50)
    const list = content()!
    // Pushed in from the left edge by the collision padding
    expect(list.parentElement!.style.transform).toBe("translate(10px, 120px)")
    for (const name of ["content-transform-origin", "content-available-width", "content-available-height", "trigger-width", "trigger-height"])
      expect(list.style.getPropertyValue(`--radix-select-${name}`)).toMatch(/^var\(--radix-popper-/)
  })

  test("the items exist once open: options with their state, and the selected one has focus", async () => {
    mockLayout({ anchor: { left: 100, top: 100, width: 50, height: 20 }, anchorId: "trigger" })
    const user = setupUser()
    render(<Example root={{ defaultValue: "banana" }} />)
    await flush()
    await user.pointer({ keys: "[MouseLeft>]", target: trigger() })
    await flush(50)
    expect(screen.getAllByRole("option")).toHaveLength(5)
    expect(screen.getByRole("listbox").getAttribute("tabindex")).toBe("-1")
    expect(option("Banana").getAttribute("data-state")).toBe("checked")
    expect(option("Apple").getAttribute("data-state")).toBe("unchecked")
    expect(option("Apple").getAttribute("tabindex")).toBe("-1")
    expect(option("Apple").getAttribute("aria-labelledby")).not.toBe(null)
    expect(document.getElementById(option("Apple").getAttribute("aria-labelledby")!)!.textContent).toBe("Apple")
    expect(option("Grapes").getAttribute("aria-disabled")).toBe("true")
    expect(option("Grapes").getAttribute("data-disabled")).toBe("")
    expect(option("Grapes").hasAttribute("tabindex")).toBe(false)
    expect(active()).toBe(option("Banana"))
    expect(active().getAttribute("data-highlighted")).toBe("")
    expect(active().getAttribute("aria-selected")).toBe("true")
    expect(option("Apple").getAttribute("aria-selected")).toBe("false")
    expect(screen.getByTestId("indicator-banana").getAttribute("aria-hidden")).toBe("true")
    expect(screen.queryByTestId("indicator-apple")).toBeNull()
  })

  test("without a value the first enabled item has focus", async () => {
    mockLayout({ anchor: { left: 100, top: 100, width: 50, height: 20 }, anchorId: "trigger" })
    const user = setupUser()
    render(<Example />)
    await user.pointer({ keys: "[MouseLeft>]", target: trigger() })
    await flush(50)
    expect(active()).toBe(option("Apple"))
  })

  test("groups are labelled by their label, separators are hidden from assistive technology", async () => {
    const user = setupUser()
    render(<Example />)
    await user.pointer({ keys: "[MouseLeft>]", target: trigger() })
    await flush(50)
    expect(screen.getByTestId("group").getAttribute("role")).toBe("group")
    expect(screen.getByTestId("group").getAttribute("aria-labelledby")).toBe(screen.getByTestId("label").id)
    expect(screen.getByTestId("separator").getAttribute("aria-hidden")).toBe("true")
    expect(screen.getByTestId("viewport").getAttribute("role")).toBe("presentation")
    expect(screen.getByTestId("viewport").hasAttribute("data-radix-select-viewport")).toBe(true)
    expect(document.querySelector("style")!.textContent).toContain("[data-radix-select-viewport]")
  })

  test.each([["{Enter}"], [" "], ["{ArrowDown}"], ["{ArrowUp}"]])("%s on the focused trigger opens the list", async (key) => {
    const user = setupUser()
    render(<Example />)
    trigger().focus()
    await user.keyboard(key)
    await flush(50)
    expect(content()).not.toBeNull()
    expect(active()).toBe(option("Apple"))
  })

  test("touch and pen open on click, not on press", async () => {
    render(<Example />)
    fireEvent.pointerDown(trigger(), { pointerType: "touch", button: 0 })
    await flush(50)
    expect(content()).toBeNull()
    fireEvent.click(trigger())
    await flush(50)
    expect(content()).not.toBeNull()
  })

  test("a right button or ctrl press does not open it", async () => {
    render(<Example />)
    fireEvent.pointerDown(trigger(), { pointerType: "mouse", button: 2 })
    fireEvent.pointerDown(trigger(), { pointerType: "mouse", button: 0, ctrlKey: true })
    await flush(50)
    expect(content()).toBeNull()
  })

  test("controlled open", async () => {
    const user = setupUser()
    const onOpenChange = vi.fn()
    const { rerender } = render(<Example root={{ open: false, onOpenChange }} />)
    await user.pointer({ keys: "[MouseLeft>]", target: trigger() })
    await flush(50)
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(content()).toBeNull()
    rerender(<Example root={{ open: true, onOpenChange }} />)
    await flush(50)
    expect(content()).not.toBeNull()
  })

  test("defaultOpen mounts it open", async () => {
    render(<Example root={{ defaultOpen: true }} />)
    await flush(50)
    expect(content()).not.toBeNull()
  })

  test("the page behind is hidden and locked while open, and released after", async () => {
    const user = setupUser()
    render(<Example />)
    await user.pointer({ keys: "[MouseLeft>]", target: trigger() })
    await flush(50)
    expect(outside().closest("[inert]")).not.toBeNull()
    expect(content()!.closest("[inert]")).toBeNull()
    expect(document.body.style.overflow).toBe("hidden")
    await user.keyboard("{Escape}")
    await flush(50)
    expect(outside().closest("[inert]")).toBeNull()
    expect(document.body.style.overflow).toBe("")
  })
})

describe("choosing", () => {
  test("clicking an item selects it, reports the value, closes the list and gives focus back to the trigger", async () => {
    const user = setupUser()
    const onValueChange = vi.fn()
    const onOpenChange = vi.fn()
    render(<Example root={{ onValueChange, onOpenChange }} />)
    await openWithMouse(user)
    await user.click(option("Banana"))
    await flush(50)
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith("banana")
    expect(onOpenChange.mock.calls).toEqual([[true], [false]])
    expect(content()).toBeNull()
    expect(valueNode().textContent).toBe("Banana")
    expect(trigger().hasAttribute("data-placeholder")).toBe(false)
    expect(active()).toBe(trigger())
  })

  test("the release of the press that opened it does not select what is under the pointer", async () => {
    const user = setupUser()
    const onValueChange = vi.fn()
    render(<Example root={{ onValueChange }} />)
    await user.pointer({ keys: "[MouseLeft>]", target: trigger() })
    await flush(50)
    await user.pointer({ keys: "[/MouseLeft]", target: option("Apple") })
    await flush(50)
    expect(onValueChange).not.toHaveBeenCalled()
    expect(content()).not.toBeNull()
  })

  test("pressing on the trigger, dragging over an item and releasing selects it", async () => {
    const onValueChange = vi.fn()
    render(<Example root={{ onValueChange }} />)
    firePointer("pointerdown", trigger(), { x: 100, y: 100 })
    await flush(50)
    firePointer("pointermove", document, { x: 100, y: 160 })
    firePointer("pointermove", option("Pineapple"), { x: 100, y: 160 })
    firePointer("pointerup", option("Pineapple"), { x: 100, y: 160 })
    await flush(50)
    expect(onValueChange).toHaveBeenCalledWith("pineapple")
    expect(content()).toBeNull()
  })

  test("releasing outside the list after dragging closes it without selecting", async () => {
    const onValueChange = vi.fn()
    render(<Example root={{ onValueChange }} />)
    firePointer("pointerdown", trigger(), { x: 100, y: 100 })
    await flush(50)
    firePointer("pointermove", document, { x: 300, y: 300 })
    firePointer("pointerup", outside(), { x: 300, y: 300 })
    await flush(50)
    expect(onValueChange).not.toHaveBeenCalled()
    expect(content()).toBeNull()
  })

  test("releasing close to where the press started does not select", async () => {
    const onValueChange = vi.fn()
    render(<Example root={{ onValueChange }} />)
    firePointer("pointerdown", trigger(), { x: 100, y: 100 })
    await flush(50)
    firePointer("pointermove", option("Apple"), { x: 104, y: 103 })
    firePointer("pointerup", option("Apple"), { x: 104, y: 103 })
    await flush(50)
    expect(onValueChange).not.toHaveBeenCalled()
    expect(content()).not.toBeNull()
  })

  test("touch selects on click", async () => {
    const onValueChange = vi.fn()
    render(<Example root={{ onValueChange, defaultOpen: true }} />)
    await flush(50)
    fireEvent.pointerDown(option("Carrot"), { pointerType: "touch" })
    fireEvent.pointerUp(option("Carrot"), { pointerType: "touch" })
    expect(onValueChange).not.toHaveBeenCalled()
    fireEvent.click(option("Carrot"))
    await flush(50)
    expect(onValueChange).toHaveBeenCalledWith("carrot")
  })

  test("a disabled item selects nothing", async () => {
    const user = setupUser()
    const onValueChange = vi.fn()
    render(<Example root={{ onValueChange, defaultOpen: true }} />)
    await flush(50)
    await user.click(option("Grapes"))
    fireEvent.click(option("Grapes"))
    fireEvent.keyDown(option("Grapes"), { key: "Enter" })
    await flush(50)
    expect(onValueChange).not.toHaveBeenCalled()
    expect(content()).not.toBeNull()
  })

  test("controlled value only changes through the parent", async () => {
    const user = setupUser()
    const onValueChange = vi.fn()
    const { rerender } = render(<Example root={{ value: "apple", onValueChange }} />)
    await flush()
    expect(valueNode().textContent).toBe("Apple")
    await openWithMouse(user)
    await user.click(option("Apple"))
    await user.keyboard("{Escape}")
    await flush(50)
    trigger().focus()
    await user.keyboard("{ArrowDown}")
    await flush(50)
    await user.click(option("Banana"))
    await flush(50)
    expect(onValueChange).toHaveBeenCalledWith("banana")
    expect(valueNode().textContent).toBe("Apple")
    rerender(<Example root={{ value: "banana", onValueChange }} />)
    await flush()
    expect(valueNode().textContent).toBe("Banana")
  })

  test("Hovering an item focuses it, leaving gives focus to the list, and a disabled item does neither", async () => {
    const user = setupUser()
    render(<Example />)
    await openWithMouse(user)
    await user.hover(option("Pineapple"))
    expect(active()).toBe(option("Pineapple"))
    expect(active().getAttribute("data-highlighted")).toBe("")
    await user.unhover(option("Pineapple"))
    expect(active()).toBe(content())
    await user.hover(option("Grapes"))
    expect(active()).toBe(content())
  })

  describe("keyboard", () => {
    async function open(user: ReturnType<typeof setupUser>, props?: ComponentProps<typeof Example>) {
      render(<Example {...props} />)
      trigger().focus()
      await user.keyboard("{ArrowDown}")
      await flush(50)
    }

    test("arrows move through the enabled items without wrapping; Home and End jump to the ends", async () => {
      const user = setupUser()
      await open(user)
      expect(active()).toBe(option("Apple"))
      await user.keyboard("{ArrowDown}")
      expect(active()).toBe(option("Banana"))
      await user.keyboard("{ArrowDown}")
      expect(active()).toBe(option("Pineapple"))
      await user.keyboard("{ArrowDown}{ArrowDown}")
      expect(active()).toBe(option("Carrot"))
      await user.keyboard("{ArrowUp}")
      expect(active()).toBe(option("Pineapple"))
      await user.keyboard("{Home}")
      expect(active()).toBe(option("Apple"))
      await user.keyboard("{End}")
      expect(active()).toBe(option("Carrot"))
    })

    test("Enter and Space select the focused item", async () => {
      const user = setupUser()
      const onValueChange = vi.fn()
      await open(user, { root: { onValueChange } })
      await user.keyboard("{ArrowDown}{Enter}")
      await flush(50)
      expect(onValueChange).toHaveBeenLastCalledWith("banana")
      expect(content()).toBeNull()
      expect(active()).toBe(trigger())
      await user.keyboard("{ArrowDown}")
      await flush(50)
      expect(active()).toBe(option("Banana"))
      await user.keyboard("{ArrowDown} ")
      await flush(50)
      expect(onValueChange).toHaveBeenLastCalledWith("pineapple")
    })

    test("typing jumps to the next item starting with the letters; Space while typing does not select", async () => {
      const user = setupUser()
      const onValueChange = vi.fn()
      await open(user, { root: { onValueChange } })
      await user.keyboard("c")
      expect(active()).toBe(option("Carrot"))
      await flush(1000)
      await user.keyboard("p")
      expect(active()).toBe(option("Pineapple"))
      await user.keyboard(" ")
      await flush(50)
      expect(onValueChange).not.toHaveBeenCalled()
      expect(content()).not.toBeNull()
    })

    test("Tab does not leave the list", async () => {
      const user = setupUser()
      await open(user)
      await user.tab()
      expect(content()!.contains(active())).toBe(true)
    })

    test("Escape closes the list and gives focus back to the trigger", async () => {
      const user = setupUser()
      const onOpenChange = vi.fn()
      await open(user, { root: { onOpenChange } })
      await user.keyboard("{Escape}")
      await flush(50)
      expect(onOpenChange).toHaveBeenLastCalledWith(false)
      expect(content()).toBeNull()
      expect(active()).toBe(trigger())
    })

    test("typing on the closed trigger changes the value without opening", async () => {
      const user = setupUser()
      const onValueChange = vi.fn()
      render(<Example root={{ onValueChange }} />)
      await flush()
      trigger().focus()
      await user.keyboard("b")
      await flush()
      expect(onValueChange).toHaveBeenLastCalledWith("banana")
      expect(valueNode().textContent).toBe("Banana")
      expect(content()).toBeNull()
      await flush(1000)
      // Disabled items are skipped
      await user.keyboard("g")
      expect(onValueChange).toHaveBeenCalledTimes(1)
      await flush(1000)
      await user.keyboard("p")
      expect(onValueChange).toHaveBeenLastCalledWith("pineapple")
    })

    test("Space on the trigger while typing does not open the list", async () => {
      const user = setupUser()
      render(<Example />)
      await flush()
      trigger().focus()
      await user.keyboard("p")
      await user.keyboard(" ")
      await flush(50)
      expect(content()).toBeNull()
    })
  })
})

describe("dismissing", () => {
  test("a pointer down outside closes the list and focus goes back to the trigger", async () => {
    const user = setupUser()
    render(<Example />)
    await openWithMouse(user)
    await user.click(outside())
    await flush(50)
    expect(content()).toBeNull()
    expect(active()).toBe(trigger())
  })

  test("the window losing focus or resizing closes it", async () => {
    const user = setupUser()
    render(<Example />)
    await openWithMouse(user)
    fireEvent(window, new Event("blur"))
    await flush(50)
    expect(content()).toBeNull()
    await openWithMouse(user)
    fireEvent(window, new Event("resize"))
    await flush(50)
    expect(content()).toBeNull()
  })

  test("event props can cancel the defaults", async () => {
    const user = setupUser()
    const onEscapeKeyDown = vi.fn((event: KeyboardEvent) => event.preventDefault())
    const onPointerDownOutside = vi.fn((event: Event) => event.preventDefault())
    const onCloseAutoFocus = vi.fn((event: Event) => event.preventDefault())
    render(<Example content={{ onEscapeKeyDown, onPointerDownOutside, onCloseAutoFocus }} />)
    await openWithMouse(user)
    await user.keyboard("{Escape}")
    fireEvent.pointerDown(document.body)
    expect(onEscapeKeyDown).toHaveBeenCalledTimes(1)
    expect(onPointerDownOutside).toHaveBeenCalledTimes(1)
    expect(content()).not.toBeNull()
  })

  test("stays mounted with data-state closed until the exit animation ends, then its items go back out of the page", async () => {
    const endAnimation = mockAnimations()
    const user = setupUser()
    render(<Example root={{ defaultValue: "apple" }} />)
    await flush()
    await openWithMouse(user)
    const list = content()!
    await user.keyboard("{Escape}")
    await flush(50)
    expect(content()).toBe(list)
    expect(list.getAttribute("data-state")).toBe("closed")
    // The page is released right away
    expect(outside().closest("[inert]")).toBeNull()
    endAnimation(list)
    await flush(50)
    expect(content()).toBeNull()
    expect(screen.queryAllByRole("option")).toHaveLength(0)
    expect(valueNode().textContent).toBe("Apple")
    expect(active()).toBe(trigger())
  })

  test("inside a dialog: Escape closes only the select and the trigger keeps focus", async () => {
    const user = setupUser()
    render(
      <Dialog.Root defaultOpen>
        <Dialog.Portal>
          <Dialog.Content data-testid="dialog">
            <Dialog.Title>Pick</Dialog.Title>
            <Select.Root>
              <Select.Trigger data-testid="trigger">
                <Select.Value placeholder="Pick" />
              </Select.Trigger>
              <Select.Portal>
                <Select.Content data-testid="content" position="popper">
                  <Select.Viewport>
                    <Select.Item value="a">
                      <Select.ItemText>Alpha</Select.ItemText>
                    </Select.Item>
                  </Select.Viewport>
                </Select.Content>
              </Select.Portal>
            </Select.Root>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    )
    await flush()
    await user.pointer({ keys: "[MouseLeft>]", target: trigger() })
    await flush(50)
    expect(content()!.closest("[inert]")).toBeNull()
    await user.keyboard("{Escape}")
    await flush(50)
    expect(content()).toBeNull()
    expect(screen.queryByTestId("dialog")).not.toBeNull()
    expect(screen.getByTestId("dialog").closest("[inert]")).toBeNull()
    expect(active()).toBe(trigger())
  })
})

describe("forms", () => {
  const entries = (form: HTMLFormElement) => [...new FormData(form).entries()]
  const getSelect = (container: Element) => container.querySelector("select") as HTMLSelectElement

  test("a hidden native select carries the name, the value and the form attributes", async () => {
    const { container } = render(
      <form>
        <Example root={{ name: "fruit", defaultValue: "banana", required: true }} />
      </form>
    )
    await flush()
    const select = getSelect(container)
    expect(select.name).toBe("fruit")
    expect(select.value).toBe("banana")
    expect(select.required).toBe(true)
    expect(select.getAttribute("aria-hidden")).toBe("true")
    expect(select.tabIndex).toBe(-1)
    expect(select.style.position).toBe("absolute")
    expect(entries(container.querySelector("form")!)).toEqual([["fruit", "banana"]])
  })

  test("the submitted value follows the choice, and it is invalid until there is one", async () => {
    const user = setupUser()
    const { container } = render(
      <form>
        <Example root={{ name: "fruit", required: true }} />
      </form>
    )
    await flush()
    const form = container.querySelector("form")!
    expect(entries(form)).toEqual([["fruit", ""]])
    expect(form.checkValidity()).toBe(false)
    await openWithMouse(user)
    await user.click(option("Pineapple"))
    await flush(50)
    expect(entries(form)).toEqual([["fruit", "pineapple"]])
    expect(form.checkValidity()).toBe(true)
  })

  test("a change announces itself to the form", async () => {
    const user = setupUser()
    const onChange = vi.fn()
    const { container } = render(
      <form onChange={onChange}>
        <Example root={{ name: "fruit" }} />
      </form>
    )
    await flush()
    expect(onChange).not.toHaveBeenCalled()
    await openWithMouse(user)
    await user.click(option("Banana"))
    await flush(50)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0].target).toBe(getSelect(container))
  })

  test("a form reset restores the first value", async () => {
    const user = setupUser()
    const { container } = render(
      <form>
        <Example root={{ name: "fruit", defaultValue: "apple" }} />
      </form>
    )
    await flush()
    await openWithMouse(user)
    await user.click(option("Carrot"))
    await flush(50)
    expect(valueNode().textContent).toBe("Carrot")
    container.querySelector("form")!.dispatchEvent(new Event("reset"))
    await flush(50)
    expect(valueNode().textContent).toBe("Apple")
    expect(entries(container.querySelector("form")!)).toEqual([["fruit", "apple"]])
  })

  test("a disabled select is not submitted", async () => {
    const { container } = render(
      <form>
        <Example root={{ name: "fruit", defaultValue: "apple", disabled: true }} />
      </form>
    )
    await flush()
    expect(getSelect(container).disabled).toBe(true)
  })

  test("outside a form no native select is rendered; the form attribute associates one", async () => {
    const { container, unmount } = render(<Example root={{ name: "fruit" }} />)
    await flush()
    expect(container.querySelector("select")).toBeNull()
    unmount()
    const { container: other } = render(
      <div>
        <form id="f" />
        <Example root={{ name: "fruit", defaultValue: "apple", form: "f" }} />
      </div>
    )
    await flush()
    expect(getSelect(other).getAttribute("form")).toBe("f")
    expect(entries(other.querySelector("form")!)).toEqual([["fruit", "apple"]])
  })
})

describe("parts", () => {
  test("forward their refs", async () => {
    const triggerRef = createRef<HTMLButtonElement>()
    const contentRef = createRef<HTMLDivElement>()
    const itemRef = createRef<HTMLDivElement>()
    render(
      <Select.Root defaultOpen>
        <Select.Trigger ref={triggerRef}>
          <Select.Value placeholder="x" />
        </Select.Trigger>
        <Select.Portal>
          <Select.Content ref={contentRef} position="popper">
            <Select.Viewport>
              <Select.Item value="a" ref={itemRef}>
                <Select.ItemText>Alpha</Select.ItemText>
              </Select.Item>
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    )
    await flush(50)
    expect(triggerRef.current?.getAttribute("role")).toBe("combobox")
    expect(contentRef.current?.getAttribute("role")).toBe("listbox")
    expect(itemRef.current?.getAttribute("role")).toBe("option")
  })

  test("items can be controlled from state", async () => {
    const user = setupUser()
    function Controlled() {
      const [value, setValue] = useState("a")
      return (
        <Select.Root value={value} onValueChange={setValue}>
          <Select.Trigger data-testid="trigger">
            <Select.Value data-testid="value" />
          </Select.Trigger>
          <Select.Portal>
            <Select.Content position="popper">
              <Select.Viewport>
                <Select.Item value="a">
                  <Select.ItemText>Alpha</Select.ItemText>
                </Select.Item>
                <Select.Item value="b">
                  <Select.ItemText>Beta</Select.ItemText>
                </Select.Item>
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      )
    }
    render(<Controlled />)
    await flush()
    expect(valueNode().textContent).toBe("Alpha")
    await openWithMouse(user)
    await user.click(option("Beta"))
    await flush(50)
    expect(valueNode().textContent).toBe("Beta")
  })

  test("Content outside a Select throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<Select.Content />)).toThrow(/Select/)
    spy.mockRestore()
  })
})
