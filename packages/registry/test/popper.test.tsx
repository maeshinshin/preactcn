import { render, screen } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
import { flush, mockLayout, useFakeTimers } from "./helpers"
import * as Popper from "../src/radix/internal/popper"

type ContentProps = Parameters<typeof Popper.Content>[0]

const anchorBox = { left: 100, top: 100, width: 50, height: 20 }

function Example({ arrow = false, ...props }: ContentProps & { arrow?: boolean }) {
  return (
    <Popper.Root>
      <Popper.Anchor data-testid="anchor">anchor</Popper.Anchor>
      <Popper.Content data-testid="content" {...props}>
        content
        {arrow && <Popper.Arrow data-testid="arrow" />}
      </Popper.Content>
    </Popper.Root>
  )
}

const wrapper = () => screen.getByTestId("content").parentElement!

useFakeTimers()

describe("popper", () => {
  test("parks the content off the page and stops animations until it is measured, then places it", async () => {
    mockLayout({ anchor: anchorBox })
    render(<Example sideOffset={4} />)
    expect(wrapper().hasAttribute("data-radix-popper-content-wrapper")).toBe(true)
    expect(wrapper().style.position).toBe("fixed")
    expect(wrapper().style.transform).toBe("translate(0, -200%)")
    expect(wrapper().style.minWidth).toBe("max-content")
    expect(screen.getByTestId("content").style.animation).toBe("none")
    await flush(50)
    // Centered under the anchor: 100 + 50 / 2 - 80 / 2, 100 + 20 + 4
    expect(wrapper().style.transform).toBe("translate(85px, 124px)")
    expect(screen.getByTestId("content").style.animation).toBe("")
    expect(screen.getByTestId("content").getAttribute("data-side")).toBe("bottom")
    expect(screen.getByTestId("content").getAttribute("data-align")).toBe("center")
  })

  test("exposes the available space, the anchor size and the transform origin as CSS variables on the wrapper", async () => {
    mockLayout({ anchor: anchorBox })
    render(<Example sideOffset={4} />)
    await flush(50)
    const style = wrapper().style
    expect(style.getPropertyValue("--radix-popper-available-width")).toBe("1000px")
    expect(style.getPropertyValue("--radix-popper-available-height")).toBe("676px")
    expect(style.getPropertyValue("--radix-popper-anchor-width")).toBe("50px")
    expect(style.getPropertyValue("--radix-popper-anchor-height")).toBe("20px")
    // Without an arrow the origin is the aligned edge of the side facing the anchor
    expect(style.getPropertyValue("--radix-popper-transform-origin")).toBe("50% 0px")
  })

  test.each([
    ["right", "start", 6, "translate(154px, 106px)"],
    ["left", "end", 0, "translate(16px, 80px)"],
    ["top", "start", 0, "translate(100px, 56px)"],
  ] as const)("side %s align %s: offsets along and across the anchor", async (side, align, alignOffset, transform) => {
    mockLayout({ anchor: anchorBox })
    render(<Example side={side} align={align} sideOffset={4} alignOffset={alignOffset} />)
    await flush(50)
    expect(wrapper().style.transform).toBe(transform)
    expect(screen.getByTestId("content").getAttribute("data-side")).toBe(side)
    expect(screen.getByTestId("content").getAttribute("data-align")).toBe(align)
  })

  test("flips to the opposite side when there is no room and reports the placed side", async () => {
    mockLayout({ anchor: { ...anchorBox, top: 760 } })
    render(<Example side="bottom" sideOffset={4} />)
    await flush(50)
    expect(screen.getByTestId("content").getAttribute("data-side")).toBe("top")
    expect(wrapper().style.transform).toBe("translate(85px, 716px)")
  })

  test("shifts along the side to stay inside the viewport", async () => {
    mockLayout({ anchor: { ...anchorBox, left: 0, width: 20 } })
    render(<Example />)
    await flush(50)
    expect(wrapper().style.transform).toBe("translate(0px, 120px)")
  })

  test("copies the content z-index onto the wrapper", async () => {
    mockLayout({ anchor: anchorBox })
    const real = window.getComputedStyle.bind(window)
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
      const style = real(element, pseudo)
      return element.getAttribute("data-testid") === "content" ? new Proxy(style, { get: (target, prop) => (prop === "zIndex" ? "50" : Reflect.get(target, prop)) }) : style
    })
    render(<Example />)
    await flush(50)
    expect(wrapper().style.zIndex).toBe("50")
  })

  test("the arrow is an svg in a measured wrapper, grows the offset and anchors the transform origin", async () => {
    mockLayout({ anchor: anchorBox })
    render(<Example arrow sideOffset={4} />)
    await flush(50)
    const arrow = screen.getByTestId("arrow")
    expect(arrow.tagName).toBe("svg")
    expect(arrow.getAttribute("viewBox")).toBe("0 0 30 10")
    expect(arrow.querySelector("polygon")).not.toBeNull()
    const holder = arrow.parentElement!
    expect(holder.tagName).toBe("SPAN")
    expect(holder.style.position).toBe("absolute")
    // Placed below the anchor, the arrow sits on the top edge pointing up and is centered on the anchor
    expect(holder.style.top).toBe("0px")
    expect(holder.style.left).toBe("35px")
    expect(holder.style.transform).toBe("rotate(180deg)")
    expect(holder.style.visibility).toBe("")
    expect(wrapper().style.transform).toBe("translate(85px, 129px)")
    expect(wrapper().style.getPropertyValue("--radix-popper-transform-origin")).toBe("40px -5px")
  })

  test("the arrow is hidden when it cannot be centered on a small anchor near the edge", async () => {
    mockLayout({ anchor: { left: 0, top: 100, width: 4, height: 20 } })
    render(<Example arrow />)
    await flush(50)
    expect(screen.getByTestId("arrow").parentElement!.style.visibility).toBe("hidden")
  })

  test("the arrow rotates with the placed side", async () => {
    mockLayout({ anchor: anchorBox })
    render(<Example arrow side="top" />)
    await flush(50)
    const holder = screen.getByTestId("arrow").parentElement!
    expect(holder.style.bottom).toBe("0px")
    expect(holder.style.transform).toBe("translateY(100%)")
  })

  test("follows an anchor whose element is replaced", async () => {
    const box = { ...anchorBox }
    mockLayout({ anchor: box })
    const ui = (Tag: "a" | "span") => (
      <Popper.Root>
        <Popper.Anchor asChild>
          <Tag data-testid="anchor">anchor</Tag>
        </Popper.Anchor>
        <Popper.Content data-testid="content" />
      </Popper.Root>
    )
    const { rerender } = render(ui("a"))
    await flush(50)
    expect(wrapper().style.transform).toBe("translate(85px, 120px)")
    box.left = 300
    rerender(ui("span"))
    await flush(50)
    expect(wrapper().style.transform).toBe("translate(285px, 120px)")
  })

  test("Content outside a Popper throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<Popper.Content />)).toThrow(/Popper/)
    spy.mockRestore()
  })
})
