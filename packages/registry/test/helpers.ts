import { act, cleanup } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, vi } from "vitest"

// 1ms rather than 0: fake timers give a timer created during a tick a minimum delay of 1ms
export const flush = (ms = 1) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

export const setupUser = () => userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTimeAsync(ms) })

// Overlays defer work with timers (pointer listeners, delays, focus return): fake them and settle before the next test
export function useFakeTimers() {
  beforeEach(() => void vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] }))
  afterEach(async () => {
    cleanup()
    await flush()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
}

// happy-dom has no CSS animations: report one per data-state so Presence keeps closed content mounted until animationend
export function mockAnimations(names = { open: "fade-in", closed: "fade-out" }) {
  const real = window.getComputedStyle.bind(window)
  vi.spyOn(window, "getComputedStyle").mockImplementation((node, pseudo) => {
    return new Proxy(real(node, pseudo), {
      get(style, prop) {
        if (prop === "animationName") return (node as HTMLElement).getAttribute("data-state") === "closed" ? names.closed : names.open
        const value = Reflect.get(style, prop)
        return typeof value === "function" ? value.bind(style) : value
      },
    })
  })
  return (node: Element, animationName = names.closed) =>
    act(() => {
      node.dispatchEvent(Object.assign(new Event("animationend", { bubbles: true }), { animationName }))
    })
}

type Box = { left: number; top: number; width: number; height: number }

// happy-dom has no layout. Report fixed boxes: the element with data-testid="anchor" (or `anchor` when given a test id) is the
// reference, popper wrappers and arrows get fixed sizes, and the viewport is 1000x800.
export function mockLayout({ anchor, floating = { width: 80, height: 40 }, arrow = { width: 10, height: 5 }, anchorId = "anchor" }: {
  anchor: Box
  floating?: { width: number; height: number }
  arrow?: { width: number; height: number }
  anchorId?: string
}) {
  const sizeOf = (element: Element) =>
    element.hasAttribute("data-radix-popper-content-wrapper") ? floating : element.parentElement?.hasAttribute("data-radix-popper-content-wrapper") ? floating : arrow
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    return sizeOf(this).width
  })
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return sizeOf(this).height
  })
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this === document.documentElement ? 1000 : 0
  })
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(function (this: HTMLElement) {
    return this === document.documentElement ? 800 : 0
  })
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const box = this.getAttribute("data-testid") === anchorId ? anchor : { left: 0, top: 0, ...sizeOf(this) }
    return { ...box, right: box.left + box.width, bottom: box.top + box.height, x: box.left, y: box.top, toJSON() {} } as DOMRect
  })
}

// happy-dom lacks these reflecting properties: model them, because Preact writes a prop through the property when the element has one
export function defineBrowserProperty(name: string, [on, off]: [string, string]) {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)
  Object.defineProperty(HTMLElement.prototype, name, {
    configurable: true,
    get() {
      return this.getAttribute(name) !== off
    },
    set(value) {
      this.setAttribute(name, value ? on : off)
    },
  })
  return () => (original ? Object.defineProperty(HTMLElement.prototype, name, original) : void delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name])
}
