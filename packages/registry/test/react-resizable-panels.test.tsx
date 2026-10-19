import { act, fireEvent, render, screen } from "@testing-library/preact"
import { createRef, hydrate } from "preact"
import { useState } from "preact/hooks"
import { renderToString } from "preact-render-to-string"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { Group, Panel, Separator, type Layout } from "../src/shims/react-resizable-panels"

// happy-dom has no layout engine: derive the boxes of groups, panels and separators from the styles the shim writes.
// A top-level group is size.width by size.height; a nested group fills its panel; separators are 1px; panels share the rest by flex-grow
// (or by their flex-basis percentage before the group has mounted).
const size = { width: 1001, height: 401 }
type Box = { left: number; top: number; width: number; height: number }

const style = (element: Element, name: string) => (element as HTMLElement).style.getPropertyValue(name)
const weight = (panel: Element) => (style(panel, "flex-grow") ? parseFloat(style(panel, "flex-grow")) : style(panel, "flex-basis").endsWith("%") ? parseFloat(style(panel, "flex-basis")) : 1)

function box(element: Element): Box {
  if (element.hasAttribute("data-group")) {
    const panel = element.closest("[data-panel]")
    return panel ? box(panel) : { left: 0, top: 0, ...size }
  }
  const group = element.parentElement
  if (group && (element.hasAttribute("data-panel") || element.hasAttribute("data-separator")) && group.hasAttribute("data-group")) {
    const outer = box(group)
    const horizontal = style(group, "flex-direction") === "row"
    const children = [...group.children]
    const room = (horizontal ? outer.width : outer.height) - children.filter((child) => child.hasAttribute("data-separator")).length
    const total = children.reduce((sum, child) => sum + (child.hasAttribute("data-panel") ? weight(child) : 0), 0)
    let offset = 0
    for (const child of children) {
      const main = child.hasAttribute("data-panel") ? (weight(child) / total) * room : 1
      if (child === element) {
        return horizontal ? { left: outer.left + offset, top: outer.top, width: main, height: outer.height } : { left: outer.left, top: outer.top + offset, width: outer.width, height: main }
      }
      offset += main
    }
  }
  return element.parentElement ? box(element.parentElement) : { left: 0, top: 0, width: 0, height: 0 }
}

const observers = new Set<{ callback: ResizeObserverCallback; targets: Element[] }>()

function mockLayout() {
  for (const [name, read] of [
    ["offsetWidth", (b: Box) => b.width],
    ["offsetHeight", (b: Box) => b.height],
    ["offsetLeft", (b: Box) => b.left],
    ["offsetTop", (b: Box) => b.top],
  ] as const) {
    vi.spyOn(HTMLElement.prototype, name, "get").mockImplementation(function (this: HTMLElement) {
      return read(box(this))
    })
  }
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const b = box(this)
    return { ...b, x: b.left, y: b.top, right: b.left + b.width, bottom: b.top + b.height, toJSON() {} } as DOMRect
  })
  class FakeResizeObserver {
    entry = { callback: undefined as unknown as ResizeObserverCallback, targets: [] as Element[] }
    constructor(callback: ResizeObserverCallback) {
      this.entry.callback = callback
      observers.add(this.entry)
    }
    observe(target: Element) {
      this.entry.targets.push(target)
    }
    unobserve() {}
    disconnect() {
      observers.delete(this.entry)
    }
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver)
  Object.defineProperty(window, "ResizeObserver", { value: FakeResizeObserver, configurable: true, writable: true })
}

// What a browser does when the group's box changes size
const resize = (width: number, height = size.height) =>
  act(() => {
    size.width = width
    size.height = height
    for (const { callback, targets } of observers) callback(targets.map((target) => ({ target }) as ResizeObserverEntry), {} as ResizeObserver)
  })

beforeEach(() => {
  size.width = 1001
  size.height = 401
  mockLayout()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  observers.clear()
})

function pointer(type: string, x: number, y = 100, init: Record<string, unknown> = {}) {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1, ...init })
  return event
}
const fire = (target: Element | Document, type: string, x: number, y = 100, init: Record<string, unknown> = {}) => {
  const event = pointer(type, x, y, init)
  act(() => void target.dispatchEvent(event))
  return event
}
// A drag as a browser reports it: down on the separator, moves anywhere (the separator holds capture), up
const down = (target: Element, x: number, y = 100) => fire(target, "pointerdown", x, y)
const move = (x: number, y = 100, init: Record<string, unknown> = {}) => fire(document.body, "pointermove", x, y, { movementX: 1, movementY: 0, ...init })
const up = (x: number, y = 100) => fire(document.body, "pointerup", x, y)

const panels = () => [...document.querySelectorAll("[data-panel]")] as HTMLElement[]
const grows = () => panels().map((panel) => parseFloat(style(panel, "flex-grow")))
const separator = (index = 0) => screen.getAllByRole("separator")[index]!
const values = (element: Element) => ["aria-valuemin", "aria-valuenow", "aria-valuemax"].map((name) => Number(element.getAttribute(name)))

function Two({ onLayoutChange, left = {}, right = {} }: { onLayoutChange?: (layout: Layout) => void; left?: Record<string, unknown>; right?: Record<string, unknown> }) {
  return (
    <Group onLayoutChange={onLayoutChange}>
      <Panel id="left" defaultSize="25%" {...left}>
        left
      </Panel>
      <Separator />
      <Panel id="right" defaultSize="75%" {...right}>
        right
      </Panel>
    </Group>
  )
}

describe("markup and initial layout", () => {
  test("renders the group, panels and separator with the library's attributes", () => {
    render(<Two />)
    const group = document.querySelector("[data-group]") as HTMLElement
    expect(group.getAttribute("data-group")).toBe("true")
    expect(group.id).toBe(group.getAttribute("data-testid"))
    expect(group.style.display).toBe("flex")
    expect(group.style.flexDirection).toBe("row")
    expect(group.style.touchAction).toBe("pan-y")
    expect(group.style.overflow).toBe("hidden")

    const [left, right] = panels()
    expect(left!.id).toBe("left")
    expect(left!.getAttribute("data-testid")).toBe("left")
    expect(left!.getAttribute("data-panel")).toBe("true")
    expect(left!.firstElementChild!.textContent).toBe("left")
    expect(right!.id).toBe("right")

    const handle = separator()
    expect(handle.getAttribute("role")).toBe("separator")
    expect(handle.tabIndex).toBe(0)
    expect(handle.getAttribute("aria-orientation")).toBe("vertical")
    expect(handle.style.flexGrow).toBe("0")
    expect(handle.style.flexShrink).toBe("0")
    expect(handle.getAttribute("data-separator")).toBe("inactive")
  })

  test("className goes to the nested div of a panel and to the root of a group and a separator", () => {
    render(
      <Group className="g" data-slot="resizable-panel-group">
        <Panel className="p" data-slot="resizable-panel">
          x
        </Panel>
        <Separator className="s" data-slot="resizable-handle">
          <i data-testid="grip" />
        </Separator>
        <Panel>y</Panel>
      </Group>
    )
    const group = document.querySelector("[data-group]")!
    expect(group.className).toBe("g")
    expect(group.getAttribute("data-slot")).toBe("resizable-panel-group")
    const [first] = panels()
    expect(first!.getAttribute("data-slot")).toBe("resizable-panel")
    expect(first!.className).toBe("")
    expect(first!.firstElementChild!.className).toBe("p")
    expect(separator().className).toBe("s")
    expect(separator().getAttribute("data-slot")).toBe("resizable-handle")
    expect(separator().querySelector("[data-testid=grip]")).not.toBeNull()
  })

  test("panels get their default sizes as flex-grow, and ids default to unique generated ones", () => {
    render(
      <Group>
        <Panel defaultSize="25%">a</Panel>
        <Separator />
        <Panel defaultSize="75%">b</Panel>
      </Group>
    )
    expect(grows()).toEqual([25, 75])
    expect(panels()[0]!.id).not.toBe(panels()[1]!.id)
    expect(panels()[0]!.id).not.toBe("")
    for (const panel of panels()) expect(style(panel, "flex-basis")).toMatch(/^0(px)?$/)
    for (const panel of panels()) expect(style(panel, "flex-shrink")).toBe("1")
  })

  test("panels without a default size share what is left", () => {
    render(
      <Group>
        <Panel defaultSize="50%">a</Panel>
        <Separator />
        <Panel>b</Panel>
        <Separator />
        <Panel>c</Panel>
      </Group>
    )
    expect(grows()).toEqual([50, 25, 25])
    expect(panels().length).toBe(3)
  })

  test("sizes in pixels, rem and vw convert to percentages of the space the panels share", () => {
    vi.spyOn(window, "getComputedStyle").mockImplementation(() => ({ fontSize: "10px" }) as CSSStyleDeclaration)
    Object.defineProperty(window, "innerWidth", { value: 2000, configurable: true })
    render(
      <Group>
        <Panel defaultSize={200}>a</Panel>
        <Separator />
        <Panel defaultSize="10rem">b</Panel>
        <Separator />
        <Panel defaultSize="5vw">c</Panel>
        <Separator />
        <Panel>d</Panel>
      </Group>
    )
    // 1001 - 3 separators = 998 shared; 200px, 100px, 100px
    const [a, b, c, d] = grows()
    expect(a).toBeCloseTo((200 / 998) * 100, 2)
    expect(b).toBeCloseTo((100 / 998) * 100, 2)
    expect(c).toBeCloseTo((100 / 998) * 100, 2)
    expect(a! + b! + c! + d!).toBeCloseTo(100, 1)
  })

  test("a vertical group stacks its panels", () => {
    render(
      <Group orientation="vertical">
        <Panel defaultSize="25%">a</Panel>
        <Separator />
        <Panel defaultSize="75%">b</Panel>
      </Group>
    )
    const group = document.querySelector("[data-group]") as HTMLElement
    expect(group.style.flexDirection).toBe("column")
    expect(group.style.touchAction).toBe("pan-x")
    expect(separator().getAttribute("aria-orientation")).toBe("horizontal")
    expect(grows()).toEqual([25, 75])
  })

  test("onLayoutChange is called once with the first layout", () => {
    const onLayoutChange = vi.fn()
    render(<Two onLayoutChange={onLayoutChange} />)
    expect(onLayoutChange.mock.calls).toEqual([[{ left: 25, right: 75 }]])
  })

  test("the separator reports the size of the panel before it, and how far it can go", () => {
    render(<Two left={{ minSize: "20%", maxSize: "60%" }} right={{ minSize: "30%" }} />)
    const handle = separator()
    expect(handle.getAttribute("aria-controls")).toBe("left")
    expect(values(handle)).toEqual([20, 25, 60])
  })

  test("elementRef gives the root of each part", () => {
    const group = createRef<HTMLDivElement>()
    const panel = createRef<HTMLDivElement>()
    const handle = createRef<HTMLDivElement>()
    render(
      <Group elementRef={group}>
        <Panel elementRef={panel}>a</Panel>
        <Separator elementRef={handle} />
        <Panel>b</Panel>
      </Group>
    )
    expect(group.current).toBe(document.querySelector("[data-group]"))
    expect(panel.current).toBe(panels()[0])
    expect(handle.current).toBe(separator())
  })

  test("Panel and Separator need a Group", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<Panel>x</Panel>)).toThrow(/inside a Group/)
  })
})

describe("keyboard", () => {
  const key = (name: string, init: Record<string, unknown> = {}) => fireEvent.keyDown(document.activeElement ?? separator(), { key: name, ...init })

  test("the arrows along the axis move the separator by 5 percent, and are consumed", () => {
    const onLayoutChange = vi.fn()
    render(<Two onLayoutChange={onLayoutChange} />)
    separator().focus()
    expect(key("ArrowRight")).toBe(false)
    expect(grows()).toEqual([30, 70])
    expect(values(separator())[1]).toBe(30)
    key("ArrowLeft")
    key("ArrowLeft")
    expect(grows()).toEqual([20, 80])
    expect(onLayoutChange.mock.calls.map((call) => call[0])).toEqual([{ left: 25, right: 75 }, { left: 30, right: 70 }, { left: 25, right: 75 }, { left: 20, right: 80 }])
  })

  test("the arrows across the axis do nothing but are consumed", () => {
    render(<Two />)
    separator().focus()
    expect(key("ArrowUp")).toBe(false)
    expect(key("ArrowDown")).toBe(false)
    expect(grows()).toEqual([25, 75])
  })

  test("a vertical group answers to ArrowUp and ArrowDown", () => {
    render(
      <Group orientation="vertical">
        <Panel defaultSize="25%">a</Panel>
        <Separator />
        <Panel defaultSize="75%">b</Panel>
      </Group>
    )
    separator().focus()
    key("ArrowDown")
    expect(grows()).toEqual([30, 70])
    key("ArrowUp")
    key("ArrowUp")
    key("ArrowLeft")
    expect(grows()).toEqual([20, 80])
  })

  test("Home and End move to the limits the panels allow", () => {
    render(<Two left={{ minSize: "10%" }} right={{ minSize: "15%" }} />)
    separator().focus()
    key("End")
    expect(grows()).toEqual([85, 15])
    expect(values(separator())).toEqual([10, 85, 85])
    key("Home")
    expect(grows()).toEqual([10, 90])
  })

  test("the arrows stop at the limits", () => {
    render(<Two left={{ minSize: "20%" }} right={{ maxSize: "80%" }} />)
    separator().focus()
    key("ArrowLeft")
    key("ArrowLeft")
    expect(grows()).toEqual([20, 80])
    key("ArrowLeft")
    expect(grows()).toEqual([20, 80])
  })

  test("a key that is not for the separator is left alone", () => {
    render(<Two />)
    separator().focus()
    expect(key("a")).toBe(true)
    expect(key("Enter")).toBe(true)
    expect(grows()).toEqual([25, 75])
  })

  test("F6 cycles through the separators of a group, Shift+F6 goes back", () => {
    render(
      <Group>
        <Panel>a</Panel>
        <Separator />
        <Panel>b</Panel>
        <Separator />
        <Panel>c</Panel>
      </Group>
    )
    separator(0).focus()
    key("F6")
    expect(document.activeElement).toBe(separator(1))
    key("F6")
    expect(document.activeElement).toBe(separator(0))
    key("F6", { shiftKey: true })
    expect(document.activeElement).toBe(separator(1))
  })

  test("with three panels the neighbours give way in turn", () => {
    render(
      <Group>
        <Panel id="a" defaultSize="40%" minSize="30%">
          a
        </Panel>
        <Separator />
        <Panel id="b" defaultSize="30%" minSize="20%">
          b
        </Panel>
        <Separator />
        <Panel id="c" defaultSize="30%" minSize="10%">
          c
        </Panel>
      </Group>
    )
    separator(0).focus()
    key("End")
    // b and c can give up 10 and 20 to a
    expect(grows()).toEqual([70, 20, 10])
    expect(values(separator(0))).toEqual([30, 70, 70])
    separator(1).focus()
    key("Home")
    // b is at its minimum already, so a gives up what c takes
    expect(grows()).toEqual([30, 20, 50])
  })
})

describe("pointer", () => {
  test("dragging the separator resizes the panels, and onLayoutChange follows every move", () => {
    const onLayoutChange = vi.fn()
    render(<Two onLayoutChange={onLayoutChange} />)
    // The left panel is 250 wide, the separator sits at 250..251
    const down1 = down(separator(), 250)
    expect(down1.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(separator())
    expect(separator().getAttribute("data-separator")).toBe("active")

    move(300)
    expect(grows()).toEqual([30, 70])
    move(350)
    expect(grows()).toEqual([35, 65])
    expect(values(separator())[1]).toBe(35)
    expect(onLayoutChange.mock.calls.map((call) => call[0])).toEqual([{ left: 25, right: 75 }, { left: 30, right: 70 }, { left: 35, right: 65 }])

    expect(up(350).defaultPrevented).toBe(true)
    expect(grows()).toEqual([35, 65])
    // The separator keeps no focus ring after a drag
    expect(document.activeElement).not.toBe(separator())
    expect(separator().getAttribute("data-separator")).toBe("inactive")
    // A move after the release does nothing
    move(600)
    expect(grows()).toEqual([35, 65])
  })

  test("the drag starts from where the pointer went down, not from the separator edge", () => {
    render(<Two />)
    down(separator(), 254)
    move(354)
    expect(grows()).toEqual([35, 65])
  })

  test("the hit area is wider than the separator", () => {
    render(<Two />)
    // 250..251 grown to 10px: 245.5..255.5
    expect(down(separator(), 246).defaultPrevented).toBe(true)
    up(246)
    expect(down(separator(), 262).defaultPrevented).toBe(false)
  })

  test("a drag stops at the minimum and maximum of the panels, and comes back from there", () => {
    render(<Two left={{ minSize: "20%", maxSize: "60%" }} />)
    down(separator(), 250)
    move(0)
    expect(grows()).toEqual([20, 80])
    move(100)
    expect(grows()).toEqual([20, 80])
    move(150)
    expect(grows()).toEqual([20, 80])
    move(260)
    expect(grows()).toEqual([26, 74])
    move(900)
    expect(grows()).toEqual([60, 40])
    up(900)
  })

  test("a panel that cannot shrink further stops the drag", () => {
    render(<Two right={{ minSize: "40%" }} />)
    down(separator(), 250)
    move(990)
    expect(grows()).toEqual([60, 40])
  })

  test("the right button and a second pointer do not start or disturb a drag", () => {
    render(<Two />)
    expect(fire(separator(), "pointerdown", 250, 100, { button: 2 }).defaultPrevented).toBe(false)
    down(separator(), 250)
    move(300, 100, { pointerId: 2 })
    expect(grows()).toEqual([25, 75])
    move(300)
    expect(grows()).toEqual([30, 70])
    fire(separator(), "pointerdown", 400, 100, { pointerId: 2 })
    move(350)
    expect(grows()).toEqual([35, 65])
    up(350)
  })

  test("a pointerdown that was already handled starts nothing", () => {
    // Registered first, so it runs before the shim's capture listener on the document
    const stop = (event: Event) => event.preventDefault()
    document.addEventListener("pointerdown", stop, true)
    render(<Two />)
    down(separator(), 250)
    document.removeEventListener("pointerdown", stop, true)
    move(300)
    expect(grows()).toEqual([25, 75])
    expect(document.activeElement).not.toBe(separator())
  })

  test("a release the page missed ends the drag when the button is up on the next move", () => {
    render(<Two />)
    down(separator(), 250)
    move(300)
    move(400, 100, { buttons: 0 })
    expect(separator().getAttribute("data-separator")).not.toBe("active")
    move(500)
    expect(grows()).toEqual([30, 70])
  })

  test.each(["pointercancel", "contextmenu"])("%s ends the drag", (type) => {
    render(<Two />)
    down(separator(), 250)
    move(300)
    fire(document.body, type, 300)
    move(400)
    expect(grows()).toEqual([30, 70])
  })

  test("the window losing focus ends the drag", () => {
    render(<Two />)
    down(separator(), 250)
    move(300)
    act(() => void window.dispatchEvent(new Event("blur")))
    move(400)
    expect(grows()).toEqual([30, 70])
  })

  test("losing the capture of the separator ends the drag", () => {
    render(<Two />)
    down(separator(), 250)
    move(300)
    separator().releasePointerCapture(1)
    fire(separator(), "lostpointercapture", 300)
    move(400)
    expect(grows()).toEqual([30, 70])
  })

  test("a pointer that leaves the page takes the drag to that side", () => {
    render(<Two />)
    down(separator(), 250)
    fire(document, "pointerleave", 2000, 100, { movementX: 1 })
    expect(grows()).toEqual([100, 0])
  })

  test("the separator shows hover, active and focus in data-separator", () => {
    render(<Two />)
    const handle = separator()
    expect(handle.getAttribute("data-separator")).toBe("inactive")
    move(248, 100, { movementX: 0 })
    expect(handle.getAttribute("data-separator")).toBe("hover")
    move(600)
    expect(handle.getAttribute("data-separator")).toBe("inactive")
    act(() => handle.focus())
    expect(handle.getAttribute("data-separator")).toBe("focus")
    move(248)
    expect(handle.getAttribute("data-separator")).toBe("focus")
    down(handle, 248)
    expect(handle.getAttribute("data-separator")).toBe("active")
    up(248)
    expect(handle.getAttribute("data-separator")).toBe("focus")
    act(() => handle.blur())
    expect(handle.getAttribute("data-separator")).toBe("inactive")
    move(248)
    expect(handle.getAttribute("data-separator")).toBe("hover")
  })

  test("a double click on the separator puts the panel back to its default size", () => {
    render(<Two />)
    down(separator(), 250)
    move(400)
    up(400)
    expect(grows()).toEqual([40, 60])
    const click = new MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: 400, clientY: 100 })
    act(() => void separator().dispatchEvent(click))
    expect(click.defaultPrevented).toBe(true)
    expect(grows()).toEqual([25, 75])
  })

  test("a group with a gap and no separator can be dragged by the gap", () => {
    render(
      <Group>
        <Panel defaultSize="25%">a</Panel>
        <Panel defaultSize="75%">b</Panel>
      </Group>
    )
    // No separator: the hit area is the zero-width seam, grown to 10px
    down(panels()[0]!, 250)
    move(300)
    // No separator, so the panels share 1001px and not 1000
    expect(grows()).toEqual([29.995, 70.005])
    up(300)
  })

  test("another element on top of the group keeps the pointer", () => {
    render(
      <div>
        <Two />
        <div data-testid="overlay" />
      </div>
    )
    expect(fire(screen.getByTestId("overlay"), "pointerdown", 250).defaultPrevented).toBe(false)
  })
})

describe("cursor", () => {
  const rule = () => document.adoptedStyleSheets.map((sheet) => [...sheet.cssRules].map((r) => r.cssText).join("")).join("")

  test("a resize cursor follows the pointer over a hit area, and goes when it leaves", () => {
    render(<Two left={{ minSize: "20%" }} />)
    expect(rule()).toBe("")
    move(248, 100, { movementX: 0 })
    expect(rule()).toMatch(/cursor: (ew|col)-resize !important/)
    move(600)
    expect(rule()).toBe("")
  })

  test("past a limit the cursor points one way", () => {
    render(<Two left={{ minSize: "20%" }} />)
    down(separator(), 250)
    move(100)
    // Firefox and Chrome have e-resize; the other browsers keep col-resize
    expect(rule()).toMatch(/cursor: (e-resize|col-resize) !important/)
    move(600)
    expect(rule()).toMatch(/cursor: (ew|col)-resize !important/)
    up(600)
    expect(rule()).toBe("")
  })

  test("a vertical group asks for a row resize", () => {
    render(
      <Group orientation="vertical">
        <Panel defaultSize="25%">a</Panel>
        <Separator />
        <Panel defaultSize="75%">b</Panel>
      </Group>
    )
    // 25% of 400 is 100
    move(500, 100, { movementX: 0 })
    expect(rule()).toMatch(/cursor: (ns|row)-resize !important/)
  })
})

describe("group size and panels that come and go", () => {
  test("pixel limits are re-read when the group resizes, and the requested layout comes back", () => {
    const onLayoutChange = vi.fn()
    render(<Two onLayoutChange={onLayoutChange} left={{ defaultSize: "30%", minSize: 300 }} />)
    expect(grows()).toEqual([30, 70])
    expect(values(separator())).toEqual([30, 30, 100])

    resize(601)
    expect(grows()).toEqual([50, 50])
    expect(values(separator())).toEqual([50, 50, 100])
    expect(onLayoutChange.mock.calls.at(-1)).toEqual([{ left: 50, right: 50 }])

    resize(1001)
    expect(grows()).toEqual([30, 70])
  })

  test("a group that is hidden gets its layout once it has a size", () => {
    size.width = 1
    const onLayoutChange = vi.fn()
    // The panels share 0px: the layout is a guess until the group shows
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(0)
    render(<Two onLayoutChange={onLayoutChange} />)
    expect(onLayoutChange).not.toHaveBeenCalled()
    vi.restoreAllMocks()
    mockLayout()
    resize(1001)
    expect(grows()).toEqual([25, 75])
    expect(onLayoutChange.mock.calls).toEqual([[{ left: 25, right: 75 }]])
  })

  test("a panel that comes lays the group out again, and the old sizes return when it goes", () => {
    function Toggle() {
      const [third, setThird] = useState(false)
      return (
        <div>
          <button onClick={() => setThird((value) => !value)}>toggle</button>
          <Group>
            <Panel id="a" defaultSize="25%">
              a
            </Panel>
            <Separator />
            <Panel id="b" defaultSize="75%">
              b
            </Panel>
            {third && (
              <>
                <Separator />
                <Panel id="c" defaultSize="50%">
                  c
                </Panel>
              </>
            )}
          </Group>
        </div>
      )
    }
    render(<Toggle />)
    down(separator(), 250)
    move(400)
    up(400)
    expect(grows()).toEqual([40, 60])

    fireEvent.click(screen.getByText("toggle"))
    expect(panels().length).toBe(3)
    expect(grows().reduce((sum, grow) => sum + grow, 0)).toBeCloseTo(100, 1)
    // 25 + 75 + 50 scaled to 100
    expect(grows()).toEqual([16.667, 50, 33.333])
    expect(screen.getAllByRole("separator").length).toBe(2)

    fireEvent.click(screen.getByText("toggle"))
    expect(panels().length).toBe(2)
    expect(grows()).toEqual([40, 60])
  })

  test("changing a panel's size limits re-validates the layout", () => {
    function Limit() {
      const [min, setMin] = useState("0%")
      return (
        <div>
          <button onClick={() => setMin("40%")}>raise</button>
          <Group>
            <Panel id="a" defaultSize="25%" minSize={min}>
              a
            </Panel>
            <Separator />
            <Panel id="b" defaultSize="75%">
              b
            </Panel>
          </Group>
        </div>
      )
    }
    render(<Limit />)
    fireEvent.click(screen.getByText("raise"))
    expect(grows()).toEqual([40, 60])
  })

  test("after unmounting nothing listens any more", () => {
    const { unmount } = render(<Two />)
    move(248, 100, { movementX: 0 })
    unmount()
    const removed = fire(document.body, "pointerdown", 250)
    expect(removed.defaultPrevented).toBe(false)
    expect(document.adoptedStyleSheets.map((sheet) => [...sheet.cssRules].length)).toEqual(document.adoptedStyleSheets.map(() => 0))
  })

  test("a group removed in the middle of a drag leaves the interaction clean", () => {
    const { unmount } = render(<Two />)
    down(separator(), 250)
    unmount()
    render(<Two />)
    move(248, 100, { movementX: 0 })
    expect(separator().getAttribute("data-separator")).toBe("hover")
  })

  test("two panels with one id are an error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() =>
      render(
        <Group>
          <Panel id="same">a</Panel>
          <Separator />
          <Panel id="same">b</Panel>
        </Group>
      )
    ).toThrow(/Panel ids must be unique/)
  })
})

describe("nested groups", () => {
  function Nested({ onInner }: { onInner?: (layout: Layout) => void }) {
    return (
      <Group>
        <Panel id="one" defaultSize="50%">
          one
        </Panel>
        <Separator />
        <Panel id="rest" defaultSize="50%">
          <Group orientation="vertical" onLayoutChange={onInner}>
            <Panel id="two" defaultSize="25%">
              two
            </Panel>
            <Separator />
            <Panel id="three" defaultSize="75%">
              three
            </Panel>
          </Group>
        </Panel>
      </Group>
    )
  }

  test("each group has its own layout and orientation", () => {
    const onInner = vi.fn()
    render(<Nested onInner={onInner} />)
    expect(grows()).toEqual([50, 50, 25, 75])
    expect(separator(0).getAttribute("aria-orientation")).toBe("vertical")
    expect(separator(1).getAttribute("aria-orientation")).toBe("horizontal")
    expect(onInner.mock.calls).toEqual([[{ two: 25, three: 75 }]])
    expect(values(separator(1))).toEqual([0, 25, 100])
  })

  test("the inner separator is moved by the keyboard and the pointer without touching the outer layout", () => {
    render(<Nested />)
    separator(1).focus()
    fireEvent.keyDown(separator(1), { key: "ArrowDown" })
    expect(grows()).toEqual([50, 50, 30, 70])
    // The inner panels share 400px, the separator is at 30%
    const { top } = separator(1).getBoundingClientRect()
    expect(top).toBe(120)
    down(separator(1), 700, top)
    move(700, top + 100)
    expect(grows()).toEqual([50, 50, 55, 45])
    up(700, top + 100)
  })

  test("a pointer at the crossing of two separators drags both", () => {
    render(<Nested />)
    // The outer separator is at x=500..501 and its hit area reaches 505.5; the inner one spans x=501..1001 at y=100..101
    const { top } = separator(1).getBoundingClientRect()
    // At x=503 the topmost element is the inner separator, which sits inside the outer group too
    down(separator(1), 503, top)
    move(600, top + 40)
    // 97px of 1000 horizontally, 40px of 400 vertically
    expect(grows()).toEqual([59.7, 40.3, 35, 65])
    up(600, top + 40)
    // Just left of the inner separator only the outer one matches
    const { left } = separator(0).getBoundingClientRect()
    down(separator(0), left + 0.5, top)
    move(left + 50.5, top + 100)
    expect(grows()).toEqual([64.7, 35.3, 35, 65])
    up(550, top + 100)
  })
})

describe("upstream usage", () => {
  // ui/resizable.tsx and the controlled example as the pipeline converts them
  function ResizableHandle({ withHandle, className, ...props }: Parameters<typeof Separator>[0] & { withHandle?: boolean }) {
    return (
      <Separator data-slot="resizable-handle" className={["relative", className].join(" ")} {...props}>
        {withHandle && <div className="z-10" />}
      </Separator>
    )
  }

  test("the controlled example shows the sizes that onLayoutChange reports", () => {
    function Controlled() {
      const [layout, setLayout] = useState<Layout>({})
      return (
        <Group orientation="horizontal" onLayoutChange={setLayout}>
          <Panel defaultSize="30%" id="left" minSize="20%">
            <span data-testid="left-size">{Math.round(layout.left ?? 30)}%</span>
          </Panel>
          <ResizableHandle withHandle />
          <Panel defaultSize="70%" id="right" minSize="30%">
            <span data-testid="right-size">{Math.round(layout.right ?? 70)}%</span>
          </Panel>
        </Group>
      )
    }
    render(<Controlled />)
    expect(screen.getByTestId("left-size").textContent).toBe("30%")
    expect(separator().firstElementChild).not.toBeNull()
    down(separator(), 300)
    move(500)
    expect(screen.getByTestId("left-size").textContent).toBe("50%")
    expect(screen.getByTestId("right-size").textContent).toBe("50%")
    move(10)
    expect(screen.getByTestId("left-size").textContent).toBe("20%")
    expect(screen.getByTestId("right-size").textContent).toBe("80%")
    up(10)
  })
})

describe("hydration", () => {
  test("the server markup hydrates and then gets the layout from the store", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    container.innerHTML = renderToString(<Two />)
    const [left] = [...container.querySelectorAll("[data-panel]")] as HTMLElement[]
    expect(style(left!, "flex-basis")).toBe("25%")
    expect(style(left!, "flex-grow")).toBe("")

    act(() => hydrate(<Two />, container))
    const hydrated = [...container.querySelectorAll("[data-panel]")] as HTMLElement[]
    expect(hydrated.map((panel) => style(panel, "flex-grow"))).toEqual(["25", "75"])
    expect(hydrated.map((panel) => style(panel, "flex-basis"))).toEqual(["0px", "0px"])
    expect(container.querySelector("[role=separator]")!.getAttribute("aria-valuenow")).toBe("25")
    container.remove()
  })
})
