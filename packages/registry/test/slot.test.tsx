import { type ComponentProps, type Ref } from "preact"
import { fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
import * as SlotPrimitive from "../src/radix/slot"
import * as Toggle from "../src/radix/toggle"
import { forwardRef } from "../src/radix/internal/forward-ref"
import { Primitive } from "../src/radix/internal/primitive"

const { Root: Slot } = SlotPrimitive

describe("Slot", () => {
  test("merges its props onto the only child", () => {
    render(
      <Slot id="slot-id" data-foo="bar" aria-label="from slot">
        <a href="/x">link</a>
      </Slot>
    )
    const link = screen.getByRole("link")
    expect(link.getAttribute("id")).toBe("slot-id")
    expect(link.getAttribute("data-foo")).toBe("bar")
    expect(link.getAttribute("aria-label")).toBe("from slot")
    expect(link.getAttribute("href")).toBe("/x")
  })

  test("concatenates class and className and merges style, child wins on conflict", () => {
    const { container } = render(
      <Slot className="slot-class" style={{ color: "red", margin: "1px" }}>
        <div class="child-class" style={{ color: "blue" }} />
      </Slot>
    )
    const el = container.firstElementChild as HTMLElement
    expect(el.className.split(" ").sort()).toEqual(["child-class", "slot-class"])
    expect(el.style.color).toBe("blue")
    expect(el.style.margin).toBe("1px")
  })

  test("hands the slot's classes to a component as className, so its own className is kept", () => {
    // like upstream's SidebarMenuItem: className={cn("own", className)} followed by {...props}
    function Item({ className, ...props }: ComponentProps<"li">) {
      return <li className={["own", className].filter(Boolean).join(" ")} {...props} />
    }
    const { container } = render(
      <Slot className="from-slot">
        <Item />
      </Slot>
    )
    expect((container.firstElementChild as HTMLElement).className.split(" ").sort()).toEqual(["from-slot", "own"])
  })

  test("chains event handlers, child first", () => {
    const order: string[] = []
    render(
      <Slot onClick={() => order.push("slot")}>
        <button type="button" onClick={() => order.push("child")} />
      </Slot>
    )
    fireEvent.click(screen.getByRole("button"))
    expect(order).toEqual(["child", "slot"])
  })

  test("does not let undefined child props clobber slot props", () => {
    render(
      <Slot title="from slot">
        <button type="button" title={undefined} />
      </Slot>
    )
    expect(screen.getByRole("button").title).toBe("from slot")
  })

  test("composes the slot ref with the child ref", () => {
    const slotRef: { current: HTMLElement | null } = { current: null }
    const childRef: { current: HTMLElement | null } = { current: null }
    render(
      <Slot ref={slotRef as Ref<HTMLElement>}>
        <span ref={childRef as Ref<HTMLSpanElement>} />
      </Slot>
    )
    const span = document.querySelector("span")
    expect(slotRef.current).toBe(span)
    expect(childRef.current).toBe(span)
  })

  test("forwards the ref to a child that is a forwardRef component", () => {
    const Fancy = forwardRef<{ ref?: Ref<HTMLButtonElement> }>((props, ref) => (
      <button type="button" ref={ref} {...props} />
    ))
    const ref: { current: HTMLElement | null } = { current: null }
    render(
      <Slot ref={ref as Ref<HTMLElement>} data-x="1">
        <Fancy />
      </Slot>
    )
    expect(ref.current).toBe(screen.getByRole("button"))
    expect(screen.getByRole("button").getAttribute("data-x")).toBe("1")
  })

  test("resolves a plain function component child to its DOM node and keeps the ref stable", () => {
    const Button = (props: ComponentProps<"button">) => <button type="button" {...props} />
    const ref = vi.fn()
    const childRef = vi.fn()
    const ui = (label: string) => (
      <Toggle.Root asChild ref={ref}>
        <Button ref={childRef} data-label={label} />
      </Toggle.Root>
    )
    const { rerender, unmount } = render(ui("a"))
    const button = screen.getByRole("button")
    expect(ref).toHaveBeenCalledTimes(1)
    expect(ref).toHaveBeenLastCalledWith(button)
    expect(childRef).toHaveBeenLastCalledWith(button)
    rerender(ui("b"))
    expect(button.getAttribute("data-label")).toBe("b")
    expect(ref).toHaveBeenCalledTimes(1)
    unmount()
    expect(ref).toHaveBeenLastCalledWith(null)
  })

  test("renders nothing when the child is not an element", () => {
    const { container } = render(<Slot>text</Slot>)
    expect(container.innerHTML).toBe("")
  })
})

describe("Primitive", () => {
  test("renders the tag by default and passes props through", () => {
    render(<Primitive.button type="button" class="a" className="b" data-x="1" />)
    const button = screen.getByRole("button")
    expect(button.className.split(" ").sort()).toEqual(["a", "b"])
    expect(button.getAttribute("data-x")).toBe("1")
  })

  test("asChild renders the child with the merged props", () => {
    render(
      <Primitive.button asChild data-x="1">
        <a href="/y">go</a>
      </Primitive.button>
    )
    const link = screen.getByRole("link")
    expect(link.getAttribute("data-x")).toBe("1")
    expect(screen.queryByRole("button")).toBeNull()
  })

  test("forwards the ref to the element", () => {
    const ref = vi.fn()
    render(<Primitive.div ref={ref} />)
    expect(ref).toHaveBeenCalledWith(expect.any(HTMLDivElement))
  })
})
