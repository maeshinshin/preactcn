import { render } from "preact"
import { afterEach, describe, expect, it } from "vitest"
import { createElement } from "../runtime"
import { Fragment, jsx, jsxs } from "../runtime/jsx-runtime"

const root = document.createElement("div")
afterEach(() => render(null, root))

describe("jsx runtime", () => {
  it("writes React-style props on host elements the way the browser needs them", () => {
    render(jsx("svg", { children: jsx("text", { textAnchor: "middle", strokeWidth: 2, tabIndex: 0, style: { width: 10, opacity: 0.5 } }) }), root)
    const text = root.querySelector("text")!
    expect(text.getAttribute("text-anchor")).toBe("middle")
    expect(text.getAttribute("stroke-width")).toBe("2")
    expect(text.getAttribute("tabindex")).toBe("0")
    expect(text.getAttribute("style")).toMatch(/width:\s*10px/)
    expect(text.getAttribute("style")).toMatch(/opacity:\s*0\.5/)
  })

  it("fires a focus handler for focus moving to a child, as React's onFocus does", () => {
    let focused = 0
    render(jsx("div", { onFocus: () => focused++, children: jsx("button", {}) }), root)
    document.body.append(root)
    root.querySelector("button")!.focus()
    root.remove()
    expect(focused).toBe(1)
  })

  it("leaves component props alone", () => {
    let seen: Record<string, unknown> = {}
    const Probe = (props: Record<string, unknown>) => ((seen = props), null)
    render(jsx(Probe, { tabIndex: 0, onFocus: 1, strokeWidth: 2, style: { width: 10 } }), root)
    expect(seen).toEqual({ tabIndex: 0, onFocus: 1, strokeWidth: 2, style: { width: 10 } })
  })

  it("offers createElement for the elements the jsx transform cannot express with jsx()", () => {
    render(createElement("svg", null, createElement("text", { textAnchor: "end", key: "k" })), root)
    expect(root.querySelector("text")!.getAttribute("text-anchor")).toBe("end")
  })

  it("renders fragments, static children and keys", () => {
    render(jsxs(Fragment, { children: [jsx("i", {}, "a"), jsx("b", {}, "b")] }), root)
    expect(root.innerHTML).toBe("<i></i><b></b>")
  })
})
