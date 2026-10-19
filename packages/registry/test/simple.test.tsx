import { render, screen } from "@testing-library/preact"
import { describe, expect, test } from "vitest"
import * as Direction from "../src/radix/direction"
import * as Label from "../src/radix/label"
import * as Separator from "../src/radix/separator"
import * as AspectRatio from "../src/radix/aspect-ratio"
import * as Progress from "../src/radix/progress"

describe("direction", () => {
  function Probe({ local }: { local?: "ltr" | "rtl" }) {
    return <span data-testid="dir">{Direction.useDirection(local)}</span>
  }

  test("defaults to ltr, follows the provider, local value wins", () => {
    const { unmount } = render(<Probe />)
    expect(screen.getByTestId("dir").textContent).toBe("ltr")
    unmount()
    render(
      <Direction.DirectionProvider dir="rtl">
        <Probe />
        <Probe local="ltr" />
      </Direction.DirectionProvider>
    )
    expect(screen.getAllByTestId("dir").map((n) => n.textContent)).toEqual(["rtl", "ltr"])
  })
})

describe("label", () => {
  test("renders a label element associated with its control", () => {
    render(
      <div>
        <Label.Root htmlFor="name">Name</Label.Root>
        <input id="name" />
      </div>
    )
    const label = screen.getByText("Name")
    expect(label.tagName).toBe("LABEL")
    expect(label.getAttribute("for")).toBe("name")
    expect(screen.getByLabelText("Name")).toBe(screen.getByRole("textbox"))
  })

  test("asChild", () => {
    render(
      <Label.Root asChild>
        <span>x</span>
      </Label.Root>
    )
    expect(screen.getByText("x").tagName).toBe("SPAN")
  })
})

describe("separator", () => {
  test("is a separator by default (not decorative) with orientation", () => {
    render(<Separator.Root />)
    const el = screen.getByRole("separator")
    expect(el.getAttribute("data-orientation")).toBe("horizontal")
    expect(el.getAttribute("aria-orientation")).toBeNull()
  })

  test("vertical exposes aria-orientation", () => {
    render(<Separator.Root orientation="vertical" />)
    const el = screen.getByRole("separator")
    expect(el.getAttribute("data-orientation")).toBe("vertical")
    expect(el.getAttribute("aria-orientation")).toBe("vertical")
  })

  test("decorative uses role none", () => {
    const { container } = render(<Separator.Root decorative orientation="vertical" />)
    const el = container.firstElementChild!
    expect(el.getAttribute("role")).toBe("none")
    expect(el.getAttribute("aria-orientation")).toBeNull()
    expect(el.getAttribute("data-orientation")).toBe("vertical")
  })

  test("invalid orientation falls back to horizontal", () => {
    // @ts-expect-error invalid on purpose
    render(<Separator.Root orientation="diagonal" />)
    expect(screen.getByRole("separator").getAttribute("data-orientation")).toBe("horizontal")
  })
})

describe("aspect-ratio", () => {
  test("wraps the content with a padding-bottom box", () => {
    const { container } = render(
      <AspectRatio.Root ratio={2} class="x">
        <img alt="" />
      </AspectRatio.Root>
    )
    const wrapper = container.firstElementChild as HTMLElement
    expect(wrapper.hasAttribute("data-radix-aspect-ratio-wrapper")).toBe(true)
    expect(wrapper.style.position).toBe("relative")
    expect(wrapper.style.paddingBottom).toBe("50%")
    const inner = wrapper.firstElementChild as HTMLElement
    expect(inner.className).toBe("x")
    expect(inner.style.position).toBe("absolute")
    expect(inner.querySelector("img")).not.toBeNull()
  })

  test("ratio defaults to 1", () => {
    const { container } = render(<AspectRatio.Root />)
    expect((container.firstElementChild as HTMLElement).style.paddingBottom).toBe("100%")
  })
})

describe("progress", () => {
  test("exposes progressbar semantics", () => {
    render(
      <Progress.Root value={30}>
        <Progress.Indicator data-testid="ind" />
      </Progress.Root>
    )
    const bar = screen.getByRole("progressbar")
    expect(bar.getAttribute("aria-valuemin")).toBe("0")
    expect(bar.getAttribute("aria-valuemax")).toBe("100")
    expect(bar.getAttribute("aria-valuenow")).toBe("30")
    expect(bar.getAttribute("aria-valuetext")).toBe("30%")
    expect(bar.getAttribute("data-state")).toBe("loading")
    expect(bar.getAttribute("data-value")).toBe("30")
    expect(bar.getAttribute("data-max")).toBe("100")
    const ind = screen.getByTestId("ind")
    expect(ind.getAttribute("data-state")).toBe("loading")
    expect(ind.getAttribute("data-value")).toBe("30")
    expect(ind.getAttribute("data-max")).toBe("100")
  })

  test("complete and indeterminate states", () => {
    const { rerender } = render(<Progress.Root value={100} />)
    expect(screen.getByRole("progressbar").getAttribute("data-state")).toBe("complete")
    rerender(<Progress.Root />)
    const bar = screen.getByRole("progressbar")
    expect(bar.getAttribute("data-state")).toBe("indeterminate")
    expect(bar.getAttribute("aria-valuenow")).toBeNull()
    expect(bar.getAttribute("aria-valuetext")).toBeNull()
  })

  test("out of range values are indeterminate", () => {
    render(<Progress.Root value={500} />)
    expect(screen.getByRole("progressbar").getAttribute("data-state")).toBe("indeterminate")
  })
})
