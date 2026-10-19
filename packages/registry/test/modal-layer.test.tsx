import { useRef, useState } from "preact/hooks"
import { render } from "@testing-library/preact"
import { afterEach, describe, expect, test, vi } from "vitest"
import * as Portal from "../src/radix/internal/portal"
import { useModalLayer } from "../src/radix/internal/modal-layer"

// Like a dialog: overlay and content are separate body children
function Modal({ id, overlay = false }: { id: string; overlay?: boolean }) {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  useModalLayer(node, overlay ? overlayRef : undefined)
  return (
    <Portal.Root>
      {overlay && <div id={`${id}-overlay`} ref={overlayRef} />}
      <section id={`${id}-content`} ref={setNode} />
    </Portal.Root>
  )
}

const isInert = (id: string) => document.getElementById(id)!.hasAttribute("inert")
// What the platform uses: inert is inherited, so an element is out of reach when it or any ancestor has the attribute
const isOutOfReach = (id: string) => document.getElementById(id)!.closest("[inert]") !== null

function addPage() {
  const el = document.createElement("div")
  el.id = "page"
  document.body.append(el)
  return el
}

// An app root holding content, a nested Toaster-like live region and a script next to it
function addAppWithLiveRegion() {
  const app = addPage()
  app.innerHTML = `<main id="content"><button id="cta"></button></main>
    <div id="chrome"><p id="chrome-text"></p><section id="live" aria-live="polite"><button id="toast-close"></button></section></div>
    <script id="script"></script>`
  return app
}

afterEach(() => {
  document.getElementById("page")?.remove()
  document.body.removeAttribute("style")
  vi.restoreAllMocks()
})

describe("useModalLayer", () => {
  test("makes the rest of the page inert but not the layer or its overlay, and restores it", () => {
    addPage()
    const { unmount } = render(<Modal id="a" overlay />)
    expect(isInert("page")).toBe(true)
    expect(isInert("a-content")).toBe(false)
    expect(isInert("a-overlay")).toBe(false)
    unmount()
    expect(isInert("page")).toBe(false)
  })

  test("leaves elements that were already inert alone", () => {
    addPage().setAttribute("inert", "")
    const { unmount } = render(<Modal id="a" />)
    unmount()
    expect(isInert("page")).toBe(true)
  })

  test("stacked modals hide each other and restore in order", () => {
    addPage()
    const first = render(<Modal id="a" overlay />)
    const second = render(<Modal id="b" />)
    expect(isInert("a-content")).toBe(true)
    expect(isInert("a-overlay")).toBe(true)
    expect(isInert("b-content")).toBe(false)
    second.unmount()
    expect(isInert("a-content")).toBe(false)
    expect(isInert("a-overlay")).toBe(false)
    expect(isInert("page")).toBe(true)
    first.unmount()
    expect(isInert("page")).toBe(false)
  })

  test("spares an aria-live region inside the page and the ancestors that lead to it", () => {
    addAppWithLiveRegion()
    const { unmount } = render(<Modal id="a" />)
    expect(isInert("page")).toBe(false)
    expect(isInert("chrome")).toBe(false)
    expect(isOutOfReach("live")).toBe(false)
    expect(isOutOfReach("toast-close")).toBe(false)
    expect(isInert("content")).toBe(true)
    expect(isOutOfReach("cta")).toBe(true)
    expect(isInert("chrome-text")).toBe(true)
    expect(isInert("script")).toBe(false)
    unmount()
    expect(document.querySelectorAll("[inert]")).toHaveLength(0)
  })

  test("a toast added to the live region while the layer is open is reachable", () => {
    addAppWithLiveRegion()
    const { unmount } = render(<Modal id="a" />)
    const late = document.createElement("button")
    late.id = "late"
    document.getElementById("live")!.append(late)
    expect(isOutOfReach("late")).toBe(false)
    unmount()
  })

  test("stacked modals keep the live region reachable and restore the page as it was", () => {
    addAppWithLiveRegion()
    document.getElementById("chrome-text")!.setAttribute("inert", "")
    const first = render(<Modal id="a" />)
    const second = render(<Modal id="b" />)
    expect(isOutOfReach("a-content")).toBe(true)
    expect(isOutOfReach("toast-close")).toBe(false)
    first.unmount()
    expect(isOutOfReach("content")).toBe(true)
    expect(isOutOfReach("toast-close")).toBe(false)
    second.unmount()
    expect(Array.from(document.querySelectorAll("[inert]"), (el) => el.id)).toEqual(["chrome-text"])
  })

  test("locks body scroll with scrollbar compensation until the last modal closes", () => {
    document.body.style.paddingRight = "4px"
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(1015)
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1000)
    addPage()
    const first = render(<Modal id="a" />)
    expect(document.body.style.overflow).toBe("hidden")
    expect(document.body.style.paddingRight).toBe("19px")
    const second = render(<Modal id="b" />)
    first.unmount()
    expect(document.body.style.overflow).toBe("hidden")
    second.unmount()
    expect(document.body.style.overflow).toBe("")
    expect(document.body.style.paddingRight).toBe("4px")
  })
})
