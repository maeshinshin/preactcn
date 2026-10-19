import { type ComponentProps } from "preact"
import { fireEvent, render, screen } from "@testing-library/preact"
import { afterEach, describe, expect, test, vi } from "vitest"
import { flush, mockLayout, setupUser, useFakeTimers } from "./helpers"
import * as Select from "../src/radix/select"

// happy-dom has no layout: report fixed boxes for the parts the alignment reads. The trigger is 200x32 at (100, 300), its value
// starts 10px in, the list is 220 wide, its items are 30 tall and the selected text starts 18px into the list.
const box = (r: { left?: number; top?: number; width?: number; height?: number }) => {
  const { left = 0, top = 0, width = 0, height = 0 } = r
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} } as DOMRect
}

function mockSelectLayout({ triggerTop = 300, viewportHeight = 800 } = {}) {
  Object.defineProperty(window, "innerWidth", { value: 1000, configurable: true })
  Object.defineProperty(window, "innerHeight", { value: viewportHeight, configurable: true })
  const testid = (el: Element) => el.getAttribute("data-testid")
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (testid(this) === "trigger") return box({ left: 100, top: triggerTop, width: 200, height: 32 })
    if (testid(this) === "value") return box({ left: 110, top: triggerTop + 8, width: 150, height: 16 })
    if (this.getAttribute("role") === "listbox") return box({ left: 0, top: 0, width: 220, height: 150 })
    if (this.tagName === "SPAN" && this.id && !testid(this) && this.textContent === "Banana") return box({ left: 18, width: 60, height: 30 })
    return box({})
  })
  const isViewport = (el: Element) => el.hasAttribute("data-radix-select-viewport")
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.getAttribute("role") === "option" ? 30 : isViewport(this) ? 150 : 0
  })
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
    return this.getAttribute("role") === "option" && this.textContent?.includes("Banana") ? 30 : 0
  })
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (this: Element) {
    return isViewport(this) ? 150 : 0
  })
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this.getAttribute("role") === "listbox" ? 150 : 0
  })
  const real = window.getComputedStyle.bind(window)
  vi.spyOn(window, "getComputedStyle").mockImplementation((node, pseudo) => {
    return new Proxy(real(node, pseudo), {
      get(style, prop) {
        if (["borderTopWidth", "borderBottomWidth", "paddingTop", "paddingBottom"].includes(prop as string)) return "0px"
        const value = Reflect.get(style, prop)
        return typeof value === "function" ? value.bind(style) : value
      },
    })
  })
}

function Example({ root, content }: { root?: ComponentProps<typeof Select.Root>; content?: ComponentProps<typeof Select.Content> }) {
  return (
    <Select.Root defaultValue="banana" {...root}>
      <Select.Trigger data-testid="trigger">
        <Select.Value data-testid="value" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content data-testid="content" {...content}>
          <Select.ScrollUpButton data-testid="up" />
          <Select.Viewport data-testid="viewport">
            {["apple", "banana", "grapes", "pineapple", "carrot"].map((value) => (
              <Select.Item key={value} value={value}>
                <Select.ItemText>{value[0]!.toUpperCase() + value.slice(1)}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton data-testid="down" />
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

const trigger = () => screen.getByTestId("trigger")
const wrapper = () => screen.getByTestId("content").parentElement!
const active = () => document.activeElement as HTMLElement

async function open(user: ReturnType<typeof setupUser>) {
  await flush()
  await user.pointer({ keys: "[MouseLeft>]", target: trigger() })
  await flush(50)
}

useFakeTimers()
afterEach(() => {
  delete (window as { innerWidth?: number }).innerWidth
  delete (window as { innerHeight?: number }).innerHeight
})

describe("select, item-aligned", () => {
  test("is the default: a fixed wrapper over the trigger that takes the content's z-index and holds a border-box list", async () => {
    mockSelectLayout()
    const user = setupUser()
    render(<Example />)
    await open(user)
    expect(wrapper().parentElement).toBe(document.body)
    expect(wrapper().style.position).toBe("fixed")
    expect(wrapper().style.display).toBe("flex")
    expect(wrapper().hasAttribute("data-radix-popper-content-wrapper")).toBe(false)
    expect(screen.getByTestId("content").style.boxSizing).toBe("border-box")
    expect(screen.getByTestId("content").style.maxHeight).toBe("100%")
    expect(screen.getByTestId("content").getAttribute("role")).toBe("listbox")
  })

  test("puts the selected item's text over the value, widens to the trigger and pins to the bottom when there is room above", async () => {
    mockSelectLayout()
    const user = setupUser()
    render(<Example />)
    await open(user)
    // The text sits 18px into the list and the value 10px into the trigger: the list starts 8px left of the trigger
    expect(wrapper().style.left).toBe("92px")
    expect(wrapper().style.minWidth).toBe("208px")
    // The selected item's middle is 45px into the list; 306px of room above the trigger's middle, 474px below
    expect(wrapper().style.bottom).toBe("0px")
    expect(wrapper().style.height).toBe("519px")
    expect(wrapper().style.margin).toBe("10px 0px")
    expect(wrapper().style.minHeight).toBe("150px")
    expect(wrapper().style.maxHeight).toBe("780px")
    expect(active()).toBe(screen.getByRole("option", { name: "Banana" }))
  })

  test("pins to the top and scrolls the selected item into place when the room above is too small", async () => {
    mockSelectLayout({ triggerTop: 20 })
    const user = setupUser()
    render(<Example />)
    await open(user)
    expect(wrapper().style.top).toBe("0px")
    expect(wrapper().style.height).toBe("131px")
    expect(screen.getByTestId("viewport").scrollTop).toBe(19)
  })

  test("never goes off the starting edge of the viewport", async () => {
    mockSelectLayout()
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const id = this.getAttribute("data-testid")
      if (id === "trigger") return box({ left: 0, top: 300, width: 200, height: 32 })
      if (id === "value") return box({ left: 4, top: 308, width: 150, height: 16 })
      if (this.getAttribute("role") === "listbox") return box({ left: 0, width: 220, height: 150 })
      if (this.tagName === "SPAN" && this.id && !id && this.textContent === "Banana") return box({ left: 18, width: 60, height: 30 })
      return box({})
    })
    const user = setupUser()
    render(<Example />)
    await open(user)
    expect(wrapper().style.left).toBe("10px")
  })

  test("mirrors the horizontal placement in rtl", async () => {
    mockSelectLayout()
    const user = setupUser()
    render(<Example root={{ dir: "rtl" }} />)
    await open(user)
    expect(wrapper().style.right).toBe("598px")
    expect(wrapper().style.minWidth).toBe("302px")
    expect(screen.getByTestId("content").getAttribute("dir")).toBe("rtl")
  })

  test("ignores the popper placement props", async () => {
    mockSelectLayout()
    const user = setupUser()
    render(<Example content={{ side: "top", sideOffset: 50, align: "end" }} />)
    await open(user)
    expect(screen.getByTestId("content").hasAttribute("data-side")).toBe(false)
    expect(wrapper().style.left).toBe("92px")
  })
})

describe("select scroll buttons", () => {
  function mockScroll() {
    mockLayout({ anchor: { left: 100, top: 100, width: 50, height: 20 }, anchorId: "trigger" })
    const isViewport = (el: Element) => el.hasAttribute("data-radix-select-viewport")
    vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (this: Element) {
      return isViewport(this) ? 300 : 0
    })
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this === document.documentElement ? 800 : isViewport(this) ? 100 : 0
    })
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return this.getAttribute("role") === "option" ? 30 : 0
    })
  }

  test("only the button for a direction the list can still scroll in is shown", async () => {
    mockScroll()
    const user = setupUser()
    render(<Example root={{ defaultValue: undefined }} content={{ position: "popper" }} />)
    await open(user)
    expect(screen.queryByTestId("up")).toBeNull()
    expect(screen.getByTestId("down").getAttribute("aria-hidden")).toBe("true")
    const viewport = screen.getByTestId("viewport")
    viewport.scrollTop = 120
    fireEvent.scroll(viewport)
    await flush()
    expect(screen.queryByTestId("up")).not.toBeNull()
    expect(screen.queryByTestId("down")).not.toBeNull()
    viewport.scrollTop = 200
    fireEvent.scroll(viewport)
    await flush()
    expect(screen.queryByTestId("down")).toBeNull()
  })

  test("holding the pointer on a button scrolls by an item every 50ms until it leaves", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] })
    mockScroll()
    const user = setupUser()
    render(<Example root={{ defaultValue: undefined }} content={{ position: "popper" }} />)
    await open(user)
    const viewport = screen.getByTestId("viewport")
    const down = screen.getByTestId("down")
    fireEvent.pointerMove(down, { pointerType: "mouse" })
    await flush(50)
    expect(viewport.scrollTop).toBe(30)
    await flush(100)
    expect(viewport.scrollTop).toBe(90)
    fireEvent.pointerLeave(down, { pointerType: "mouse" })
    await flush(200)
    expect(viewport.scrollTop).toBe(90)
  })
})
