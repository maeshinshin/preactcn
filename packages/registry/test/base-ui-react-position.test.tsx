import { useRef } from "preact/hooks"
import { fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, test } from "vitest"
import { flush, mockLayout, setupUser, useFakeTimers } from "./helpers"
import { Combobox } from "../src/shims/base-ui-react"

useFakeTimers()

const items = ["Next.js", "SvelteKit", "Nuxt.js", "Remix", "Astro"]

type PositionerProps = Parameters<typeof Combobox.Positioner>[0]

// mockLayout sizes what carries data-radix-popper-content-wrapper like a floating element, so the positioner borrows the attribute
function Tree({ positioner, anchorId = "anchor" }: { positioner?: Partial<PositionerProps>; anchorId?: string }) {
  return (
    <Combobox.Root items={items}>
      <Combobox.Input data-testid="anchor" />
      <Combobox.Trigger aria-label="Toggle" />
      <Combobox.Portal>
        <Combobox.Positioner data-testid="positioner" data-radix-popper-content-wrapper="" sideOffset={6} align="start" {...positioner}>
          <Combobox.Popup data-testid="popup">
            <Combobox.List>
              {(item: string) => (
                <Combobox.Item key={item} value={item}>
                  {item}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}

const positioner = () => screen.getByTestId("positioner")
const input = () => screen.getByTestId("anchor")
const vars = () => Object.fromEntries(["--anchor-width", "--anchor-height", "--available-width", "--available-height", "--transform-origin"].map((name) => [name, positioner().style.getPropertyValue(name)]))

describe("positioning", () => {
  test("is parked and invisible until it is measured, then placed below the input", async () => {
    mockLayout({ anchor: { left: 100, top: 100, width: 200, height: 32 } })
    const user = setupUser()
    render(<Tree />)
    await user.click(input())
    await flush(50)
    const element = positioner()
    expect(element.style.position).toBe("absolute")
    expect(element.style.opacity).toBe("")
    expect(element.style.transform).toBe("translate(100px, 138px)")
    expect(element.getAttribute("data-side")).toBe("bottom")
    expect(element.getAttribute("data-align")).toBe("start")
    expect(screen.getByTestId("popup").getAttribute("data-side")).toBe("bottom")
    expect(vars()).toEqual({
      "--anchor-width": "200px",
      "--anchor-height": "32px",
      "--available-width": expect.stringMatching(/px$/),
      "--available-height": expect.stringMatching(/px$/),
      "--transform-origin": "0% -6px",
    })
    expect(input().getAttribute("data-popup-side")).toBe("bottom")
  })

  test("the animations of the popup wait for the first measurement", async () => {
    mockLayout({ anchor: { left: 100, top: 100, width: 200, height: 32 } })
    render(<Tree />)
    fireEvent.mouseDown(input())
    // the position is computed asynchronously: right after opening the popup is still parked
    const element = positioner()
    expect(element.style.opacity).toBe("0")
    expect(element.style.position).toBe("fixed")
    expect(element.style.getPropertyValue("--available-height")).toBe("100vh")
    expect(screen.getByTestId("popup").style.animation).toBe("none")
    await flush(50)
    expect(positioner().style.opacity).toBe("")
    expect(screen.getByTestId("popup").style.animation).toBe("")
  })

  test("flips to the top when there is no room below, and grows from the anchor's edge", async () => {
    mockLayout({ anchor: { left: 100, top: 760, width: 200, height: 32 }, floating: { width: 80, height: 100 } })
    const user = setupUser()
    render(<Tree />)
    await user.click(input())
    await flush(50)
    expect(positioner().getAttribute("data-side")).toBe("top")
    expect(positioner().style.transform).toBe("translate(100px, 654px)")
    expect(vars()["--transform-origin"]).toBe("0% calc(100% + 6px)")
    expect(input().getAttribute("data-popup-side")).toBe("top")
  })

  test("alignOffset moves the popup along the input", async () => {
    mockLayout({ anchor: { left: 100, top: 100, width: 200, height: 32 } })
    const user = setupUser()
    render(<Tree positioner={{ alignOffset: -28 }} />)
    await user.click(input())
    await flush(50)
    expect(positioner().style.transform).toBe("translate(72px, 138px)")
  })

  test("a centered popup grows from the middle of the anchor", async () => {
    mockLayout({ anchor: { left: 100, top: 100, width: 200, height: 32 } })
    const user = setupUser()
    render(<Tree positioner={{ align: "center" }} />)
    await user.click(input())
    await flush(50)
    expect(positioner().getAttribute("data-align")).toBe("center")
    expect(positioner().style.transform).toBe("translate(160px, 138px)")
    // 100 + 100 (the middle of the anchor) - 160 (where the popup starts)
    expect(vars()["--transform-origin"]).toBe("40px -6px")
  })

  test("a side given in logical terms is reported as it was asked for", async () => {
    mockLayout({ anchor: { left: 100, top: 100, width: 200, height: 32 } })
    const user = setupUser()
    render(<Tree positioner={{ side: "inline-end", align: "start" }} />)
    await user.click(input())
    await flush(50)
    expect(positioner().getAttribute("data-side")).toBe("inline-end")
    expect(positioner().style.transform).toBe("translate(306px, 100px)")
  })

  test("an anchor passed as a ref places the popup against that element", async () => {
    mockLayout({ anchor: { left: 10, top: 20, width: 300, height: 40 }, anchorId: "chips" })
    function Anchored() {
      const ref = useRef<HTMLDivElement | null>(null)
      return (
        <Combobox.Root items={items}>
          <div ref={ref} data-testid="chips">
            <Combobox.Input data-testid="anchor" />
          </div>
          <Combobox.Portal>
            <Combobox.Positioner data-testid="positioner" data-radix-popper-content-wrapper="" anchor={ref} sideOffset={4} align="start">
              <Combobox.Popup>
                <Combobox.List>
                  {(item: string) => (
                    <Combobox.Item key={item} value={item}>
                      {item}
                    </Combobox.Item>
                  )}
                </Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </Combobox.Root>
      )
    }
    const user = setupUser()
    render(<Anchored />)
    await user.click(input())
    await flush(50)
    expect(positioner().style.transform).toBe("translate(10px, 64px)")
    expect(vars()["--anchor-width"]).toBe("300px")
  })

  test("once flipped the popup keeps its side while the list shrinks", async () => {
    mockLayout({ anchor: { left: 100, top: 760, width: 200, height: 32 }, floating: { width: 80, height: 100 } })
    const user = setupUser()
    render(<Tree />)
    await user.click(input())
    await flush(50)
    expect(positioner().getAttribute("data-side")).toBe("top")
    // a short list would fit below, but it stays on the side it was flipped to
    await user.keyboard("zzz")
    await flush(50)
    expect(positioner().getAttribute("data-side")).toBe("top")
  })
})
