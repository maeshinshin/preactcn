import { useState } from "preact/hooks"
import { fireEvent, render, screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, test, vi } from "vitest"
import * as Slider from "../src/radix/slider"

type RootProps = Parameters<typeof Slider.Root>[0]

function Basic(props: Partial<RootProps>) {
  const count = (props.value ?? props.defaultValue ?? [0]).length
  return (
    <Slider.Root data-testid="root" {...props}>
      <Slider.Track data-testid="track">
        <Slider.Range data-testid="range" />
      </Slider.Track>
      {Array.from({ length: count }, (_, i) => (
        <Slider.Thumb key={i} />
      ))}
    </Slider.Root>
  )
}

afterEach(() => vi.restoreAllMocks())

describe("slider semantics", () => {
  test("root, track, range and thumb attributes", () => {
    render(<Basic defaultValue={[25]} />)
    const root = screen.getByTestId("root")
    expect(root.tagName).toBe("SPAN")
    expect(root.getAttribute("data-orientation")).toBe("horizontal")
    expect(root.getAttribute("dir")).toBe("ltr")
    expect(root.getAttribute("aria-disabled")).toBe("false")
    expect(screen.getByTestId("track").getAttribute("data-orientation")).toBe("horizontal")
    const thumb = screen.getByRole("slider")
    expect(thumb.hasAttribute("data-radix-collection-item")).toBe(true)
    expect(thumb.getAttribute("aria-valuemin")).toBe("0")
    expect(thumb.getAttribute("aria-valuemax")).toBe("100")
    expect(thumb.getAttribute("aria-valuenow")).toBe("25")
    expect(thumb.getAttribute("aria-orientation")).toBe("horizontal")
    expect(thumb.getAttribute("data-orientation")).toBe("horizontal")
    expect(thumb.tabIndex).toBe(0)
  })

  test("range spans from 0 for one thumb and between thumbs for several", () => {
    const { unmount } = render(<Basic defaultValue={[25]} />)
    expect(screen.getByTestId("range").style.left).toBe("0%")
    expect(screen.getByTestId("range").style.right).toBe("75%")
    unmount()
    render(<Basic defaultValue={[20, 60]} />)
    expect(screen.getByTestId("range").style.left).toBe("20%")
    expect(screen.getByTestId("range").style.right).toBe("40%")
  })

  test("thumbs are positioned by percentage and labelled", () => {
    render(<Basic defaultValue={[20, 60]} />)
    const [min, max] = screen.getAllByRole("slider")
    expect(min!.getAttribute("aria-label")).toBe("Minimum")
    expect(max!.getAttribute("aria-label")).toBe("Maximum")
    expect(min!.parentElement!.style.left).toBe("calc(20% + 0px)")
    expect(max!.parentElement!.style.left).toBe("calc(60% + 0px)")
    expect(min!.parentElement!.style.position).toBe("absolute")
  })

  test("three or more thumbs get numbered labels; aria-label can be overridden", () => {
    render(
      <Slider.Root defaultValue={[10, 20, 70]}>
        <Slider.Thumb />
        <Slider.Thumb aria-label="mine" />
        <Slider.Thumb />
      </Slider.Root>
    )
    expect(screen.getAllByRole("slider").map((t) => t.getAttribute("aria-label"))).toEqual(["Value 1 of 3", "mine", "Value 3 of 3"])
  })

  test("vertical orientation", () => {
    render(<Basic orientation="vertical" defaultValue={[30]} />)
    expect(screen.getByTestId("root").getAttribute("data-orientation")).toBe("vertical")
    expect(screen.getByTestId("root").hasAttribute("dir")).toBe(false)
    expect(screen.getByRole("slider").getAttribute("aria-orientation")).toBe("vertical")
    expect(screen.getByTestId("range").style.bottom).toBe("0%")
    expect(screen.getByTestId("range").style.top).toBe("70%")
    expect(screen.getByRole("slider").parentElement!.style.bottom).toBe("calc(30% + 0px)")
  })

  test("min and max rescale the percentages", () => {
    render(<Basic defaultValue={[5]} min={0} max={10} />)
    expect(screen.getByTestId("range").style.right).toBe("50%")
  })

  test("a thumb without a value is hidden", () => {
    render(
      <Slider.Root defaultValue={[1]}>
        <Slider.Thumb />
        <Slider.Thumb />
      </Slider.Root>
    )
    const [, extra] = screen.getAllByRole("slider", { hidden: true })
    expect(extra!.style.display).toBe("none")
  })
})

describe("slider keyboard", () => {
  test("arrow keys step by `step`, Shift and Page keys by ten steps, Home and End jump", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Basic defaultValue={[50]} step={2} onValueChange={onValueChange} />)
    const thumb = screen.getByRole("slider")
    thumb.focus()
    await user.keyboard("{ArrowRight}")
    expect(thumb.getAttribute("aria-valuenow")).toBe("52")
    await user.keyboard("{ArrowUp}")
    expect(thumb.getAttribute("aria-valuenow")).toBe("54")
    await user.keyboard("{ArrowLeft}{ArrowDown}")
    expect(thumb.getAttribute("aria-valuenow")).toBe("50")
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}")
    expect(thumb.getAttribute("aria-valuenow")).toBe("70")
    await user.keyboard("{PageDown}")
    expect(thumb.getAttribute("aria-valuenow")).toBe("50")
    await user.keyboard("{PageUp}")
    expect(thumb.getAttribute("aria-valuenow")).toBe("70")
    await user.keyboard("{Home}")
    expect(thumb.getAttribute("aria-valuenow")).toBe("0")
    await user.keyboard("{End}")
    expect(thumb.getAttribute("aria-valuenow")).toBe("100")
    expect(onValueChange).toHaveBeenLastCalledWith([100])
  })

  test("values are clamped and unchanged values are not reported", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Basic defaultValue={[100]} onValueChange={onValueChange} />)
    screen.getByRole("slider").focus()
    await user.keyboard("{ArrowRight}")
    expect(onValueChange).not.toHaveBeenCalled()
  })

  test("decimal steps do not accumulate floating point error", async () => {
    const user = userEvent.setup()
    render(<Basic defaultValue={[0]} min={0} max={1} step={0.1} />)
    screen.getByRole("slider").focus()
    await user.keyboard("{ArrowRight}{ArrowRight}{ArrowRight}")
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("0.3")
  })

  test("with several thumbs the focused one changes, and values stay sorted", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Basic defaultValue={[10, 12]} onValueChange={onValueChange} />)
    const [first, second] = screen.getAllByRole("slider")
    second!.focus()
    await user.keyboard("{ArrowLeft}")
    expect(onValueChange).toHaveBeenLastCalledWith([10, 11])
    await user.keyboard("{ArrowLeft}{ArrowLeft}")
    expect(onValueChange).toHaveBeenLastCalledWith([9, 10])
    expect(document.activeElement).toBe(first)
  })

  test("rtl flips the horizontal arrows", async () => {
    const user = userEvent.setup()
    render(<Basic defaultValue={[50]} dir="rtl" />)
    screen.getByRole("slider").focus()
    await user.keyboard("{ArrowLeft}")
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("51")
    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("50")
  })

  test("controlled", async () => {
    const user = userEvent.setup()
    function Parent() {
      const [value, setValue] = useState([10])
      return <Basic value={value} onValueChange={setValue} />
    }
    render(<Parent />)
    screen.getByRole("slider").focus()
    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("11")
  })

  test("disabled: not focusable, ignores keys and pointers", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Basic defaultValue={[50]} disabled onValueChange={onValueChange} />)
    const thumb = screen.getByRole("slider")
    expect(screen.getByTestId("root").getAttribute("data-disabled")).toBe("")
    expect(screen.getByTestId("root").getAttribute("aria-disabled")).toBe("true")
    expect(thumb.getAttribute("data-disabled")).toBe("")
    expect(thumb.hasAttribute("tabindex")).toBe(false)
    thumb.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    await user.click(screen.getByTestId("track"))
    expect(onValueChange).not.toHaveBeenCalled()
  })
})

describe("slider pointer", () => {
  function mockRect() {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 200, height: 200 } as DOMRect)
    vi.spyOn(HTMLElement.prototype, "hasPointerCapture").mockReturnValue(true)
    vi.spyOn(HTMLElement.prototype, "setPointerCapture").mockImplementation(() => {})
  }

  test("pressing the track moves the closest thumb there and focuses it", () => {
    mockRect()
    const onValueChange = vi.fn()
    render(<Basic defaultValue={[10, 90]} onValueChange={onValueChange} />)
    fireEvent.pointerDown(screen.getByTestId("track"), { clientX: 100, pointerId: 1 })
    expect(onValueChange).toHaveBeenLastCalledWith([50, 90])
    expect(document.activeElement).toBe(screen.getAllByRole("slider")[0])
  })

  test("dragging follows the pointer and snaps to the step", () => {
    mockRect()
    render(<Basic defaultValue={[0]} step={10} />)
    const track = screen.getByTestId("track")
    fireEvent.pointerDown(track, { clientX: 0, pointerId: 1 })
    fireEvent.pointerMove(track, { clientX: 66, pointerId: 1 })
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("30")
    fireEvent.pointerMove(track, { clientX: 400, pointerId: 1 })
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("100")
  })

  test("pointer moves without capture are ignored", () => {
    mockRect()
    vi.spyOn(HTMLElement.prototype, "hasPointerCapture").mockReturnValue(false)
    render(<Basic defaultValue={[0]} />)
    fireEvent.pointerMove(screen.getByTestId("track"), { clientX: 100, pointerId: 1 })
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("0")
  })

  test("vertical sliders measure from the bottom", () => {
    mockRect()
    render(<Basic orientation="vertical" defaultValue={[0]} />)
    fireEvent.pointerDown(screen.getByTestId("track"), { clientY: 50, pointerId: 1 })
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("75")
  })

  test("rtl measures from the right", () => {
    mockRect()
    render(<Basic dir="rtl" defaultValue={[0]} />)
    fireEvent.pointerDown(screen.getByTestId("track"), { clientX: 50, pointerId: 1 })
    expect(screen.getByRole("slider").getAttribute("aria-valuenow")).toBe("75")
  })
})
