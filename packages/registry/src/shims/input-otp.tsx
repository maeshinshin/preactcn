// Derived from input-otp 1.5.0, Copyright (c) 2024 Guilherme Rodz, MIT License (https://opensource.org/license/mit)
import {
  createContext,
  type ComponentChildren,
  type ComponentProps,
  type CSSProperties,
  type Ref,
  type TargetedClipboardEvent,
  type TargetedFocusEvent,
  type TargetedInputEvent,
  type TargetedMouseEvent,
} from "preact"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks"
import { useComposedRefs } from "../radix/internal/compose-refs"
import { forwardRef } from "../radix/internal/forward-ref"

// input-otp 1.5.0 on Preact: the same hidden-ish <input> that mirrors its text and selection into slot state.
// shortcut: only the exports upstream's ui/input-otp.tsx imports; add REGEXP_ONLY_CHARS ("^[a-zA-Z]+$") when an app needs it.
export const REGEXP_ONLY_DIGITS = "^\\d+$"
export const REGEXP_ONLY_DIGITS_AND_CHARS = "^[a-zA-Z0-9]+$"

type SlotProps = {
  isActive: boolean
  char: string | null
  placeholderChar: string | null
  hasFakeCaret: boolean
}
type RenderProps = {
  slots: SlotProps[]
  isFocused: boolean
  isHovering: boolean
}

// Handlers are methods so a wrapper may pass one that takes a narrower argument, like React's types allow
type Own = {
  ref?: Ref<HTMLInputElement>
  value?: string
  defaultValue?: string
  onChange?(newValue: string): unknown
  maxLength: number
  pattern?: string
  placeholder?: string
  inputMode?: string
  disabled?: boolean
  textAlign?: "left" | "center" | "right"
  onComplete?(...args: any[]): unknown
  pushPasswordManagerStrategy?: "increase-width" | "none"
  pasteTransformer?(pasted: string): string
  containerClassName?: string
  noScriptCSSFallback?: string | null
  nonce?: string
}
type OTPInputProps = Omit<ComponentProps<"input">, keyof Own | "children"> &
  Own &
  (
    | { render(props: RenderProps): ComponentChildren; children?: never }
    | { render?: never; children: ComponentChildren }
  )

export const OTPInputContext = createContext<RenderProps>({} as RenderProps)

// Preact types `translate` as the boolean property, the server render needs the attribute
const translateNo = { translate: "no" } as {}

type Selection = [number | null, number | null, "forward" | "backward" | "none" | null | undefined]

export const OTPInput = forwardRef<OTPInputProps>(
  (
    {
      value: valueProp,
      defaultValue,
      onChange: onChangeProp,
      maxLength,
      textAlign = "left",
      pattern,
      placeholder,
      inputMode = "numeric",
      onComplete,
      pushPasswordManagerStrategy = "increase-width",
      pasteTransformer,
      containerClassName,
      noScriptCSSFallback = NOSCRIPT_CSS_FALLBACK,
      nonce,
      render,
      children,
      ...props
    },
    ref
  ) => {
    const [internalValue, setInternalValue] = useState(typeof defaultValue === "string" ? defaultValue : "")
    const value = valueProp ?? internalValue
    const previousValue = usePrevious(value)
    const valueRef = useRef(value)
    valueRef.current = value
    const onChange = (newValue: string) => {
      onChangeProp?.(newValue)
      setInternalValue(newValue)
    }
    const regexp = pattern ? new RegExp(pattern) : null

    const inputRef = useRef<HTMLInputElement | null>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const initialLoad = useRef({
      value,
      onChange,
      isIOS: typeof window !== "undefined" && !!window.CSS?.supports?.("-webkit-touch-callout", "none"),
    })
    const previousSelection = useRef<Selection>([null, null, undefined])
    // Set while the component sends its own `input` event, which the user's handlers must not see
    const sendingInput = useRef(false)
    const composedRef = useComposedRefs(inputRef, ref)

    const [isHovering, setIsHovering] = useState(false)
    const [isFocused, setIsFocused] = useState(false)
    const [mirrorSelectionStart, setMirrorSelectionStart] = useState<number | null>(null)
    const [mirrorSelectionEnd, setMirrorSelectionEnd] = useState<number | null>(null)

    // A layout effect: Preact runs passive effects a frame later, and the listener must exist before the first interaction
    useLayoutEffect(() => {
      const input = inputRef.current
      const container = containerRef.current
      if (!input || !container) return

      // Preact writes `translate` through the boolean property, so the string "no" arrives as translate="yes"
      container.setAttribute("translate", "no")

      // The input may have been filled (autofill, form restoration) before this ran
      if (initialLoad.current.value !== input.value) initialLoad.current.onChange(input.value)

      previousSelection.current = [input.selectionStart, input.selectionEnd, input.selectionDirection]
      function onDocumentSelectionChange() {
        if (document.activeElement !== input) {
          setMirrorSelectionStart(null)
          setMirrorSelectionEnd(null)
          return
        }

        const _s = input!.selectionStart
        const _e = input!.selectionEnd
        const _dir = input!.selectionDirection
        const _ml = input!.maxLength
        const _val = input!.value
        const _prev = previousSelection.current

        // Turn a caret into a one character selection, so the active slot is always a visible one
        let start = -1
        let end = -1
        let direction: "forward" | "backward" | "none" | undefined = undefined
        if (_val.length !== 0 && _s !== null && _e !== null) {
          const isSingleCaret = _s === _e
          const isInsertMode = _s === _val.length && _val.length < _ml

          if (isSingleCaret && !isInsertMode) {
            const c = _s
            if (c === 0) {
              start = 0
              end = 1
              direction = "forward"
            } else if (c === _ml) {
              start = c - 1
              end = c
              direction = "backward"
            } else if (_ml > 1 && _val.length > 1) {
              let offset = 0
              if (_prev[0] !== null && _prev[1] !== null) {
                direction = c < _prev[1] ? "backward" : "forward"
                const wasPreviouslyInserting = _prev[0] === _prev[1] && _prev[0] < _ml
                if (direction === "backward" && !wasPreviouslyInserting) offset = -1
              }
              start = offset + c
              end = offset + c + 1
            }
          }

          if (start !== -1 && end !== -1 && start !== end) input!.setSelectionRange(start, end, direction)
        }

        const s = start !== -1 ? start : _s
        const e = end !== -1 ? end : _e
        const dir = direction ?? _dir
        setMirrorSelectionStart(s)
        setMirrorSelectionEnd(e)
        previousSelection.current = [s, e, dir]
      }
      document.addEventListener("selectionchange", onDocumentSelectionChange, { capture: true })

      onDocumentSelectionChange()
      document.activeElement === input && setIsFocused(true)

      // One style tag per document, so only the first mounted input's nonce is used
      if (!document.getElementById("input-otp-style")) {
        const styleEl = document.createElement("style")
        styleEl.id = "input-otp-style"
        if (nonce) styleEl.setAttribute("nonce", nonce)
        document.head.appendChild(styleEl)

        if (styleEl.sheet) {
          const autofillStyles =
            "background: transparent !important; color: transparent !important; border-color: transparent !important; opacity: 0 !important; box-shadow: none !important; -webkit-box-shadow: none !important; -webkit-text-fill-color: transparent !important;"
          safeInsertRule(styleEl.sheet, "[data-input-otp]::selection { background: transparent !important; color: transparent !important; }")
          safeInsertRule(styleEl.sheet, `[data-input-otp]:autofill { ${autofillStyles} }`)
          safeInsertRule(styleEl.sheet, `[data-input-otp]:-webkit-autofill { ${autofillStyles} }`)
          // iOS
          safeInsertRule(
            styleEl.sheet,
            "@supports (-webkit-touch-callout: none) { [data-input-otp] { letter-spacing: -.6em !important; font-weight: 100 !important; font-stretch: ultra-condensed; font-optical-sizing: none !important; left: -1px !important; right: 1px !important; } }"
          )
          // Password manager badges
          safeInsertRule(styleEl.sheet, "[data-input-otp] + * { pointer-events: all !important; }")
        }
      }

      const updateRootHeight = () => container.style.setProperty("--root-height", `${input.clientHeight}px`)
      updateRootHeight()
      const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateRootHeight)
      resizeObserver?.observe(input)

      return () => {
        document.removeEventListener("selectionchange", onDocumentSelectionChange, { capture: true })
        resizeObserver?.disconnect()
      }
    }, [])

    // Re-read the selection a few times after a change: browsers settle it later than the input event
    useEffect(() => {
      const timeouts = [0, 10, 50].map((delay) =>
        setTimeout(() => {
          const input = inputRef.current
          if (!input) return
          // Forcefully remove :autofill state
          sendingInput.current = true
          input.dispatchEvent(new Event("input"))
          sendingInput.current = false

          const s = input.selectionStart
          const e = input.selectionEnd
          if (s !== null && e !== null) {
            setMirrorSelectionStart(s)
            setMirrorSelectionEnd(e)
            previousSelection.current = [s, e, input.selectionDirection]
          }
        }, delay)
      )
      return () => timeouts.forEach(clearTimeout)
    }, [value, isFocused])

    useEffect(() => {
      if (previousValue === undefined) return
      if (value !== previousValue && previousValue.length < maxLength && value.length === maxLength) onComplete?.(value)
    }, [maxLength, onComplete, previousValue, value])

    const pwmb = usePasswordManagerBadge({ containerRef, inputRef, pushPasswordManagerStrategy, isFocused })

    // React puts a controlled input back when the parent did not take the change; Preact only rewrites it on a render.
    // Queued after the change, so the render it causes runs first and the value compared with is the new one.
    const keepControlled = (input: HTMLInputElement) =>
      queueMicrotask(() => {
        if (input.value !== valueRef.current) input.value = valueRef.current
      })

    const changeListener = (e: TargetedInputEvent<HTMLInputElement>) => {
      if (sendingInput.current) return
      props.onInput?.(e)
      const input = e.currentTarget
      const newValue = input.value.slice(0, maxLength)
      if (!(newValue.length > 0 && regexp && !regexp.test(newValue))) {
        const maybeHasDeleted = typeof previousValue === "string" && newValue.length < previousValue.length
        // Cutting or deleting text does not fire selectionchange in every browser
        if (maybeHasDeleted) document.dispatchEvent(new Event("selectionchange"))
        onChange(newValue)
      }
      keepControlled(input)
    }
    const focusListener = (e: TargetedFocusEvent<HTMLInputElement>) => {
      const input = e.currentTarget
      const start = Math.min(input.value.length, maxLength - 1)
      const end = input.value.length
      input.setSelectionRange(start, end)
      setMirrorSelectionStart(start)
      setMirrorSelectionEnd(end)
      setIsFocused(true)
      props.onFocus?.(e)
    }
    // iOS needs to take over pasting, and so does a pasteTransformer
    const pasteListener = (e: TargetedClipboardEvent<HTMLInputElement>) => {
      const input = inputRef.current
      if (!input || !e.clipboardData || (!pasteTransformer && !initialLoad.current.isIOS)) return

      const pasted = e.clipboardData.getData("text/plain")
      const content = pasteTransformer ? pasteTransformer(pasted) : pasted
      e.preventDefault()

      const start = input.selectionStart ?? value.length
      const end = input.selectionEnd ?? value.length
      const newValue = (value.slice(0, start) + content + value.slice(end)).slice(0, maxLength)
      if (newValue.length > 0 && regexp && !regexp.test(newValue)) return

      input.value = newValue
      onChange(newValue)
      keepControlled(input)

      const s = Math.min(newValue.length, maxLength - 1)
      const en = newValue.length
      input.setSelectionRange(s, en)
      setMirrorSelectionStart(s)
      setMirrorSelectionEnd(en)
    }

    const rootStyle: CSSProperties = {
      position: "relative",
      cursor: props.disabled ? "default" : "text",
      userSelect: "none",
      WebkitUserSelect: "none",
      pointerEvents: "none",
    }
    const inputStyle: CSSProperties = {
      position: "absolute",
      inset: "0",
      width: pwmb.willPushPWMBadge ? `calc(100% + ${pwmb.PWM_BADGE_SPACE_WIDTH})` : "100%",
      clipPath: pwmb.willPushPWMBadge ? `inset(0 ${pwmb.PWM_BADGE_SPACE_WIDTH} 0 0)` : undefined,
      height: "100%",
      display: "flex",
      textAlign,
      opacity: "1", // Mandatory for iOS hold-paste
      color: "transparent",
      pointerEvents: "all",
      background: "transparent",
      caretColor: "transparent",
      border: "0 solid transparent",
      outline: "0 solid transparent",
      boxShadow: "none",
      lineHeight: "1",
      letterSpacing: "-.5em",
      fontSize: "var(--root-height, 16px)",
      fontFamily: "monospace",
      fontVariantNumeric: "tabular-nums",
    }

    const contextValue: RenderProps = {
      slots: Array.from({ length: maxLength }).map((_, slotIdx) => {
        const isActive =
          isFocused &&
          mirrorSelectionStart !== null &&
          mirrorSelectionEnd !== null &&
          ((mirrorSelectionStart === mirrorSelectionEnd && slotIdx === mirrorSelectionStart) ||
            (slotIdx >= mirrorSelectionStart && slotIdx < mirrorSelectionEnd))

        const char = value[slotIdx] !== undefined ? value[slotIdx]! : null
        const placeholderChar = value[0] !== undefined ? null : (placeholder?.[slotIdx] ?? null)

        return { char, placeholderChar, isActive, hasFakeCaret: isActive && char === null }
      }),
      isFocused,
      isHovering: !props.disabled && isHovering,
    }

    return (
      <>
        {noScriptCSSFallback !== null && (
          // Only the server renders the style: a style element built on the client would apply, React never builds noscript children
          <noscript>{typeof document === "undefined" && <style>{noScriptCSSFallback}</style>}</noscript>
        )}

        <div ref={containerRef} data-input-otp-container {...translateNo} style={rootStyle} class={containerClassName}>
          {render ? render(contextValue) : <OTPInputContext.Provider value={contextValue}>{children}</OTPInputContext.Provider>}

          <div style={{ position: "absolute", inset: "0", pointerEvents: "none" }}>
            <input
              autocomplete={props.autocomplete || props.autoComplete || "one-time-code"}
              {...(props as ComponentProps<"input">) /* Preact 11 types <input> as a union a rest spread cannot satisfy */}
              data-input-otp
              data-input-otp-placeholder-shown={value.length === 0 || undefined}
              data-input-otp-mss={mirrorSelectionStart}
              data-input-otp-mse={mirrorSelectionEnd}
              inputMode={inputMode}
              pattern={regexp?.source}
              aria-placeholder={placeholder}
              style={inputStyle}
              maxLength={maxLength}
              value={value}
              ref={composedRef}
              spellcheck={props.spellcheck ?? false}
              onPaste={(e: TargetedClipboardEvent<HTMLInputElement>) => {
                pasteListener(e)
                props.onPaste?.(e)
              }}
              onInput={changeListener}
              onMouseOver={(e: TargetedMouseEvent<HTMLInputElement>) => {
                setIsHovering(true)
                props.onMouseOver?.(e)
              }}
              onMouseLeave={(e: TargetedMouseEvent<HTMLInputElement>) => {
                setIsHovering(false)
                props.onMouseLeave?.(e)
              }}
              onFocus={focusListener}
              onBlur={(e: TargetedFocusEvent<HTMLInputElement>) => {
                setIsFocused(false)
                props.onBlur?.(e)
              }}
            />
          </div>
        </div>
      </>
    )
  }
)

function usePrevious<T>(value: T) {
  const ref = useRef<T | undefined>(undefined)
  useEffect(() => {
    ref.current = value
  })
  return ref.current
}

function safeInsertRule(sheet: CSSStyleSheet, rule: string) {
  try {
    sheet.insertRule(rule)
  } catch {
    // A cosmetic rule an old WebView rejects (`:autofill`) must not read as an app error
    console.warn("input-otp could not insert CSS rule:", rule)
  }
}

// A <noscript> and not a media query: it is only a fallback for the first load without JavaScript
const NOSCRIPT_CSS_FALLBACK = `
[data-input-otp] {
  --nojs-bg: white !important;
  --nojs-fg: black !important;

  background-color: var(--nojs-bg) !important;
  color: var(--nojs-fg) !important;
  caret-color: var(--nojs-fg) !important;
  letter-spacing: .25em !important;
  text-align: center !important;
  border: 1px solid var(--nojs-fg) !important;
  border-radius: 4px !important;
  width: 100% !important;
}
@media (prefers-color-scheme: dark) {
  [data-input-otp] {
    --nojs-bg: black !important;
    --nojs-fg: white !important;
  }
}`

// Password managers draw a badge at the right edge of a field: grow the input past the container so the badge covers
// the overhang and not the last slot.
const PWM_BADGE_MARGIN_RIGHT = 18
const PWM_BADGE_SPACE_WIDTH_PX = 40
const PWM_BADGE_SPACE_WIDTH = `${PWM_BADGE_SPACE_WIDTH_PX}px`
const PASSWORD_MANAGERS_SELECTORS = [
  "[data-lastpass-icon-root]", // LastPass
  "com-1password-button", // 1Password
  "[data-dashlanecreated]", // Dashlane
  '[style$="2147483647 !important;"]', // Bitwarden
].join(",")

// Free space, in px, between the container's right edge and the nearest box that clips or scrolls horizontal overflow (the viewport at most)
function availableBadgeSpace(container: HTMLElement) {
  const containerRight = container.getBoundingClientRect().right
  let el: HTMLElement | null = container
  while (el) {
    if (getComputedStyle(el).overflowX !== "visible") {
      const rect = el.getBoundingClientRect()
      return rect.left + el.clientLeft + el.clientWidth - containerRight
    }
    el = el.parentElement
  }
  // clientWidth, unlike window.innerWidth, leaves out a vertical scrollbar
  return document.documentElement.clientWidth - containerRight
}

function usePasswordManagerBadge({
  containerRef,
  inputRef,
  pushPasswordManagerStrategy,
  isFocused,
}: {
  containerRef: { current: HTMLDivElement | null }
  inputRef: { current: HTMLInputElement | null }
  pushPasswordManagerStrategy: "increase-width" | "none"
  isFocused: boolean
}) {
  const [hasPWMBadge, setHasPWMBadge] = useState(false)
  const [hasPWMBadgeSpace, setHasPWMBadgeSpace] = useState(false)
  const [done, setDone] = useState(false)

  const willPushPWMBadge = pushPasswordManagerStrategy !== "none" && hasPWMBadge && hasPWMBadgeSpace

  const trackPWMBadge = useCallback(() => {
    const container = containerRef.current
    const input = inputRef.current
    if (!container || !input || done || pushPasswordManagerStrategy === "none") return

    // Where most password managers place their badge: the right end of the container, vertically centered
    const rect = container.getBoundingClientRect()
    const x = rect.left + container.offsetWidth - PWM_BADGE_MARGIN_RIGHT
    const y = rect.top + container.offsetHeight / 2

    // A known manager's element is proof; otherwise anything but the container at that point is taken for a badge
    if (document.querySelectorAll(PASSWORD_MANAGERS_SELECTORS).length === 0 && document.elementFromPoint(x, y) === container) return

    // Measure again: the layout may have changed since the last interval tick
    setHasPWMBadgeSpace(availableBadgeSpace(container) >= PWM_BADGE_SPACE_WIDTH_PX)
    setHasPWMBadge(true)
    setDone(true)
  }, [containerRef, inputRef, done, pushPasswordManagerStrategy])

  useEffect(() => {
    const container = containerRef.current
    if (!container || pushPasswordManagerStrategy === "none") return

    const checkHasSpace = () => setHasPWMBadgeSpace(availableBadgeSpace(container) >= PWM_BADGE_SPACE_WIDTH_PX)
    checkHasSpace()
    const interval = setInterval(checkHasSpace, 1000)
    return () => clearInterval(interval)
  }, [containerRef, pushPasswordManagerStrategy])

  useEffect(() => {
    const _isFocused = isFocused || document.activeElement === inputRef.current
    if (pushPasswordManagerStrategy === "none" || !_isFocused) return

    const timeouts = [setTimeout(trackPWMBadge, 0), setTimeout(trackPWMBadge, 2000), setTimeout(trackPWMBadge, 5000), setTimeout(() => setDone(true), 6000)]
    return () => timeouts.forEach(clearTimeout)
  }, [inputRef, isFocused, pushPasswordManagerStrategy, trackPWMBadge])

  return { willPushPWMBadge, PWM_BADGE_SPACE_WIDTH }
}
