import { type Ref } from "preact"
import { useState } from "preact/hooks"
import { act, fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
import { composeRefs } from "../src/radix/internal/compose-refs"
import { composeEventHandlers } from "../src/radix/internal/compose-event-handlers"
import { forwardRef } from "../src/radix/internal/forward-ref"
import { useControllableState } from "../src/radix/internal/use-controllable-state"

describe("composeRefs", () => {
  test("assigns the node to callback and object refs", () => {
    const calls: unknown[] = []
    const object: { current: unknown } = { current: null }
    const ref = composeRefs<HTMLElement>((node) => {
        calls.push(node)
      }, object as Ref<HTMLElement>, undefined)
    const node = document.createElement("div")
    ref(node)
    expect(calls).toEqual([node])
    expect(object.current).toBe(node)
  })
})

describe("composeEventHandlers", () => {
  test("runs the original first and skips ours when default was prevented", () => {
    const order: string[] = []
    const handler = composeEventHandlers(
      (event: Event) => {
        order.push("original")
        event.preventDefault()
      },
      () => order.push("ours")
    )
    handler(new Event("click", { cancelable: true }))
    expect(order).toEqual(["original"])
  })

  test("runs ours when default was not prevented, or when the check is disabled", () => {
    const ours = vi.fn()
    composeEventHandlers(undefined, ours)(new Event("click"))
    expect(ours).toHaveBeenCalledTimes(1)
    composeEventHandlers((e: Event) => e.preventDefault(), ours, { checkForDefaultPrevented: false })(
      new Event("click", { cancelable: true })
    )
    expect(ours).toHaveBeenCalledTimes(2)
  })
})

describe("forwardRef", () => {
  const Box = forwardRef<{ ref?: Ref<HTMLDivElement> }>((_props, ref) => <div ref={ref} data-testid="box" />)

  test("delivers the DOM node to object and callback refs", () => {
    const object: { current: HTMLDivElement | null } = { current: null }
    const fn = vi.fn()
    render(<Box ref={object} />)
    expect(object.current).toBe(screen.getByTestId("box"))
    render(<Box ref={fn} />)
    expect(fn).toHaveBeenCalledWith(expect.any(HTMLDivElement))
  })
})

describe("useControllableState", () => {
  function Probe(props: { value?: string; defaultValue?: string; onChange?: (v: string) => void }) {
    const [value, setValue] = useControllableState({
      prop: props.value,
      defaultProp: props.defaultValue ?? "a",
      onChange: props.onChange,
    })
    return (
      <button type="button" onClick={() => setValue((prev) => (prev === "a" ? "b" : "a"))}>
        {value}
      </button>
    )
  }

  test("uncontrolled: updates its own state and reports changes", () => {
    const onChange = vi.fn()
    render(<Probe onChange={onChange} />)
    fireEvent.click(screen.getByRole("button"))
    expect(screen.getByRole("button").textContent).toBe("b")
    expect(onChange).toHaveBeenCalledWith("b")
  })

  test("controlled: reports changes but keeps showing the prop", () => {
    const onChange = vi.fn()
    render(<Probe value="a" onChange={onChange} />)
    fireEvent.click(screen.getByRole("button"))
    expect(onChange).toHaveBeenCalledWith("b")
    expect(screen.getByRole("button").textContent).toBe("a")
  })

  test("controlled: follows the parent when it accepts the change", () => {
    function Parent() {
      const [v, setV] = useState("a")
      return <Probe value={v} onChange={setV} />
    }
    render(<Parent />)
    fireEvent.click(screen.getByRole("button"))
    expect(screen.getByRole("button").textContent).toBe("b")
  })

  test("does not report when the value is unchanged", () => {
    const onChange = vi.fn()
    function Same() {
      const [, setValue] = useControllableState({ defaultProp: "a", onChange })
      return <button type="button" onClick={() => setValue("a")} />
    }
    render(<Same />)
    act(() => {
      fireEvent.click(screen.getByRole("button"))
    })
    expect(onChange).not.toHaveBeenCalled()
  })
})
