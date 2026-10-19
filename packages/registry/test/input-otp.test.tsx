import { act, render, screen } from "@testing-library/preact"
import { createRef, hydrate, type ComponentProps } from "preact"
import { useContext, useState } from "preact/hooks"
import { renderToString } from "preact-render-to-string"
import { afterEach, describe, expect, test, vi } from "vitest"
import { OTPInput, OTPInputContext, REGEXP_ONLY_DIGITS, REGEXP_ONLY_DIGITS_AND_CHARS } from "../src/shims/input-otp"
import { defineBrowserProperty, flush, setupUser, useFakeTimers } from "./helpers"

useFakeTimers()

// The slot of upstream's ui/input-otp.tsx
function Slot({ index }: { index: number }) {
  const { char, hasFakeCaret, isActive } = useContext(OTPInputContext).slots[index] ?? {}
  return (
    <div data-testid={`slot-${index}`} data-active={isActive}>
      {char}
      {hasFakeCaret && <i data-testid={`caret-${index}`} />}
    </div>
  )
}

type Props = Omit<ComponentProps<typeof OTPInput>, "children" | "render" | "maxLength"> & { maxLength?: number }

function Otp({ maxLength = 6, ...props }: Props) {
  return (
    <OTPInput maxLength={maxLength} aria-label="code" {...props}>
      {Array.from({ length: maxLength }, (_, index) => (
        <Slot index={index} key={index} />
      ))}
    </OTPInput>
  )
}

const input = () => screen.getByLabelText("code") as HTMLInputElement
const slot = (index: number) => screen.getByTestId(`slot-${index}`)
const chars = (count = 6) => Array.from({ length: count }, (_, index) => slot(index).textContent)
const active = (count = 6) => Array.from({ length: count }, (_, index) => slot(index).dataset.active === "true")
const values = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.map((call) => call[0])

// A browser reports a caret move through selectionchange, happy-dom does not
const select = (start: number, end = start) => {
  input().setSelectionRange(start, end)
  act(() => void document.dispatchEvent(new Event("selectionchange")))
}

afterEach(() => document.getElementById("input-otp-style")?.remove())

describe("markup", () => {
  test("one real input that password managers, mobile keyboards and the browser can use", () => {
    const restore = defineBrowserProperty("spellcheck", ["true", "false"])
    render(<Otp />)
    restore()
    const el = input()
    expect(el.tagName).toBe("INPUT")
    expect(el.getAttribute("autocomplete")).toBe("one-time-code")
    expect(el.getAttribute("inputmode")).toBe("numeric")
    expect(el.getAttribute("spellcheck")).toBe("false")
    expect(el.getAttribute("maxlength")).toBe("6")
    expect(el.hasAttribute("data-input-otp")).toBe(true)
    expect(el.hasAttribute("data-input-otp-placeholder-shown")).toBe(true)
    expect(el.parentElement!.parentElement!.hasAttribute("data-input-otp-container")).toBe(true)
  })

  test("props reach the input and the container class goes to the container", () => {
    render(<Otp id="otp" name="code" required placeholder="------" autocomplete="off" inputMode="text" class="own" containerClassName="box" data-slot="x" />)
    const el = input()
    expect(el.id).toBe("otp")
    expect(el.name).toBe("code")
    expect(el.required).toBe(true)
    expect(el.getAttribute("aria-placeholder")).toBe("------")
    expect(el.getAttribute("placeholder")).toBeNull()
    expect(el.getAttribute("autocomplete")).toBe("off")
    expect(el.getAttribute("inputmode")).toBe("text")
    expect(el.classList.contains("own")).toBe(true)
    expect(el.dataset.slot).toBe("x")
    const container = el.closest("[data-input-otp-container]")!
    expect(container.classList.contains("box")).toBe(true)
    expect(container.contains(screen.getByTestId("slot-0"))).toBe(true)
  })

  test("the container opts out of translation even where translate is a boolean property", () => {
    // Browsers coerce `el.translate = "no"` to true, which writes translate="yes"
    const restore = defineBrowserProperty("translate", ["yes", "no"])
    try {
      render(<Otp />)
      expect(input().closest("[data-input-otp-container]")!.getAttribute("translate")).toBe("no")
    } finally {
      restore()
    }
  })

  test("the input is a transparent overlay that takes the pointer, the container does not", () => {
    render(<Otp />)
    expect(input().style.position).toBe("absolute")
    expect(input().style.color).toBe("transparent")
    expect(input().style.pointerEvents).toBe("all")
    expect(input().closest<HTMLElement>("[data-input-otp-container]")!.style.pointerEvents).toBe("none")
  })

  test("styles for selection and autofill are added once per document", () => {
    render(
      <>
        <Otp />
        <Otp />
      </>
    )
    expect(document.querySelectorAll("#input-otp-style").length).toBe(1)
  })

  test("noscript fallback is empty on the client like React, and left out with null", () => {
    const { unmount } = render(<Otp />)
    const fallback = input().closest("[data-input-otp-container]")!.parentElement!.querySelector("noscript")
    expect(fallback).not.toBeNull()
    expect(fallback!.childNodes.length).toBe(0)
    unmount()
    render(<Otp noScriptCSSFallback={null} />)
    expect(document.querySelector("noscript")).toBeNull()
  })

  test("a ref reaches the input", () => {
    const ref = createRef<HTMLInputElement>()
    render(<Otp ref={ref} />)
    expect(ref.current).toBe(input())
  })

  test("a ref callback receives the input", () => {
    const ref = vi.fn()
    render(<Otp ref={ref} />)
    expect(ref).toHaveBeenCalledWith(input())
  })
})

describe("typing", () => {
  test("fills the slots in order and reports every value", async () => {
    const user = setupUser()
    const onChange = vi.fn()
    render(<Otp onChange={onChange} />)
    await user.type(input(), "123")
    expect(values(onChange)).toEqual(["1", "12", "123"])
    expect(input().value).toBe("123")
    expect(chars()).toEqual(["1", "2", "3", "", "", ""])
    expect(input().hasAttribute("data-input-otp-placeholder-shown")).toBe(false)
  })

  test("never rewrites the value of an input whose edit it accepts, which would throw the caret to the end", async () => {
    render(<Otp defaultValue="1234" />)
    const writes: string[] = []
    const real = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!
    Object.defineProperty(HTMLInputElement.prototype, "value", {
      ...real,
      set(value) {
        writes.push(value)
        real.set!.call(this, value)
      },
    })
    try {
      input().value = "1934"
      writes.length = 0
      // Not in act(): Preact renders in a microtask, and so does the restore
      input().dispatchEvent(new Event("input", { bubbles: true }))
      for (let tick = 0; tick < 5; tick++) await Promise.resolve()
    } finally {
      Object.defineProperty(HTMLInputElement.prototype, "value", real)
    }
    expect(writes).toEqual([])
    expect(chars()).toEqual(["1", "9", "3", "4", "", ""])
  })

  test("starts from defaultValue", () => {
    render(<Otp defaultValue="12" />)
    expect(input().value).toBe("12")
    expect(chars()).toEqual(["1", "2", "", "", "", ""])
  })

  test("never takes more than maxLength", async () => {
    const user = setupUser()
    const onChange = vi.fn()
    render(<Otp maxLength={4} onChange={onChange} />)
    await user.type(input(), "123456")
    expect(input().value).toBe("1234")
    expect(values(onChange)).toEqual(["1", "12", "123", "1234"])
  })

  test("cuts a longer value the browser let through", async () => {
    const onChange = vi.fn()
    render(<Otp maxLength={4} onChange={onChange} />)
    act(() => {
      input().value = "123456"
      input().dispatchEvent(new Event("input", { bubbles: true }))
    })
    expect(values(onChange)).toEqual(["1234"])
    expect(input().value).toBe("1234")
  })

  test("backspace removes the last character and asks the slots to re-read the caret", async () => {
    const user = setupUser()
    const onChange = vi.fn()
    render(<Otp defaultValue="123" onChange={onChange} />)
    const selectionchange = vi.fn()
    document.addEventListener("selectionchange", selectionchange)
    await user.click(input())
    await user.keyboard("{Backspace}")
    document.removeEventListener("selectionchange", selectionchange)
    expect(values(onChange)).toEqual(["12"])
    expect(chars()).toEqual(["1", "2", "", "", "", ""])
    expect(selectionchange).toHaveBeenCalled()
  })

  test("does nothing while disabled", async () => {
    const user = setupUser()
    const onChange = vi.fn()
    render(<Otp disabled value="123456" onChange={onChange} />)
    await user.type(input(), "7")
    expect(input().disabled).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
    expect(chars()).toEqual(["1", "2", "3", "4", "5", "6"])
    expect(input().closest<HTMLElement>("[data-input-otp-container]")!.style.cursor).toBe("default")
  })
})

describe("pattern", () => {
  test("a character that breaks the pattern is dropped", async () => {
    const user = setupUser()
    const onChange = vi.fn()
    render(<Otp pattern={REGEXP_ONLY_DIGITS} onChange={onChange} />)
    await user.type(input(), "1a2")
    await flush()
    expect(values(onChange)).toEqual(["1", "12"])
    expect(input().value).toBe("12")
    expect(chars()).toEqual(["1", "2", "", "", "", ""])
    expect(input().getAttribute("pattern")).toBe(REGEXP_ONLY_DIGITS)
  })

  test("letters and digits", async () => {
    const user = setupUser()
    render(<Otp pattern={REGEXP_ONLY_DIGITS_AND_CHARS} />)
    await user.type(input(), "a1-B")
    expect(input().value).toBe("a1B")
  })
})

describe("paste", () => {
  test("fills the slots at once", async () => {
    const user = setupUser()
    const onChange = vi.fn()
    render(<Otp onChange={onChange} />)
    await user.click(input())
    await user.paste("123456")
    expect(values(onChange)).toEqual(["123456"])
    expect(chars()).toEqual(["1", "2", "3", "4", "5", "6"])
  })

  test("a paste that breaks the pattern is dropped", async () => {
    const user = setupUser()
    const onChange = vi.fn()
    render(<Otp pattern={REGEXP_ONLY_DIGITS} onChange={onChange} />)
    await user.click(input())
    await user.paste("12ab")
    await flush()
    expect(onChange).not.toHaveBeenCalled()
    expect(input().value).toBe("")
  })

  test("pasteTransformer rewrites the pasted text", async () => {
    const user = setupUser()
    const onChange = vi.fn()
    render(<Otp pasteTransformer={(pasted) => pasted.replaceAll("-", "")} onChange={onChange} />)
    await user.click(input())
    await user.paste("123-456")
    expect(values(onChange)).toEqual(["123456"])
    expect(input().value).toBe("123456")
  })

  test("pasteTransformer replaces the selected text", async () => {
    const user = setupUser()
    const onChange = vi.fn()
    render(<Otp defaultValue="1234" pasteTransformer={(pasted) => pasted.trim()} onChange={onChange} />)
    await user.click(input())
    select(1, 3)
    await user.paste(" 99 ")
    expect(values(onChange)).toEqual(["1994"])
  })
})

describe("onComplete", () => {
  test("fires once when the last slot fills", async () => {
    const user = setupUser()
    const onComplete = vi.fn()
    render(<Otp maxLength={4} onComplete={onComplete} />)
    await user.type(input(), "123")
    expect(onComplete).not.toHaveBeenCalled()
    await user.type(input(), "4")
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith("1234")
    await flush()
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  test("fires for a paste and again after a delete and retype", async () => {
    const user = setupUser()
    const onComplete = vi.fn()
    render(<Otp maxLength={4} onComplete={onComplete} />)
    await user.click(input())
    await user.paste("1234")
    expect(onComplete).toHaveBeenCalledTimes(1)
    await user.keyboard("{Backspace}5")
    expect(onComplete).toHaveBeenCalledTimes(2)
    expect(onComplete).toHaveBeenLastCalledWith("1235")
  })

  test("does not fire for a value that was full from the start", () => {
    const onComplete = vi.fn()
    render(<Otp maxLength={4} defaultValue="1234" onComplete={onComplete} />)
    expect(onComplete).not.toHaveBeenCalled()
  })
})

describe("controlled", () => {
  test("shows the value it is given and follows changes from outside", () => {
    const { rerender } = render(<Otp value="12" />)
    expect(chars()).toEqual(["1", "2", "", "", "", ""])
    rerender(<Otp value="123456" />)
    expect(chars()).toEqual(["1", "2", "3", "4", "5", "6"])
    expect(input().value).toBe("123456")
  })

  test("a parent that state-manages the value gets every change", async () => {
    const user = setupUser()
    const seen: string[] = []
    function Parent() {
      const [value, setValue] = useState("")
      seen.push(value)
      return <Otp value={value} onChange={setValue} />
    }
    render(<Parent />)
    await user.type(input(), "12")
    expect(input().value).toBe("12")
    expect(chars()).toEqual(["1", "2", "", "", "", ""])
    expect(seen.at(-1)).toBe("12")
  })

  test("a parent may rewrite what was typed", async () => {
    const user = setupUser()
    function Parent() {
      const [value, setValue] = useState("")
      return <Otp value={value} onChange={(next) => setValue(next.toUpperCase())} pattern={REGEXP_ONLY_DIGITS_AND_CHARS} />
    }
    render(<Parent />)
    await user.type(input(), "ab")
    expect(input().value).toBe("AB")
    expect(chars()).toEqual(["A", "B", "", "", "", ""])
  })

  test("a parent that refuses the change keeps the input as it was, like a React controlled input", async () => {
    const user = setupUser()
    const onChange = vi.fn()
    render(<Otp value="12" onChange={onChange} />)
    // The second try ends in the same internal state, so nothing re-renders to put the old value back
    await user.type(input(), "3")
    await user.type(input(), "3")
    await flush()
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenCalledWith("123")
    expect(input().value).toBe("12")
    expect(chars()).toEqual(["1", "2", "", "", "", ""])
  })

  test("onChange is not repeated for the input events the component sends itself", async () => {
    const user = setupUser()
    const onChange = vi.fn()
    render(<Otp onChange={onChange} />)
    await user.type(input(), "12")
    await flush(100)
    expect(values(onChange)).toEqual(["1", "12"])
  })
})

describe("slots", () => {
  test("the slot that takes the next character is active and shows the fake caret", async () => {
    const user = setupUser()
    render(<Otp />)
    expect(active()).toEqual([false, false, false, false, false, false])
    await user.click(input())
    expect(active()).toEqual([true, false, false, false, false, false])
    expect(screen.queryByTestId("caret-0")).not.toBeNull()
    expect([input().dataset.inputOtpMss, input().dataset.inputOtpMse]).toEqual(["0", "0"])
    await user.keyboard("1")
    await flush(60)
    expect(active()).toEqual([false, true, false, false, false, false])
    expect(screen.queryByTestId("caret-0")).toBeNull()
    expect(screen.queryByTestId("caret-1")).not.toBeNull()
  })

  test("a full code selects the last slot and draws no caret", async () => {
    const user = setupUser()
    render(<Otp maxLength={4} />)
    await user.type(input(), "1234")
    select(4)
    expect([input().selectionStart, input().selectionEnd]).toEqual([3, 4])
    expect(active(4)).toEqual([false, false, false, true])
    expect(screen.queryByTestId("caret-3")).toBeNull()
  })

  test("a caret inside the code selects the character after it", async () => {
    const user = setupUser()
    render(<Otp defaultValue="1234" />)
    await user.click(input())
    select(1)
    expect([input().selectionStart, input().selectionEnd]).toEqual([1, 2])
    expect(active()).toEqual([false, true, false, false, false, false])
    select(0)
    expect(active()).toEqual([true, false, false, false, false, false])
  })

  test("a selected range activates every slot in it", async () => {
    const user = setupUser()
    render(<Otp defaultValue="1234" />)
    await user.click(input())
    select(1, 3)
    expect(active()).toEqual([false, true, true, false, false, false])
  })

  test("blur clears the active slot and focus is reported to the user's handlers", async () => {
    const user = setupUser()
    const onFocus = vi.fn()
    const onBlur = vi.fn()
    render(<Otp onFocus={onFocus} onBlur={onBlur} />)
    await user.click(input())
    expect(onFocus).toHaveBeenCalledTimes(1)
    expect(active()[0]).toBe(true)
    await user.tab()
    expect(onBlur).toHaveBeenCalledTimes(1)
    expect(active()).toEqual([false, false, false, false, false, false])
  })

  test("a focused input is active from the start", () => {
    function AutoFocus() {
      return <Otp ref={(el: HTMLInputElement | null) => el?.focus()} />
    }
    render(<AutoFocus />)
    expect(active()[0]).toBe(true)
  })

  test("placeholder characters show in empty slots until the first character", () => {
    function PlaceholderSlot({ index }: { index: number }) {
      const { char, placeholderChar } = useContext(OTPInputContext).slots[index] ?? {}
      return <b data-testid={`p-${index}`}>{char ?? placeholderChar}</b>
    }
    const { rerender } = render(
      <OTPInput maxLength={3} placeholder="abc" aria-label="code">
        <PlaceholderSlot index={0} />
        <PlaceholderSlot index={1} />
        <PlaceholderSlot index={2} />
      </OTPInput>
    )
    expect([0, 1, 2].map((index) => screen.getByTestId(`p-${index}`).textContent)).toEqual(["a", "b", "c"])
    rerender(
      <OTPInput maxLength={3} placeholder="abc" aria-label="code" value="9">
        <PlaceholderSlot index={0} />
        <PlaceholderSlot index={1} />
        <PlaceholderSlot index={2} />
      </OTPInput>
    )
    expect([0, 1, 2].map((index) => screen.getByTestId(`p-${index}`).textContent)).toEqual(["9", "", ""])
  })

  test("hover is reported and ignored while disabled", async () => {
    const user = setupUser()
    const seen: boolean[] = []
    const Spy = () => {
      seen.push(useContext(OTPInputContext).isHovering)
      return null
    }
    const { rerender } = render(
      <OTPInput maxLength={3} aria-label="code" onMouseOver={vi.fn()}>
        <Spy />
      </OTPInput>
    )
    await user.hover(input())
    expect(seen.at(-1)).toBe(true)
    await user.unhover(input())
    expect(seen.at(-1)).toBe(false)
    rerender(
      <OTPInput maxLength={3} aria-label="code" disabled>
        <Spy />
      </OTPInput>
    )
    seen.length = 0
    act(() => void input().dispatchEvent(new MouseEvent("mouseover", { bubbles: true })))
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((hovering) => !hovering)).toBe(true)
  })

  test("the render prop gets the same slots and flags as the context", async () => {
    const user = setupUser()
    const onMouseOver = vi.fn()
    render(
      <OTPInput
        maxLength={3}
        aria-label="code"
        onMouseOver={onMouseOver}
        render={({ slots, isFocused, isHovering }) => (
          <div data-testid="out">
            {slots.map((s) => `${s.char ?? "_"}${s.isActive ? "*" : ""}`).join("")}|{String(isFocused)}|{String(isHovering)}
          </div>
        )}
      />
    )
    expect(screen.getByTestId("out").textContent).toBe("___|false|false")
    await user.click(input())
    expect(screen.getByTestId("out").textContent).toBe("_*__|true|true")
    await user.keyboard("7")
    await flush(60)
    expect(screen.getByTestId("out").textContent).toBe("7_*_|true|true")
    expect(onMouseOver).toHaveBeenCalled()
  })
})

describe("user handlers", () => {
  test("onPaste runs alongside the component's own", async () => {
    const user = setupUser()
    const onPaste = vi.fn()
    render(<Otp onPaste={onPaste} />)
    await user.click(input())
    await user.paste("12")
    expect(onPaste).toHaveBeenCalledTimes(1)
    expect(input().value).toBe("12")
  })

  test("onInput runs on every edit", async () => {
    const user = setupUser()
    const onInput = vi.fn()
    render(<Otp onInput={onInput} />)
    await user.type(input(), "12")
    expect(onInput).toHaveBeenCalledTimes(2)
  })
})

describe("lifecycle", () => {
  test("the document listener goes away with the component", () => {
    const remove = vi.spyOn(document, "removeEventListener")
    const { unmount } = render(<Otp />)
    unmount()
    expect(remove.mock.calls.some(([type]) => type === "selectionchange")).toBe(true)
  })
})

describe("hydration", () => {
  const hydrateOtp = (before: (el: HTMLInputElement) => void, props: Props = {}) => {
    const container = document.createElement("div")
    document.body.append(container)
    container.innerHTML = renderToString(<Otp {...props} />)
    before(container.querySelector("input")!)
    act(() => hydrate(<Otp {...props} />, container))
    return container
  }

  test("adopts the server markup", () => {
    const container = hydrateOtp(() => {})
    expect(container.querySelectorAll("input").length).toBe(1)
    expect(chars()).toEqual(["", "", "", "", "", ""])
    container.remove()
  })

  test("reports what the browser or the user put into the input before hydration", () => {
    const onChange = vi.fn()
    const container = hydrateOtp((el) => void (el.value = "42"), { onChange })
    expect(values(onChange)).toEqual(["42"])
    expect(input().value).toBe("42")
    expect(chars()).toEqual(["4", "2", "", "", "", ""])
    container.remove()
  })

  test("an input that was focused before hydration (autofocus) starts with an active slot", () => {
    const container = hydrateOtp((el) => el.focus())
    expect(active()[0]).toBe(true)
    container.remove()
  })
})

describe("password manager badge", () => {
  const layout = () => {
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1000)
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ overflowX: "visible" } as CSSStyleDeclaration)
  }
  const badge = () => {
    const el = document.createElement("div")
    el.setAttribute("data-lastpass-icon-root", "")
    document.body.append(el)
    return el
  }

  test("a badge next to the field makes the input wider, so the badge covers the overhang and not a slot", async () => {
    layout()
    const el = badge()
    const user = setupUser()
    render(<Otp />)
    expect(input().style.width).toBe("100%")
    await user.click(input())
    await flush()
    expect(input().style.width).toBe("calc(100% + 40px)")
    expect(input().style.clipPath).toBe("inset(0 40px 0 0)")
    el.remove()
  })

  test("no room for the gutter, no push", async () => {
    layout()
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(0)
    const el = badge()
    const user = setupUser()
    render(<Otp />)
    await user.click(input())
    await flush()
    expect(input().style.width).toBe("100%")
    el.remove()
  })

  test("pushPasswordManagerStrategy none never pushes", async () => {
    layout()
    const el = badge()
    const user = setupUser()
    render(<Otp pushPasswordManagerStrategy="none" />)
    await user.click(input())
    await flush()
    expect(input().style.width).toBe("100%")
    el.remove()
  })
})
