import { describe, expect, it } from "vitest"
import { fixProps } from "../runtime/fix-props"

describe("fixProps", () => {
  it("returns the same object when there is nothing to fix", () => {
    const props = { id: "a", className: "b", fill: "red", style: { color: "red" } }
    expect(fixProps(props)).toBe(props)
  })

  it("does not touch the input", () => {
    const props = { tabIndex: 0, style: { width: 10 } }
    fixProps(props)
    expect(props).toEqual({ tabIndex: 0, style: { width: 10 } })
  })

  it("writes numeric style values in px, keeping zero, unitless properties and custom properties", () => {
    const { style } = fixProps({ style: { width: 10, margin: 0, opacity: 0.5, zIndex: 3, flexGrow: 1, lineHeight: 1.5, "--gap": 4, color: "red" } })
    expect(style).toEqual({ width: "10px", margin: 0, opacity: 0.5, zIndex: 3, flexGrow: 1, lineHeight: 1.5, "--gap": 4, color: "red" })
  })

  it("lower-cases tabIndex", () => {
    expect(fixProps({ tabIndex: 0 })).toEqual({ tabindex: 0 })
  })

  it("maps the bubbling React focus handlers to focusin and focusout", () => {
    const onFocus = () => {}
    const onBlur = () => {}
    expect(fixProps({ onFocus, onBlur })).toEqual({ onfocusin: onFocus, onfocusout: onBlur })
  })

  it.each([
    ["strokeWidth", "stroke-width"],
    ["strokeDasharray", "stroke-dasharray"],
    ["fillOpacity", "fill-opacity"],
    ["textAnchor", "text-anchor"],
    ["dominantBaseline", "dominant-baseline"],
    ["fontSize", "font-size"],
    ["clipPath", "clip-path"],
    ["markerEnd", "marker-end"],
    ["pointerEvents", "pointer-events"],
    ["shapeRendering", "shape-rendering"],
    ["xHeight", "x-height"],
  ])("writes %s as %s", (camel, kebab) => {
    expect(fixProps({ [camel]: "v" })).toEqual({ [kebab]: "v" })
  })

  it.each(["viewBox", "preserveAspectRatio", "clipPathUnits", "markerWidth", "markerHeight", "markerUnits", "textLength", "xChannelSelector", "glyphRef", "className", "dangerouslySetInnerHTML", "onClick"])(
    "keeps %s",
    (name) => {
      const props = { [name]: "v" }
      expect(fixProps(props)).toBe(props)
    }
  )
})
