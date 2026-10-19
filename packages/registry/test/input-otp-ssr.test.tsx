// @vitest-environment node
import { renderToString } from "preact-render-to-string"
import { useContext } from "preact/hooks"
import { describe, expect, test } from "vitest"
import { OTPInput, OTPInputContext, REGEXP_ONLY_DIGITS } from "../src/shims/input-otp"

function Slot({ index }: { index: number }) {
  const { char, hasFakeCaret, isActive } = useContext(OTPInputContext).slots[index] ?? {}
  return (
    <div data-active={isActive}>
      {char}
      {hasFakeCaret && <i />}
    </div>
  )
}

// No window or document here: any DOM access while rendering would throw
describe("server rendering", () => {
  const html = (props: Record<string, unknown> = {}) =>
    renderToString(
      <OTPInput maxLength={3} {...props}>
        <Slot index={0} />
        <Slot index={1} />
        <Slot index={2} />
      </OTPInput>
    )

  test("renders the input with its value and the slots with their characters", () => {
    const out = html({ defaultValue: "12", pattern: REGEXP_ONLY_DIGITS, id: "otp" })
    expect(out).toContain('autocomplete="one-time-code"')
    expect(out).toContain('inputmode="numeric"')
    expect(out).toContain('value="12"')
    expect(out).toContain('id="otp"')
    expect(out).toContain("data-input-otp")
    expect(out).toContain("data-input-otp-container")
    expect(out).toContain('translate="no"')
    expect(out).toContain("<div data-active=\"false\">1</div><div data-active=\"false\">2</div><div data-active=\"false\"></div>")
    expect(out).not.toContain("input-otp-style")
  })

  test("a controlled value wins over defaultValue and is not written twice", () => {
    const out = html({ value: "9", defaultValue: "1" })
    expect(out.match(/value="/g)).toHaveLength(1)
    expect(out).toContain('value="9"')
  })

  test("the no-JavaScript fallback is in the markup, and null leaves it out", () => {
    expect(html()).toMatch(/<noscript><style>[^<]*\[data-input-otp\][^<]*<\/style><\/noscript>/)
    expect(html({ noScriptCSSFallback: "x{}" })).toContain("<noscript><style>x{}</style></noscript>")
    expect(html({ noScriptCSSFallback: null })).not.toContain("noscript")
  })

  test("the render prop works", () => {
    const out = renderToString(<OTPInput maxLength={2} defaultValue="7" render={({ slots }) => <b>{slots.map((slot) => slot.char ?? "_").join("")}</b>} />)
    expect(out).toContain("<b>7_</b>")
  })
})
