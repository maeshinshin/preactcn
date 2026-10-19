import { act, fireEvent, render, screen } from "@testing-library/preact"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import * as ScrollArea from "../src/radix/scroll-area"

const isViewport = (el: HTMLElement) => el.hasAttribute("data-radix-scroll-area-viewport")

function mockMetrics({ overflowY = true, overflowX = false } = {}) {
  const size = (el: HTMLElement, viewportSize: number, scrollbarSize: number) =>
    isViewport(el) ? viewportSize : el.hasAttribute("data-orientation") && el.hasAttribute("data-scrollbar") ? scrollbarSize : 0
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return size(this, 100, 100)
  })
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return size(this, 100, 100)
  })
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
    return isViewport(this) ? (overflowY ? 400 : 100) : 0
  })
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    return size(this, 100, 100)
  })
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return size(this, 100, 100)
  })
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
    return isViewport(this) ? (overflowX ? 300 : 100) : 0
  })
}

function Basic({ horizontal = false }: { horizontal?: boolean }) {
  return (
    <ScrollArea.Root data-testid="root">
      <ScrollArea.Viewport data-testid="viewport">
        <p>content</p>
      </ScrollArea.Viewport>
      <ScrollArea.ScrollAreaScrollbar data-scrollbar="" data-testid="vbar">
        <ScrollArea.ScrollAreaThumb data-testid="vthumb" />
      </ScrollArea.ScrollAreaScrollbar>
      {horizontal && (
        <ScrollArea.ScrollAreaScrollbar orientation="horizontal" data-scrollbar="" data-testid="hbar">
          <ScrollArea.ScrollAreaThumb data-testid="hthumb" />
        </ScrollArea.ScrollAreaScrollbar>
      )}
      <ScrollArea.Corner data-testid="corner" />
    </ScrollArea.Root>
  )
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const hover = () => act(() => void fireEvent.pointerEnter(screen.getByTestId("root")))

describe("scroll-area structure", () => {
  test("renders a relative root and a scrollable viewport with a table content wrapper", () => {
    render(<Basic />)
    const root = screen.getByTestId("root")
    expect(root.style.position).toBe("relative")
    expect(root.getAttribute("dir")).toBe("ltr")
    expect(root.style.getPropertyValue("--radix-scroll-area-corner-width")).toBe("0px")
    const viewport = screen.getByTestId("viewport")
    expect(viewport.hasAttribute("data-radix-scroll-area-viewport")).toBe(true)
    expect(viewport.style.overflowY).toBe("scroll")
    expect(viewport.style.overflowX).toBe("hidden")
    const wrapper = viewport.firstElementChild as HTMLElement
    expect(wrapper.style.display).toBe("table")
    expect(wrapper.style.minWidth).toBe("100%")
    expect(wrapper.textContent).toBe("content")
  })

  test("injects the rule that hides the native scrollbar", () => {
    const { container } = render(<Basic />)
    expect(container.querySelector("style")!.textContent).toContain("[data-radix-scroll-area-viewport]")
  })

  test("with a horizontal scrollbar the viewport scrolls horizontally too", () => {
    render(<Basic horizontal />)
    expect(screen.getByTestId("viewport").style.overflowX).toBe("scroll")
  })
})

describe("scroll-area scrollbar", () => {
  test("is hidden until the pointer enters the area and the content overflows", () => {
    mockMetrics()
    render(<Basic />)
    expect(screen.queryByTestId("vbar")).toBeNull()
    hover()
    const bar = screen.getByTestId("vbar")
    expect(bar.getAttribute("data-state")).toBe("visible")
    expect(bar.getAttribute("data-orientation")).toBe("vertical")
    expect(bar.style.position).toBe("absolute")
    expect(bar.style.top).toBe("0px")
    expect(bar.style.right).toBe("0px")
  })

  test("stays hidden when nothing overflows", () => {
    mockMetrics({ overflowY: false })
    render(<Basic />)
    hover()
    expect(screen.queryByTestId("vbar")).toBeNull()
  })

  test("hides again 600ms after the pointer leaves", () => {
    vi.useFakeTimers()
    mockMetrics()
    render(<Basic />)
    hover()
    act(() => void fireEvent.pointerLeave(screen.getByTestId("root")))
    act(() => void vi.advanceTimersByTime(599))
    expect(screen.queryByTestId("vbar")).not.toBeNull()
    act(() => void vi.advanceTimersByTime(1))
    expect(screen.queryByTestId("vbar")).toBeNull()
  })

  test("the thumb is sized by the visible ratio and follows the scroll position", () => {
    mockMetrics()
    render(<Basic />)
    hover()
    expect(screen.getByTestId("vbar").style.getPropertyValue("--radix-scroll-area-thumb-height")).toBe("25px")
    const thumb = screen.getByTestId("vthumb")
    expect(thumb.getAttribute("data-state")).toBe("visible")
    expect(thumb.style.height).toBe("var(--radix-scroll-area-thumb-height)")
    const viewport = screen.getByTestId("viewport")
    viewport.scrollTop = 150
    act(() => void fireEvent.scroll(viewport))
    expect(thumb.style.transform).toBe("translate3d(0, 37.5px, 0)")
  })

  test("never makes the thumb smaller than 18px", () => {
    mockMetrics()
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(function (this: HTMLElement) {
      return isViewport(this) ? 10000 : 0
    })
    render(<Basic />)
    hover()
    expect(screen.getByTestId("vbar").style.getPropertyValue("--radix-scroll-area-thumb-height")).toBe("18px")
  })

  test("pressing the track scrolls the viewport to that position", () => {
    mockMetrics()
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 10, height: 100 } as DOMRect)
    vi.spyOn(HTMLElement.prototype, "setPointerCapture").mockImplementation(() => {})
    vi.spyOn(HTMLElement.prototype, "hasPointerCapture").mockReturnValue(true)
    render(<Basic />)
    hover()
    const bar = screen.getByTestId("vbar")
    fireEvent.pointerDown(bar, { clientY: 50, clientX: 5, button: 0, pointerId: 1 })
    expect(screen.getByTestId("viewport").scrollTop).toBe(150)
    fireEvent.pointerMove(bar, { clientY: 87.5, clientX: 5, pointerId: 1 })
    expect(screen.getByTestId("viewport").scrollTop).toBe(300)
  })

  test("horizontal scrollbar is anchored to the bottom", () => {
    mockMetrics({ overflowX: true, overflowY: false })
    render(<Basic horizontal />)
    hover()
    const bar = screen.getByTestId("hbar")
    expect(bar.getAttribute("data-orientation")).toBe("horizontal")
    expect(bar.style.bottom).toBe("0px")
    expect(parseFloat(bar.style.getPropertyValue("--radix-scroll-area-thumb-width"))).toBeCloseTo(33.33, 1)
  })
})

describe("scroll-area corner", () => {
  test("is only rendered when both scrollbars are visible, sized by them", () => {
    mockMetrics({ overflowX: true })
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
      return isViewport(this) ? 100 : this.getAttribute("data-testid") === "vbar" ? 10 : 0
    })
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
      return isViewport(this) ? 100 : this.getAttribute("data-testid") === "hbar" ? 8 : 0
    })
    const { unmount } = render(<Basic />)
    hover()
    expect(screen.queryByTestId("corner")).toBeNull()
    unmount()
    render(<Basic horizontal />)
    hover()
    expect(screen.getByTestId("corner").style.width).toBe("10px")
    expect(screen.getByTestId("corner").style.height).toBe("8px")
    expect(screen.getByTestId("root").style.getPropertyValue("--radix-scroll-area-corner-width")).toBe("10px")
    expect(screen.getByTestId("root").style.getPropertyValue("--radix-scroll-area-corner-height")).toBe("8px")
  })
})
