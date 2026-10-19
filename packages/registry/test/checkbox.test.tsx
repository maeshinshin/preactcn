import { useState } from "preact/hooks"
import { render, screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import * as Checkbox from "../src/radix/checkbox"

function Basic(props: Partial<Parameters<typeof Checkbox.Root>[0]>) {
  return (
    <Checkbox.Root aria-label="accept" {...props}>
      <Checkbox.Indicator data-testid="indicator">x</Checkbox.Indicator>
    </Checkbox.Root>
  )
}

describe("checkbox", () => {
  test("role checkbox, unchecked by default, indicator not rendered", () => {
    render(<Basic />)
    const el = screen.getByRole("checkbox")
    expect(el.tagName).toBe("BUTTON")
    expect(el.getAttribute("type")).toBe("button")
    expect(el.getAttribute("aria-checked")).toBe("false")
    expect(el.getAttribute("data-state")).toBe("unchecked")
    expect(screen.queryByTestId("indicator")).toBeNull()
  })

  test("click toggles and mounts the indicator with data-state", async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(<Basic onCheckedChange={onCheckedChange} />)
    const el = screen.getByRole("checkbox")
    await user.click(el)
    expect(el.getAttribute("aria-checked")).toBe("true")
    expect(el.getAttribute("data-state")).toBe("checked")
    expect(onCheckedChange).toHaveBeenLastCalledWith(true)
    const indicator = screen.getByTestId("indicator")
    expect(indicator.tagName).toBe("SPAN")
    expect(indicator.getAttribute("data-state")).toBe("checked")
    expect(indicator.style.pointerEvents).toBe("none")
    await user.click(el)
    expect(el.getAttribute("data-state")).toBe("unchecked")
    expect(screen.queryByTestId("indicator")).toBeNull()
  })

  test("Space toggles but Enter does not", async () => {
    const user = userEvent.setup()
    render(<Basic />)
    const el = screen.getByRole("checkbox")
    el.focus()
    await user.keyboard("{Enter}")
    expect(el.getAttribute("data-state")).toBe("unchecked")
    await user.keyboard(" ")
    expect(el.getAttribute("data-state")).toBe("checked")
  })

  test("indeterminate: aria-checked mixed, indicator shown, click checks", async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(<Basic defaultChecked="indeterminate" onCheckedChange={onCheckedChange} />)
    const el = screen.getByRole("checkbox")
    expect(el.getAttribute("aria-checked")).toBe("mixed")
    expect(el.getAttribute("data-state")).toBe("indeterminate")
    expect(screen.getByTestId("indicator").getAttribute("data-state")).toBe("indeterminate")
    await user.click(el)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(el.getAttribute("data-state")).toBe("checked")
  })

  test("controlled", async () => {
    const user = userEvent.setup()
    function Parent() {
      const [checked, setChecked] = useState<boolean | "indeterminate">(false)
      return <Basic checked={checked} onCheckedChange={setChecked} />
    }
    render(<Parent />)
    await user.click(screen.getByRole("checkbox"))
    expect(screen.getByRole("checkbox").getAttribute("data-state")).toBe("checked")
  })

  test("controlled value is not changed by a click without a handler", async () => {
    const user = userEvent.setup()
    render(<Basic checked={false} />)
    await user.click(screen.getByRole("checkbox"))
    expect(screen.getByRole("checkbox").getAttribute("data-state")).toBe("unchecked")
  })

  test("accepts a handler that only takes a boolean, as Radix's method signature does", async () => {
    const user = userEvent.setup()
    const calls: boolean[] = []
    const onCheckedChange = (checked: boolean) => void calls.push(checked)
    render(<Basic onCheckedChange={onCheckedChange} />)
    await user.click(screen.getByRole("checkbox"))
    expect(calls).toEqual([true])
  })

  test("disabled", async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(<Basic disabled onCheckedChange={onCheckedChange} />)
    const el = screen.getByRole("checkbox")
    await user.click(el)
    expect(onCheckedChange).not.toHaveBeenCalled()
    expect(el.getAttribute("data-disabled")).toBe("")
    expect(el.hasAttribute("disabled")).toBe(true)
  })

  test("asChild", async () => {
    const user = userEvent.setup()
    render(
      <Checkbox.Root asChild>
        <span role="checkbox" tabIndex={0} aria-label="custom" />
      </Checkbox.Root>
    )
    await user.click(screen.getByRole("checkbox"))
    expect(screen.getByRole("checkbox").getAttribute("data-state")).toBe("checked")
  })
})
