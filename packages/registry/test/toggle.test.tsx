import { useState } from "preact/hooks"
import { render, screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import * as Toggle from "../src/radix/toggle"

describe("toggle", () => {
  test("is a button with aria-pressed and data-state off by default", () => {
    render(<Toggle.Root>Bold</Toggle.Root>)
    const el = screen.getByRole("button", { name: "Bold" })
    expect(el.getAttribute("type")).toBe("button")
    expect(el.getAttribute("aria-pressed")).toBe("false")
    expect(el.getAttribute("data-state")).toBe("off")
    expect(el.hasAttribute("data-disabled")).toBe(false)
  })

  test("uncontrolled: click and keyboard toggle, onPressedChange is called", async () => {
    const user = userEvent.setup()
    const onPressedChange = vi.fn()
    render(<Toggle.Root onPressedChange={onPressedChange}>Bold</Toggle.Root>)
    const el = screen.getByRole("button")
    await user.click(el)
    expect(el.getAttribute("aria-pressed")).toBe("true")
    expect(el.getAttribute("data-state")).toBe("on")
    expect(onPressedChange).toHaveBeenLastCalledWith(true)
    await user.keyboard(" ")
    expect(el.getAttribute("data-state")).toBe("off")
    await user.keyboard("{Enter}")
    expect(el.getAttribute("data-state")).toBe("on")
    expect(onPressedChange).toHaveBeenCalledTimes(3)
  })

  test("defaultPressed", () => {
    render(<Toggle.Root defaultPressed>x</Toggle.Root>)
    expect(screen.getByRole("button").getAttribute("data-state")).toBe("on")
  })

  test("controlled", async () => {
    const user = userEvent.setup()
    const onPressedChange = vi.fn()
    const { rerender } = render(
      <Toggle.Root pressed={false} onPressedChange={onPressedChange}>
        x
      </Toggle.Root>
    )
    await user.click(screen.getByRole("button"))
    expect(onPressedChange).toHaveBeenCalledWith(true)
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false")
    rerender(
      <Toggle.Root pressed onPressedChange={onPressedChange}>
        x
      </Toggle.Root>
    )
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true")
  })

  test("disabled: no toggling, data-disabled present", async () => {
    const user = userEvent.setup()
    const onPressedChange = vi.fn()
    render(
      <Toggle.Root disabled onPressedChange={onPressedChange}>
        x
      </Toggle.Root>
    )
    const el = screen.getByRole("button")
    await user.click(el)
    expect(onPressedChange).not.toHaveBeenCalled()
    expect(el.getAttribute("data-disabled")).toBe("")
    expect((el as HTMLButtonElement).disabled).toBe(true)
  })

  test("a user onClick that prevents default stops the toggle", async () => {
    const user = userEvent.setup()
    render(<Toggle.Root onClick={(e) => e.preventDefault()}>x</Toggle.Root>)
    await user.click(screen.getByRole("button"))
    expect(screen.getByRole("button").getAttribute("data-state")).toBe("off")
  })

  test("asChild", async () => {
    const user = userEvent.setup()
    render(
      <Toggle.Root asChild>
        <a href="#x">link</a>
      </Toggle.Root>
    )
    const el = screen.getByRole("link")
    await user.click(el)
    expect(el.getAttribute("data-state")).toBe("on")
  })

  test("works inside a stateful parent", async () => {
    const user = userEvent.setup()
    function Parent() {
      const [p, setP] = useState(false)
      return (
        <Toggle.Root pressed={p} onPressedChange={setP}>
          {String(p)}
        </Toggle.Root>
      )
    }
    render(<Parent />)
    await user.click(screen.getByRole("button"))
    expect(screen.getByRole("button").textContent).toBe("true")
  })
})
