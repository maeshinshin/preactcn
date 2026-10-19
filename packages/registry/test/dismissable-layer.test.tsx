import { useState } from "preact/hooks"
import { fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
import { flush, setupUser, useFakeTimers } from "./helpers"
import { useDismissableLayer } from "../src/radix/internal/dismissable-layer"

type Options = Parameters<typeof useDismissableLayer>[1]

function Layer({ id, ...options }: Options & { id: string }) {
  const [node, setNode] = useState<HTMLElement | null>(null)
  useDismissableLayer(node, options)
  return (
    <div ref={setNode} data-testid={id} tabIndex={-1}>
      <button type="button">{`inside ${id}`}</button>
    </div>
  )
}

useFakeTimers()

describe("useDismissableLayer", () => {
  test("Escape dismisses the layer, passes the event first, and can be prevented", async () => {
    const onDismiss = vi.fn()
    const onEscapeKeyDown = vi.fn((event: KeyboardEvent) => event.defaultPrevented)
    const { rerender } = render(<Layer id="a" onDismiss={onDismiss} onEscapeKeyDown={onEscapeKeyDown} />)
    await flush()
    fireEvent.keyDown(document.body, { key: "Enter" })
    expect(onDismiss).not.toHaveBeenCalled()
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(onEscapeKeyDown).toHaveBeenCalledTimes(1)
    expect(onDismiss).toHaveBeenCalledTimes(1)
    rerender(<Layer id="a" onDismiss={onDismiss} onEscapeKeyDown={(event) => event.preventDefault()} />)
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  test("only the topmost layer handles Escape", async () => {
    const lower = vi.fn()
    const upper = vi.fn()
    render(
      <div>
        <Layer id="lower" onDismiss={lower} />
        <Layer id="upper" onDismiss={upper} />
      </div>
    )
    await flush()
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(upper).toHaveBeenCalledTimes(1)
    expect(lower).not.toHaveBeenCalled()
  })

  test("a pointer down outside dismisses; inside the layer or a layer above does not", async () => {
    const lower = vi.fn()
    const upper = vi.fn()
    render(
      <div>
        <Layer id="lower" onDismiss={lower} />
        <Layer id="upper" onDismiss={upper} />
        <p data-testid="page">page</p>
      </div>
    )
    await flush()
    fireEvent.pointerDown(screen.getByRole("button", { name: "inside lower" }))
    expect(lower).not.toHaveBeenCalled()
    expect(upper).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(screen.getByRole("button", { name: "inside upper" }))
    expect(lower).not.toHaveBeenCalled()
    expect(upper).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(screen.getByTestId("page"))
    expect(lower).toHaveBeenCalledTimes(1)
    expect(upper).toHaveBeenCalledTimes(2)
  })

  test("outside events carry the original event and target, and preventDefault stops the dismissal", async () => {
    const onDismiss = vi.fn()
    const seen: Array<[string, EventTarget | null, Event]> = []
    render(
      <div>
        <Layer
          id="a"
          onDismiss={onDismiss}
          onPointerDownOutside={(event) => {
            seen.push(["pointer", event.target, event.detail.originalEvent])
            event.preventDefault()
          }}
          onInteractOutside={(event) => seen.push(["interact", event.target, event.detail.originalEvent])}
        />
        <p data-testid="page">page</p>
      </div>
    )
    await flush()
    fireEvent.pointerDown(screen.getByTestId("page"))
    expect(onDismiss).not.toHaveBeenCalled()
    expect(seen.map(([kind]) => kind)).toEqual(["pointer", "interact"])
    expect(seen[0]![1]).toBe(screen.getByTestId("page"))
    expect(seen[0]![2].type).toBe("pointerdown")
  })

  test("ignores pointer downs in the tick the layer mounts", async () => {
    const onDismiss = vi.fn()
    render(
      <div>
        <Layer id="a" onDismiss={onDismiss} />
        <p data-testid="page">page</p>
      </div>
    )
    fireEvent.pointerDown(screen.getByTestId("page"))
    expect(onDismiss).not.toHaveBeenCalled()
    await flush()
    fireEvent.pointerDown(screen.getByTestId("page"))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  test("a touch pointer down waits for the click so scrolling does not dismiss", async () => {
    const onDismiss = vi.fn()
    render(
      <div>
        <Layer id="a" onDismiss={onDismiss} />
        <p data-testid="page">page</p>
      </div>
    )
    await flush()
    fireEvent.pointerDown(screen.getByTestId("page"), { pointerType: "touch" })
    expect(onDismiss).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId("page"))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  test("focus moving outside dismisses; focus inside or in a layer above does not", async () => {
    const user = setupUser()
    const lower = vi.fn()
    const onFocusOutside = vi.fn()
    render(
      <div>
        <button type="button">page</button>
        <Layer id="lower" onDismiss={lower} onFocusOutside={onFocusOutside} />
        <Layer id="upper" />
      </div>
    )
    await flush()
    await user.click(screen.getByRole("button", { name: "inside lower" }))
    await user.click(screen.getByRole("button", { name: "inside upper" }))
    expect(lower).not.toHaveBeenCalled()
    screen.getByRole("button", { name: "page" }).focus()
    expect(onFocusOutside).toHaveBeenCalledTimes(1)
    expect(lower).toHaveBeenCalledTimes(1)
  })

  test("stops listening after unmount", async () => {
    const onDismiss = vi.fn()
    const { unmount } = render(<Layer id="a" onDismiss={onDismiss} />)
    await flush()
    unmount()
    fireEvent.keyDown(document.body, { key: "Escape" })
    fireEvent.pointerDown(document.body)
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
