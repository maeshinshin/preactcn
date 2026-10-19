import { cloneElement, Component, createRef, options, type ComponentProps } from "preact"
import { forwardRef as compatForwardRef, memo } from "preact/compat"
import { render, screen } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
// Imported after preact/compat on purpose: the hook it installs has to chain compat's
import { forwardRef } from "../src/radix/internal/forward-ref"

const Plain = (props: ComponentProps<"button">) => <button type="button" {...props} />

describe("ref as a prop", () => {
  test("a plain function component gets the ref as a prop and the DOM node arrives", () => {
    const ref = createRef<HTMLButtonElement>()
    const vnode = <Plain ref={ref} />
    expect(vnode.props.ref).toBe(ref)
    expect(vnode.ref).toBeFalsy()
    render(vnode)
    expect(ref.current).toBe(screen.getByRole("button"))
  })

  test("a ref set by cloneElement replaces the one the element had", () => {
    const first = createRef<HTMLButtonElement>()
    const second = createRef<HTMLButtonElement>()
    render(cloneElement(<Plain ref={first} />, { ref: second }))
    expect(second.current).toBe(screen.getByRole("button"))
    expect(first.current).toBeNull()
  })

  // Preact 11 core keeps a class component's ref in its props, the preact/compat imported above makes it the instance again
  test("a class component still gets its instance", () => {
    class Box extends Component {
      render() {
        return <i data-testid="box" />
      }
    }
    const ref = createRef<Box>()
    render(<Box ref={ref} />)
    expect(ref.current).toBeInstanceOf(Box)
  })

  test("a DOM element keeps its ref", () => {
    const ref = createRef<HTMLButtonElement>()
    render(<button type="button" ref={ref} />)
    expect(ref.current).toBe(screen.getByRole("button"))
  })

  test("forwardRef hands the ref over as the second argument and keeps it out of the props", () => {
    const seen: unknown[] = []
    const Fancy = forwardRef<ComponentProps<"button">>((props, ref) => {
      seen.push("ref" in props)
      return <button type="button" ref={ref} {...props} />
    })
    const ref = createRef<HTMLButtonElement>()
    render(<Fancy ref={ref} />)
    expect(seen).toEqual([false])
    expect(ref.current).toBe(screen.getByRole("button"))
  })
})

describe("with preact/compat", () => {
  test("compat's forwardRef still receives the ref", () => {
    const Forwarded = compatForwardRef<HTMLButtonElement, {}>((props, ref) => <button type="button" ref={ref} {...props} />)
    const ref = createRef<HTMLButtonElement>()
    render(<Forwarded ref={ref} />)
    expect(ref.current).toBe(screen.getByRole("button"))
  })

  test("a memo-wrapped plain function component still receives the ref", () => {
    const Memoized = memo(Plain)
    const ref = createRef<HTMLButtonElement>()
    render(<Memoized ref={ref} />)
    expect(ref.current).toBe(screen.getByRole("button"))
  })
})

test("importing it again installs a hook on top of the one before and keeps calling that one", async () => {
  const original = options.vnode
  const before = vi.fn()
  options.vnode = before
  try {
    vi.resetModules()
    await import("../src/radix/internal/forward-ref")
    expect(options.vnode).not.toBe(before)
    const ref = createRef<HTMLButtonElement>()
    render(<Plain ref={ref} />)
    expect(before).toHaveBeenCalled()
    expect(ref.current).toBe(screen.getByRole("button"))
  } finally {
    options.vnode = original
  }
})
