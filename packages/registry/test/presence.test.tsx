import { act, render, screen } from "@testing-library/preact"
import { afterEach, describe, expect, test, vi } from "vitest"
import { Presence } from "../src/radix/internal/presence"

function mockAnimations(names: { open: string; closed: string }) {
  vi.spyOn(window, "getComputedStyle").mockImplementation((node) => {
    return {
      get animationName() {
        const state = (node as HTMLElement).getAttribute("data-state")
        return state === "closed" ? names.closed : names.open
      },
      display: "block",
    } as CSSStyleDeclaration
  })
}

function Panel({ open }: { open: boolean }) {
  return (
    <Presence present={open}>
      <div data-testid="panel" data-state={open ? "open" : "closed"} />
    </Presence>
  )
}

afterEach(() => vi.restoreAllMocks())

describe("Presence", () => {
  test("mounts and unmounts with the present prop when there is no animation", () => {
    mockAnimations({ open: "none", closed: "none" })
    const { rerender } = render(<Panel open={false} />)
    expect(screen.queryByTestId("panel")).toBeNull()
    rerender(<Panel open />)
    expect(screen.getByTestId("panel")).not.toBeNull()
    rerender(<Panel open={false} />)
    expect(screen.queryByTestId("panel")).toBeNull()
  })

  test("keeps the element mounted with data-state closed until the exit animation ends", () => {
    mockAnimations({ open: "fade-in", closed: "fade-out" })
    const { rerender } = render(<Panel open />)
    const panel = screen.getByTestId("panel")
    rerender(<Panel open={false} />)
    expect(screen.getByTestId("panel")).toBe(panel)
    expect(panel.getAttribute("data-state")).toBe("closed")
    act(() => {
      panel.dispatchEvent(Object.assign(new Event("animationend", { bubbles: true }), { animationName: "fade-out" }))
    })
    expect(screen.queryByTestId("panel")).toBeNull()
  })

  test("remounts when present flips back during the exit animation", () => {
    mockAnimations({ open: "fade-in", closed: "fade-out" })
    const { rerender } = render(<Panel open />)
    rerender(<Panel open={false} />)
    rerender(<Panel open />)
    const panel = screen.getByTestId("panel")
    expect(panel.getAttribute("data-state")).toBe("open")
    act(() => {
      panel.dispatchEvent(Object.assign(new Event("animationend", { bubbles: true }), { animationName: "fade-out" }))
    })
    expect(screen.getByTestId("panel")).not.toBeNull()
  })

  test("a function child is always rendered and receives the presence state", () => {
    mockAnimations({ open: "none", closed: "none" })
    const { rerender } = render(
      <Presence present={false}>{({ present }) => <div data-testid="panel" data-present={String(present)} />}</Presence>
    )
    expect(screen.getByTestId("panel").getAttribute("data-present")).toBe("false")
    rerender(<Presence present>{({ present }) => <div data-testid="panel" data-present={String(present)} />}</Presence>)
    expect(screen.getByTestId("panel").getAttribute("data-present")).toBe("true")
  })
})
