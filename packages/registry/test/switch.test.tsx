import { fireEvent, render, screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import * as Switch from "../src/radix/switch"

function Basic(props: Partial<Parameters<typeof Switch.Root>[0]>) {
  return (
    <Switch.Root aria-label="airplane" {...props}>
      <Switch.Thumb data-testid="thumb" />
    </Switch.Root>
  )
}

describe("switch", () => {
  test("role switch with unchecked state by default", () => {
    render(<Basic />)
    const el = screen.getByRole("switch")
    expect(el.tagName).toBe("BUTTON")
    expect(el.getAttribute("type")).toBe("button")
    expect(el.getAttribute("aria-checked")).toBe("false")
    expect(el.getAttribute("data-state")).toBe("unchecked")
    expect(screen.getByTestId("thumb").getAttribute("data-state")).toBe("unchecked")
  })

  test("uncontrolled toggling by click, Space and Enter", async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(<Basic onCheckedChange={onCheckedChange} />)
    const el = screen.getByRole("switch")
    await user.click(el)
    expect(el.getAttribute("aria-checked")).toBe("true")
    expect(el.getAttribute("data-state")).toBe("checked")
    expect(screen.getByTestId("thumb").getAttribute("data-state")).toBe("checked")
    expect(onCheckedChange).toHaveBeenLastCalledWith(true)
    await user.keyboard(" ")
    expect(el.getAttribute("data-state")).toBe("unchecked")
    await user.keyboard("{Enter}")
    expect(el.getAttribute("data-state")).toBe("checked")
  })

  test("defaultChecked and controlled checked", async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    const { rerender } = render(<Basic defaultChecked />)
    expect(screen.getByRole("switch").getAttribute("data-state")).toBe("checked")
    rerender(<Basic checked={false} onCheckedChange={onCheckedChange} />)
    await user.click(screen.getByRole("switch"))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(screen.getByRole("switch").getAttribute("data-state")).toBe("unchecked")
  })

  test("disabled", async () => {
    const user = userEvent.setup()
    const onCheckedChange = vi.fn()
    render(<Basic disabled onCheckedChange={onCheckedChange} />)
    const el = screen.getByRole("switch")
    await user.click(el)
    expect(onCheckedChange).not.toHaveBeenCalled()
    expect(el.getAttribute("data-disabled")).toBe("")
    expect(screen.getByTestId("thumb").getAttribute("data-disabled")).toBe("")
  })

  test("asChild", async () => {
    const user = userEvent.setup()
    render(
      <Switch.Root asChild>
        <span role="switch" aria-label="custom" tabIndex={0} />
      </Switch.Root>
    )
    await user.click(screen.getByRole("switch"))
    expect(screen.getByRole("switch").getAttribute("data-state")).toBe("checked")
  })

  test("a prevented click does not toggle", () => {
    render(<Basic onClick={(e) => e.preventDefault()} />)
    fireEvent.click(screen.getByRole("switch"))
    expect(screen.getByRole("switch").getAttribute("data-state")).toBe("unchecked")
  })
})
