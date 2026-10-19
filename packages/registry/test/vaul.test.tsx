import { type ComponentProps } from "preact"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { flush, setupUser } from "./helpers"
import { Drawer } from "../src/shims/vaul"

type RootProps = ComponentProps<typeof Drawer.Root>
type ContentProps = ComponentProps<typeof Drawer.Content>

function Example({ root, content }: { root?: Partial<RootProps>; content?: Partial<ContentProps> }) {
  return (
    <Drawer.Root {...root}>
      <Drawer.Trigger>Open</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay data-testid="overlay" />
        <Drawer.Content data-testid="content" {...content}>
          <Drawer.Title>Move goal</Drawer.Title>
          <Drawer.Description>Set your daily goal.</Drawer.Description>
          <input aria-label="name" />
          <div data-testid="inner">inner</div>
          <div data-vaul-no-drag data-testid="no-drag">
            no drag
          </div>
          <Drawer.Close>Cancel</Drawer.Close>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

const trigger = () => screen.getByRole("button", { name: "Open" })
const content = () => screen.getByTestId("content")
const overlay = () => screen.getByTestId("overlay")

// Date is faked too: vaul reads the time of a drag from `new Date()`
beforeEach(() => void vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }))
afterEach(async () => {
  cleanup()
  await flush()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// The injected stylesheet gives closing parts a CSS animation, so Presence keeps them mounted until animationend
const finishAnimations = () =>
  act(() => {
    for (const node of document.querySelectorAll("[data-vaul-drawer], [data-vaul-overlay]")) {
      const animationName = getComputedStyle(node).animationName
      node.dispatchEvent(Object.assign(new Event("animationend", { bubbles: true }), { animationName }))
    }
  })

async function expectClosed() {
  await flush()
  finishAnimations()
  await flush()
  expect(screen.queryByRole("dialog")).toBeNull()
}

const expectOpen = () => expect(screen.queryByRole("dialog")?.getAttribute("data-state")).toBe("open")

async function open(props?: Parameters<typeof Example>[0]) {
  const user = setupUser()
  render(<Example {...props} />)
  await user.click(trigger())
  await flush()
  // vaul ignores drags that start while the drawer is still sliding in (500ms)
  await flush(600)
  return user
}

describe("drawer: dialog behavior", () => {
  test("is closed by default, opens from the trigger and closes with Close", async () => {
    const user = setupUser()
    render(<Example />)
    await expectClosed()
    expect(trigger().getAttribute("data-state")).toBe("closed")
    await user.click(trigger())
    await flush()
    expect(screen.getByRole("dialog")).toBe(content())
    expect(content().getAttribute("aria-labelledby")).toBe(screen.getByText("Move goal").id)
    expect(trigger().getAttribute("aria-expanded")).toBe("true")
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await flush()
    await expectClosed()
    expect(trigger().getAttribute("data-state")).toBe("closed")
  })

  test("stays mounted while vaul's exit animation runs", async () => {
    const user = await open()
    await user.click(screen.getByRole("button", { name: "Cancel" }))
    await flush()
    expect(content().getAttribute("data-state")).toBe("closed")
    expect(getComputedStyle(content()).animationName).toBe("slideToBottom")
    expect(getComputedStyle(overlay()).animationName).toBe("fadeOut")
    await expectClosed()
    expect(screen.queryByTestId("overlay")).toBeNull()
  })

  test("asChild hands the trigger and close behavior to the child", async () => {
    const user = setupUser()
    render(
      <Drawer.Root>
        <Drawer.Trigger asChild>
          <a href="#x">Open link</a>
        </Drawer.Trigger>
        <Drawer.Portal>
          <Drawer.Content>
            <Drawer.Title>t</Drawer.Title>
            <Drawer.Close asChild>
              <span role="button">Close span</span>
            </Drawer.Close>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    )
    const link = screen.getByText("Open link")
    expect(link.tagName).toBe("A")
    expect(link.getAttribute("aria-haspopup")).toBe("dialog")
    await user.click(link)
    await flush()
    await user.click(screen.getByText("Close span"))
    await flush()
    await expectClosed()
  })

  test("defaultOpen starts open without the entry animation", async () => {
    render(<Example root={{ defaultOpen: true }} />)
    await flush()
    expect(content().getAttribute("data-state")).toBe("open")
    expect(content().getAttribute("data-vaul-animate")).toBe("false")
    expect(overlay().getAttribute("data-vaul-animate")).toBe("false")
  })

  test("controlled: reports the request and follows the prop", async () => {
    const user = setupUser()
    const onOpenChange = vi.fn()
    const { rerender } = render(<Example root={{ open: false, onOpenChange }} />)
    await user.click(trigger())
    await flush()
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    await expectClosed()
    rerender(<Example root={{ open: true, onOpenChange }} />)
    await flush()
    expectOpen()
    await user.keyboard("{Escape}")
    await flush()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    expectOpen()
    rerender(<Example root={{ open: false, onOpenChange }} />)
    await flush()
    await expectClosed()
  })

  test("Escape and a pointer down on the overlay dismiss; inside the content does not", async () => {
    const user = await open()
    fireEvent.pointerDown(screen.getByTestId("inner"))
    await flush()
    expectOpen()
    fireEvent.pointerDown(overlay())
    await flush()
    await expectClosed()
    await user.click(trigger())
    await flush()
    await user.keyboard("{Escape}")
    await flush()
    await expectClosed()
  })

  test("dismissible={false} ignores Escape, the overlay and drags", async () => {
    const user = await open({ root: { dismissible: false } })
    await user.keyboard("{Escape}")
    fireEvent.pointerDown(overlay())
    await flush()
    expectOpen()
    pointer("pointerdown", content(), 0, 100)
    pointer("pointermove", content(), 0, 400)
    expect(content().style.transform).toBe("")
  })

  test("modal={false} renders no overlay, leaves the page usable and ignores outside pointers", async () => {
    const user = setupUser()
    render(
      <div>
        <button>page</button>
        <Example root={{ modal: false }} />
      </div>
    )
    await user.click(trigger())
    await flush()
    expect(screen.queryByTestId("overlay")).toBeNull()
    expect(screen.getByText("page").closest("[inert]")).toBeNull()
    fireEvent.pointerDown(screen.getByText("page"))
    await flush()
    expectOpen()
    screen.getByText("page").focus()
    await flush()
    expectOpen()
    await user.keyboard("{Escape}")
    await flush()
    await expectClosed()
  })

  // happy-dom has no focus fixup for inert; Firefox moves focus from the inert trigger to body (checked against vaul, whose focus stays on its aria-hidden trigger)
  test("focus stays on the trigger unless autoFocus is set", async () => {
    await open()
    expect(document.activeElement).toBe(trigger())
    cleanup()
    await open({ root: { autoFocus: true } })
    expect(content().contains(document.activeElement)).toBe(true)
  })

  test("injects vaul's stylesheet once", () => {
    const styles = Array.from(document.head.querySelectorAll("style")).filter((style) => style.textContent?.includes("[data-vaul-drawer]"))
    expect(styles.length).toBe(1)
    expect(styles[0]!.textContent).toContain("@keyframes slideFromBottom")
  })
})

describe("drawer: markup", () => {
  test("overlay and content carry vaul's data attributes", async () => {
    await open()
    expect(overlay().getAttribute("data-vaul-overlay")).toBe("")
    expect(overlay().getAttribute("data-vaul-snap-points")).toBe("false")
    expect(overlay().getAttribute("data-vaul-snap-points-overlay")).toBe("true")
    expect(overlay().getAttribute("data-state")).toBe("open")
    expect(content().getAttribute("data-vaul-drawer")).toBe("")
    expect(content().getAttribute("data-vaul-drawer-direction")).toBe("bottom")
    expect(content().getAttribute("data-vaul-snap-points")).toBe("false")
    expect(content().getAttribute("data-vaul-delayed-snap-points")).toBe("false")
    expect(content().getAttribute("data-vaul-custom-container")).toBe("false")
    expect(content().getAttribute("data-vaul-animate")).toBe("true")
    expect(content().getAttribute("data-state")).toBe("open")
  })

  test.each(["top", "bottom", "left", "right"] as const)("direction=%s is reflected on the content", async (direction) => {
    await open({ root: { direction } })
    expect(content().getAttribute("data-vaul-drawer-direction")).toBe(direction)
  })

  test("className, style and ref reach the content element", async () => {
    const ref = { current: null as HTMLElement | null }
    await open({ content: { className: "drawer", style: { color: "red" }, ref } })
    expect(content().className).toBe("drawer")
    expect(content().style.color).toBe("red")
    expect(ref.current).toBe(content())
  })
})

// happy-dom has no layout and no pointer coordinates: pageX/pageY are set by hand, and the computed transform is the matrix a browser reports
function pointer(type: string, target: Element, x: number, y: number, pointerType = "mouse") {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType, clientX: x, clientY: y })
  Object.defineProperties(event, { pageX: { value: x }, pageY: { value: y } })
  act(() => void target.dispatchEvent(event))
}

function mockLayout() {
  const real = window.getComputedStyle.bind(window)
  vi.spyOn(window, "getComputedStyle").mockImplementation((node, pseudo) => {
    return new Proxy(real(node, pseudo), {
      get(style, prop) {
        if (prop === "transform") {
          const match = /translate3d\((-?[\d.]+)(?:px)?, (-?[\d.]+)(?:px)?, 0\)/.exec((node as HTMLElement).style.transform)
          return match ? `matrix(1, 0, 0, 1, ${match[1]}, ${match[2]})` : "none"
        }
        const value = Reflect.get(style, prop)
        return typeof value === "function" ? value.bind(style) : value
      },
    })
  })
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const box = this.hasAttribute("data-vaul-drawer") ? { top: 368, left: 0, width: 300, height: 400 } : { top: 0, left: 0, width: 0, height: 0 }
    return { ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON() {} } as DOMRect
  })
}

describe("drawer: drag to dismiss", () => {
  beforeEach(mockLayout)

  test("a drag past the close threshold closes the drawer", async () => {
    const onOpenChange = vi.fn()
    await open({ root: { onOpenChange } })
    pointer("pointerdown", content(), 0, 300)
    pointer("pointermove", content(), 0, 450)
    expect(content().style.transform).toBe("translate3d(0, 150px, 0)")
    await flush(1000)
    pointer("pointerup", content(), 0, 450)
    await flush()
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    await expectClosed()
    expect(trigger().getAttribute("data-state")).toBe("closed")
  })

  test("a short, slow drag springs back and keeps the drawer open", async () => {
    await open()
    pointer("pointerdown", content(), 0, 300)
    pointer("pointermove", content(), 0, 350)
    await flush(1000)
    pointer("pointerup", content(), 0, 350)
    await flush()
    expectOpen()
    expect(content().style.transform).toBe("translate3d(0, 0, 0)")
    expect(content().style.transition).toContain("transform 0.5s cubic-bezier(0.32,0.72,0,1)")
    expect(overlay().style.opacity).toBe("1")
  })

  test("a fast flick closes the drawer even when the drag is short", async () => {
    await open()
    pointer("pointerdown", content(), 0, 300)
    pointer("pointermove", content(), 0, 330)
    await flush(50)
    pointer("pointerup", content(), 0, 330)
    await flush()
    await expectClosed()
  })

  test("closeThreshold decides how far is far enough", async () => {
    await open({ root: { closeThreshold: 0.1 } })
    pointer("pointerdown", content(), 0, 300)
    pointer("pointermove", content(), 0, 350)
    await flush(1000)
    pointer("pointerup", content(), 0, 350)
    await flush()
    await expectClosed()
  })

  test("while dragging: vaul-dragging class, no transition, overlay fades with the drag", async () => {
    await open()
    pointer("pointerdown", content(), 0, 300)
    pointer("pointermove", content(), 0, 400)
    expect(content().classList.contains("vaul-dragging")).toBe(true)
    expect(content().style.transition).toBe("none")
    expect(overlay().style.transition).toBe("none")
    expect(overlay().style.opacity).toBe("0.75")
    await flush(1000)
    pointer("pointerup", content(), 0, 400)
    expect(content().classList.contains("vaul-dragging")).toBe(false)
  })

  test("closing in the middle of a drag ends the drag", async () => {
    const user = await open()
    pointer("pointerdown", content(), 0, 300)
    pointer("pointermove", content(), 0, 400)
    expect(content().classList.contains("vaul-dragging")).toBe(true)
    await user.keyboard("{Escape}")
    await flush()
    expect(content().getAttribute("data-state")).toBe("closed")
    expect(content().classList.contains("vaul-dragging")).toBe(false)
  })

  test("dragging back past the start is dampened and never closes", async () => {
    await open()
    pointer("pointerdown", content(), 0, 300)
    pointer("pointermove", content(), 0, 400)
    pointer("pointermove", content(), 0, 250)
    const translate = parseFloat(/translate3d\(0, (-?[\d.]+)px, 0\)/.exec(content().style.transform)![1]!)
    expect(translate).toBeLessThan(0)
    expect(translate).toBeGreaterThan(-20)
    await flush(1000)
    pointer("pointerup", content(), 0, 250)
    await flush()
    expectOpen()
  })

  test("an upward drag on a drawer at rest is left to scrolling", async () => {
    await open()
    pointer("pointerdown", content(), 0, 300)
    pointer("pointermove", content(), 0, 250)
    expect(content().style.transform).toBe("")
  })

  test("a drag that starts inside [data-vaul-no-drag] does not move the drawer", async () => {
    await open()
    const target = screen.getByTestId("no-drag")
    pointer("pointerdown", target, 0, 300)
    pointer("pointermove", target, 0, 450)
    expect(content().style.transform).toBe("")
    expect(content().classList.contains("vaul-dragging")).toBe(false)
  })

  test("a drag that starts while the drawer is sliding in is ignored", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(trigger())
    await flush()
    pointer("pointerdown", content(), 0, 300)
    pointer("pointermove", content(), 0, 450)
    expect(content().style.transform).toBe("")
  })

  test("a sideways start abandons the drag; a touch gets a wider allowance than a mouse", async () => {
    await open()
    pointer("pointerdown", content(), 0, 300)
    pointer("pointermove", content(), 8, 301)
    pointer("pointermove", content(), 8, 400)
    expect(content().style.transform).toBe("")
    pointer("pointerup", content(), 8, 400)
    pointer("pointerdown", content(), 0, 300, "touch")
    pointer("pointermove", content(), 8, 301, "touch")
    expect(content().style.transform).toBe("")
    pointer("pointermove", content(), 8, 320, "touch")
    expect(content().style.transform).toBe("translate3d(0, 20px, 0)")
  })

  test("the overlay's mouse up ends a drag", async () => {
    await open()
    pointer("pointerdown", content(), 0, 300)
    pointer("pointermove", content(), 0, 450)
    await flush(1000)
    act(() => void overlay().dispatchEvent(Object.defineProperties(new MouseEvent("mouseup", { bubbles: true }), { pageX: { value: 0 }, pageY: { value: 450 } })))
    await flush()
    expect(content().classList.contains("vaul-dragging")).toBe(false)
  })

  test.each([
    ["top", [0, 300, 0, 150], "translate3d(0, -150px, 0)"],
    ["left", [300, 0, 150, 0], "translate3d(-150px, 0, 0)"],
    ["right", [100, 0, 250, 0], "translate3d(150px, 0, 0)"],
  ] as const)("direction=%s closes when dragged towards its edge", async (direction, [x0, y0, x1, y1], transform) => {
    await open({ root: { direction } })
    pointer("pointerdown", content(), x0, y0)
    pointer("pointermove", content(), x1, y1)
    expect(content().style.transform).toBe(transform)
    await flush(1000)
    pointer("pointerup", content(), x1, y1)
    await flush()
    await expectClosed()
  })

  test("a side drawer measures the threshold against its width", async () => {
    await open({ root: { direction: "right" } })
    pointer("pointerdown", content(), 100, 0)
    pointer("pointermove", content(), 160, 0)
    await flush(1000)
    pointer("pointerup", content(), 160, 0)
    await flush()
    // 60px is 15% of the 400px height but 20% of the 300px width: below 25% either way
    expectOpen()
    pointer("pointerdown", content(), 100, 0)
    pointer("pointermove", content(), 180, 0)
    await flush(1000)
    pointer("pointerup", content(), 180, 0)
    await flush()
    // 80px is above 25% of the 300px width (75px) and below 25% of the 400px height (100px)
    await expectClosed()
  })

  test("pointer up reaches the user's own handler", async () => {
    const onPointerUp = vi.fn()
    const onPointerDown = vi.fn()
    await open({ content: { onPointerUp, onPointerDown } })
    pointer("pointerdown", content(), 0, 300)
    pointer("pointerup", content(), 0, 300)
    expect(onPointerDown).toHaveBeenCalledTimes(1)
    expect(onPointerUp).toHaveBeenCalledTimes(1)
  })
})

describe("drawer: on-screen keyboard", () => {
  test("a focused input lifts the drawer by the keyboard's height and puts it back", async () => {
    mockLayout()
    const viewport = Object.assign(new EventTarget(), { height: 768, width: 1024 })
    vi.stubGlobal("visualViewport", viewport)
    await open()
    screen.getByLabelText("name").focus()
    viewport.height = 400
    act(() => void viewport.dispatchEvent(new Event("resize")))
    expect(content().style.bottom).toBe("368px")
    expect(content().style.height).toBe("400px")
    viewport.height = 768
    act(() => void viewport.dispatchEvent(new Event("resize")))
    expect(content().style.bottom).toBe("0px")
  })
})
