import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { toast, Toaster, type ToasterProps } from "../src/shims/sonner"
import { flush } from "./helpers"

// Date is faked too: the pause logic measures elapsed time with it
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "Date"] })
  toast.dismiss() // the toast state is module-wide: forget what an earlier test left behind
})
afterEach(async () => {
  cleanup()
  await flush()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const mount = (props: ToasterProps = {}) => render(<Toaster {...props} />)
const items = () => [...document.querySelectorAll<HTMLElement>("[data-sonner-toast]")]
const first = () => items()[0]!
const lists = () => [...document.querySelectorAll<HTMLElement>("[data-sonner-toaster]")]
const list = () => lists()[0]!

// toast() hands the toast to the Toaster in a timer of its own, so every call needs a tick
async function show<T>(create: () => T) {
  let result!: T
  act(() => void (result = create()))
  await flush()
  return result
}

describe("sonner", () => {
  test("shows a toast with title and description and removes it after the default 4000ms", async () => {
    mount()
    await show(() => toast("Event has been created", { description: "Monday, January 3rd at 6:00pm" }))
    expect(items()).toHaveLength(1)
    expect(first().querySelector("[data-title]")!.textContent).toBe("Event has been created")
    expect(first().querySelector("[data-description]")!.textContent).toBe("Monday, January 3rd at 6:00pm")
    expect(first().dataset.mounted).toBe("true")
    expect(first().dataset.removed).toBe("false")

    await flush(3990)
    expect(first().dataset.removed).toBe("false")
    await flush(20)
    expect(first().dataset.removed).toBe("true")
    expect(items()).toHaveLength(1) // kept for the 200ms exit animation
    await flush(200)
    expect(items()).toHaveLength(0)
  })

  test("a toast without a type has no type attribute, no icon and no description element", async () => {
    mount()
    await show(() => toast("Plain"))
    expect(first().hasAttribute("data-type")).toBe(false)
    expect(first().querySelector("[data-icon]")).toBeNull()
    expect(first().querySelector("[data-description]")).toBeNull()
    expect(first().dataset.styled).toBe("true")
  })

  test("toast duration, Toaster duration and Infinity decide when it closes; onAutoClose runs", async () => {
    mount({ duration: 1000 })
    const onAutoClose = vi.fn()
    await show(() => {
      toast("fromToaster")
      toast("own", { duration: 2000, onAutoClose })
      toast("forever", { duration: Infinity })
    })
    expect(items().map((li) => li.textContent)).toEqual(["forever", "own", "fromToaster"])
    await flush(1000)
    expect(items().map((li) => li.dataset.removed)).toEqual(["false", "false", "true"])
    await flush(1000) // "fromToaster" has left the DOM by now
    expect(items().map((li) => li.dataset.removed)).toEqual(["false", "true"])
    expect(onAutoClose).toHaveBeenCalledTimes(1)
    await flush(60_000)
    expect(items().map((li) => li.textContent)).toEqual(["forever"])
  })

  test("pauses while the list is hovered and resumes with the remaining time", async () => {
    mount()
    await show(() => toast("Saved", { duration: 1000 }))
    await flush(600)
    fireEvent.mouseEnter(list())
    expect(first().dataset.expanded).toBe("true")
    await flush(5000)
    expect(first().dataset.removed).toBe("false")

    fireEvent.mouseLeave(list())
    expect(first().dataset.expanded).toBe("false")
    await flush(390)
    expect(first().dataset.removed).toBe("false")
    await flush(20)
    expect(first().dataset.removed).toBe("true")
  })

  test("pauses while the document is hidden", async () => {
    mount()
    await show(() => toast("Saved", { duration: 1000 }))
    await flush(400)
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true })
    act(() => void document.dispatchEvent(new Event("visibilitychange")))
    await flush(5000)
    expect(first().dataset.removed).toBe("false")

    Reflect.deleteProperty(document, "hidden")
    act(() => void document.dispatchEvent(new Event("visibilitychange")))
    await flush(590)
    expect(first().dataset.removed).toBe("false")
    await flush(20)
    expect(first().dataset.removed).toBe("true")
  })

  test("the hotkey expands the list and focuses it, Escape collapses it", async () => {
    mount()
    await show(() => toast("Saved"))
    expect(screen.getByRole("region", { name: "Notifications alt+T" })).toBeTruthy()
    fireEvent.keyDown(document, { altKey: true, code: "KeyT" })
    expect(first().dataset.expanded).toBe("true")
    expect(document.activeElement).toBe(list())
    fireEvent.keyDown(document, { code: "Escape" })
    expect(first().dataset.expanded).toBe("false")
  })

  test("types set data-type and show their icons; a loading toast never closes by itself", async () => {
    mount()
    await show(() => {
      toast.success("s")
      toast.info("i")
      toast.warning("w")
      toast.error("e")
      toast.loading("l")
    })
    expect(items().map((li) => li.dataset.type)).toEqual(["loading", "error", "warning", "info", "success"])
    const [loading, ...typed] = items()
    for (const li of typed) expect(li.querySelector("[data-icon] svg[aria-hidden='true']")).not.toBeNull()
    expect(loading!.querySelector("[data-icon] .sonner-loading-wrapper")!.querySelectorAll(".sonner-loading-bar")).toHaveLength(12)
    expect(loading!.querySelector(".sonner-loading-wrapper")!.getAttribute("data-visible")).toBe("true")
    await flush(60_000)
    expect(items().map((li) => li.dataset.type)).toEqual(["loading"])
  })

  test("icons from the Toaster replace the built-in ones, null hides one", async () => {
    mount({
      icons: {
        success: <i data-testid="ok" />,
        loading: <i data-testid="busy" />,
        error: null,
      },
    })
    await show(() => {
      toast.success("s")
      toast.loading("l")
      toast.error("e")
    })
    const [error, loading, success] = items()
    expect(success!.querySelector("[data-icon] [data-testid='ok']")).not.toBeNull()
    expect(loading!.querySelector(".sonner-loader[data-visible='true'] [data-testid='busy']")).not.toBeNull()
    expect(error!.querySelector("[data-icon]")).toBeNull()
  })

  test("a toast's own icon wins over the Toaster's", async () => {
    mount({ icons: { success: <i data-testid="ok" /> } })
    await show(() => toast.success("s", { icon: <i data-testid="mine" /> }))
    expect(first().querySelector("[data-testid='mine']")).not.toBeNull()
    expect(first().querySelector("[data-testid='ok']")).toBeNull()
  })

  test("an action button runs onClick and dismisses, unless the handler prevents the default", async () => {
    mount()
    const onClick = vi.fn()
    const keep = vi.fn((event: Event) => event.preventDefault())
    await show(() => {
      toast("one", { action: { label: "Undo", onClick } })
      toast("two", { action: { label: "Stay", onClick: keep } })
    })
    fireEvent.click(screen.getByText("Stay"))
    expect(keep).toHaveBeenCalledTimes(1)
    expect(items().map((li) => li.dataset.removed)).toEqual(["false", "false"])

    const undo = screen.getByText("Undo")
    expect(undo.hasAttribute("data-action")).toBe(true)
    expect(undo.hasAttribute("data-button")).toBe(true)
    fireEvent.click(undo)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(items().map((li) => li.dataset.removed)).toEqual(["false", "true"])
  })

  test("a cancel button runs onClick and dismisses; an element is rendered as it is", async () => {
    mount()
    const onClick = vi.fn()
    await show(() => {
      toast("one", { cancel: { label: "Nope", onClick } })
      toast("two", { action: <a data-testid="custom">Open</a> })
    })
    expect(screen.getByTestId("custom").closest("[data-sonner-toast]")).toBe(items()[0])
    fireEvent.click(screen.getByText("Nope"))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(items()[1]!.dataset.removed).toBe("true")
  })

  test("the close button is labelled, dismisses and calls onDismiss", async () => {
    mount({ closeButton: true })
    const onDismiss = vi.fn()
    await show(() => toast("Saved", { onDismiss }))
    const close = screen.getByRole("button", { name: "Close toast" })
    expect(close.hasAttribute("data-close-button")).toBe(true)
    fireEvent.click(close)
    expect(onDismiss).toHaveBeenCalledTimes(1)
    expect(first().dataset.removed).toBe("true")
  })

  test("stacks newest first with index, front, z-index and offset", async () => {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ height: 50 } as DOMRect)
    mount()
    // one at a time, as in an app: heights are recorded in the order the toasts mount
    for (const title of ["first", "second", "third"]) await show(() => toast(title))
    expect(items().map((li) => li.textContent)).toEqual(["third", "second", "first"])
    expect(items().map((li) => li.dataset.index)).toEqual(["0", "1", "2"])
    expect(items().map((li) => li.dataset.front)).toEqual(["true", "false", "false"])
    expect(items().map((li) => li.style.getPropertyValue("--z-index"))).toEqual(["3", "2", "1"])
    expect(items().map((li) => li.style.getPropertyValue("--index"))).toEqual(["0", "1", "2"])
    expect(items().map((li) => li.style.getPropertyValue("--offset"))).toEqual(["0px", "64px", "128px"])
    expect(items().map((li) => li.style.getPropertyValue("--initial-height"))).toEqual(["50px", "50px", "50px"])
    expect(list().style.getPropertyValue("--front-toast-height")).toBe("50px")
  })

  test("expands on hover and shows only visibleToasts toasts", async () => {
    mount()
    await show(() => {
      for (const n of [1, 2, 3, 4]) toast(`toast ${n}`)
    })
    expect(items().map((li) => li.dataset.visible)).toEqual(["true", "true", "true", "false"])
    expect(items().map((li) => li.dataset.expanded)).toEqual(["false", "false", "false", "false"])
    fireEvent.mouseMove(list())
    expect(items().map((li) => li.dataset.expanded)).toEqual(["true", "true", "true", "true"])
    fireEvent.mouseLeave(list())
    expect(items().map((li) => li.dataset.expanded)).toEqual(["false", "false", "false", "false"])
  })

  test("expand keeps the stack open from the start", async () => {
    mount({ expand: true })
    await show(() => {
      toast("a")
      toast("b")
    })
    expect(items().map((li) => li.dataset.expanded)).toEqual(["true", "true"])
    expect(items().map((li) => li.style.getPropertyValue("--initial-height"))).toEqual(["auto", "auto"])
  })

  test("toast() works before any Toaster exists and the toast shows up once it mounts", async () => {
    const id = toast("early")
    await flush(1000)
    mount()
    await flush()
    expect(typeof id).toBe("number")
    expect(items().map((li) => li.textContent)).toEqual(["early"])
  })

  test("toast.dismiss(id) removes one toast, toast.dismiss() all of them", async () => {
    mount()
    const [a] = await show(() => [toast("a"), toast("b"), toast("c")])
    act(() => void toast.dismiss(a))
    await flush(40) // two frames: one to reach the Toaster, one to start the exit
    expect(items().map((li) => [li.textContent, li.dataset.removed])).toEqual([
      ["c", "false"],
      ["b", "false"],
      ["a", "true"],
    ])
    await flush(200)
    expect(items().map((li) => li.textContent)).toEqual(["c", "b"])

    act(() => void toast.dismiss())
    await flush(20)
    expect(items().map((li) => li.dataset.removed)).toEqual(["true", "true"])
    await flush(200)
    expect(items()).toHaveLength(0)
  })

  test("a toast created with the id of a visible one updates it in place", async () => {
    mount()
    await show(() => toast("Saving", { id: "save" }))
    await show(() => toast.success("Saved", { id: "save", description: "done" }))
    expect(items()).toHaveLength(1)
    expect(first().dataset.type).toBe("success")
    expect(first().querySelector("[data-title]")!.textContent).toBe("Saved")
    expect(first().querySelector("[data-description]")!.textContent).toBe("done")
  })

  test("a title or description can be a function or an element", async () => {
    mount()
    await show(() => toast(() => "from a function", { description: <b data-testid="rich">bold</b> }))
    expect(first().querySelector("[data-title]")!.textContent).toBe("from a function")
    expect(screen.getByTestId("rich").parentElement!.hasAttribute("data-description")).toBe(true)
  })

  test("class names merge from the Toaster, toastOptions and the toast", async () => {
    mount({ className: "toaster group", toastOptions: { className: "base", classNames: { toast: "cn-toast", success: "ok", title: "t" } } })
    await show(() => toast.success("s", { className: "mine", classNames: { toast: "own" }, descriptionClassName: "d", description: "x" }))
    expect(list().className).toBe("toaster group")
    expect(first().className).toBe("base mine cn-toast own ok")
    expect(first().querySelector("[data-title]")!.className).toBe("t")
    expect(first().querySelector("[data-description]")!.className).toBe("d")
  })

  test("unstyled and richColors show up as attributes", async () => {
    mount({ richColors: true })
    await show(() => {
      toast("a", { unstyled: true })
      toast("b", { richColors: false })
    })
    expect(items().map((li) => li.dataset.styled)).toEqual(["true", "false"])
    expect(items().map((li) => li.dataset.richColors)).toEqual(["false", "true"])
  })

  test("the Toaster is a polite live region that exists before the first toast", () => {
    const { container } = mount()
    const region = container.querySelector("section")!
    expect(region.getAttribute("aria-label")).toBe("Notifications alt+T")
    expect(region.getAttribute("aria-live")).toBe("polite")
    expect(region.getAttribute("aria-relevant")).toBe("additions text")
    expect(region.getAttribute("aria-atomic")).toBe("false")
    expect(region.getAttribute("tabindex")).toBe("-1")
    expect(lists()).toHaveLength(0)
  })

  test("labels and hotkey can be replaced", () => {
    const { container, rerender } = mount({ containerAriaLabel: "Alerts", hotkey: ["altKey", "KeyA"] })
    expect(container.querySelector("section")!.getAttribute("aria-label")).toBe("Alerts alt+A")
    rerender(<Toaster customAriaLabel="Toasts here" />)
    expect(container.querySelector("section")!.getAttribute("aria-label")).toBe("Toasts here")
  })

  test("position, offsets, gap and dir end up on the list", async () => {
    document.documentElement.dir = "rtl"
    mount({ position: "top-center", gap: 20, offset: { top: 10, right: "2rem" }, mobileOffset: 8 })
    await show(() => toast("a"))
    expect(list().dataset.yPosition).toBe("top")
    expect(list().dataset.xPosition).toBe("center")
    expect(first().dataset.yPosition).toBe("top")
    expect(list().dir).toBe("rtl")
    const css = (name: string) => list().style.getPropertyValue(name)
    expect(css("--gap")).toBe("20px")
    expect(css("--width")).toBe("356px")
    expect([css("--offset-top"), css("--offset-right"), css("--offset-bottom"), css("--offset-left")]).toEqual(["10px", "2rem", "24px", "24px"])
    expect([css("--mobile-offset-top"), css("--mobile-offset-left")]).toEqual(["8px", "8px"])
    document.documentElement.removeAttribute("dir")
  })

  test("a toast with its own position gets a list of its own", async () => {
    mount()
    await show(() => {
      toast("here")
      toast("there", { position: "top-left" })
    })
    expect(lists().map((ol) => [ol.dataset.yPosition, ol.dataset.xPosition, ol.textContent])).toEqual([
      ["bottom", "right", "here"],
      ["top", "left", "there"],
    ])
  })

  test("an id on the Toaster picks the toasts that carry that toasterId", async () => {
    render(
      <>
        <section data-testid="plain">
          <Toaster />
        </section>
        <section data-testid="named">
          <Toaster id="side" />
        </section>
      </>
    )
    await show(() => {
      toast("a")
      toast("b", { toasterId: "side" })
    })
    expect(screen.getByTestId("plain").textContent).toBe("a")
    expect(screen.getByTestId("named").textContent).toBe("b")
  })

  test("theme: explicit, and system follows prefers-color-scheme live", async () => {
    const view = mount({ theme: "dark" })
    await show(() => toast("a"))
    expect(list().dataset.sonnerTheme).toBe("dark")
    view.unmount()
    toast.dismiss()

    let onChange: (() => void) | undefined
    const query = {
      matches: false,
      addEventListener: vi.fn((_: string, listener: () => void) => void (onChange = listener)),
      removeEventListener: vi.fn(),
    }
    vi.spyOn(window, "matchMedia").mockReturnValue(query as unknown as MediaQueryList)
    const system = mount({ theme: "system" })
    await show(() => toast("b"))
    expect(list().dataset.sonnerTheme).toBe("light")
    query.matches = true
    act(() => onChange!())
    expect(list().dataset.sonnerTheme).toBe("dark")
    system.unmount()
    await flush(50) // Preact 11 runs passive cleanups after the next frame
    expect(query.removeEventListener).toHaveBeenCalledWith("change", onChange)
  })

  describe("swipe", () => {
    const drag = async (to: { clientX: number; clientY: number }, ms: number) => {
      vi.spyOn(HTMLElement.prototype, "setPointerCapture").mockImplementation(() => {})
      const li = first()
      fireEvent.pointerDown(li, { button: 0, pointerId: 1, clientX: 0, clientY: 0 })
      fireEvent.pointerMove(li, { clientX: Math.sign(to.clientX) * 2, clientY: Math.sign(to.clientY) * 2 }) // locks the axis
      fireEvent.pointerMove(li, to)
      await flush(ms)
      return li
    }

    test("a far swipe in an allowed direction dismisses", async () => {
      mount()
      const onDismiss = vi.fn()
      await show(() => toast("a", { onDismiss }))
      const li = await drag({ clientX: 100, clientY: 0 }, 10)
      expect(li.dataset.swiping).toBe("true")
      expect(li.style.getPropertyValue("--swipe-amount-x")).toBe("100px")
      fireEvent.pointerUp(li)
      expect(li.dataset.swipeOut).toBe("true")
      expect(li.dataset.swipeDirection).toBe("right")
      expect(onDismiss).toHaveBeenCalledTimes(1)
      await flush(200)
      expect(items()).toHaveLength(0)
    })

    test("a short slow swipe springs back", async () => {
      mount()
      await show(() => toast("a"))
      const li = await drag({ clientX: 10, clientY: 0 }, 1000)
      fireEvent.pointerUp(li)
      expect(li.dataset.swipeOut).toBe("false")
      expect(li.style.getPropertyValue("--swipe-amount-x")).toBe("0px")
      expect(li.dataset.removed).toBe("false")
    })

    test("swiping towards a disallowed direction does not dismiss", async () => {
      mount()
      await show(() => toast("a"))
      const li = await drag({ clientX: -200, clientY: 0 }, 10)
      fireEvent.pointerUp(li)
      expect(li.dataset.removed).toBe("false")
    })

    test("a toast that is not dismissible ignores swipes", async () => {
      mount()
      await show(() => toast("a", { dismissible: false }))
      expect(first().dataset.dismissible).toBe("false")
      const li = await drag({ clientX: 100, clientY: 0 }, 10)
      fireEvent.pointerUp(li)
      expect(li.dataset.removed).toBe("false")
    })
  })

  test("injects sonner's stylesheet once", () => {
    const sheets = [...document.head.querySelectorAll("style")].filter((style) => style.textContent!.includes("[data-sonner-toaster]"))
    expect(sheets).toHaveLength(1)
    expect(sheets[0]!.textContent).toContain("[data-sonner-toast][data-styled='true']")
  })

  test("puts focus back where it was when focus leaves the list", async () => {
    render(
      <>
        <button data-testid="outside">outside</button>
        <Toaster />
      </>
    )
    await show(() => toast("a", { action: { label: "Undo", onClick() {} } }))
    const outside = screen.getByTestId("outside")
    const undo = screen.getByText("Undo")
    outside.focus()
    act(() => undo.focus())
    expect(document.activeElement).toBe(undo)
    act(() => undo.blur()) // focus goes nowhere: the list hands it back
    expect(document.activeElement).toBe(outside)
  })
})
