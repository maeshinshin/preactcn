import { useState } from "preact/hooks"
import { render, screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import * as RadioGroup from "../src/radix/radio-group"

type RootProps = Parameters<typeof RadioGroup.Root>[0]

function Group(props: Partial<RootProps> & { disabledItem?: string }) {
  const { disabledItem, ...rest } = props
  return (
    <RadioGroup.Root aria-label="plan" {...rest}>
      {["a", "b", "c"].map((v) => (
        <RadioGroup.Item key={v} value={v} id={v} disabled={disabledItem === v} aria-label={`item ${v}`}>
          <RadioGroup.Indicator data-testid={`ind-${v}`} />
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}

describe("radio-group", () => {
  test("radiogroup semantics and unchecked items", () => {
    render(<Group />)
    const group = screen.getByRole("radiogroup")
    expect(group.getAttribute("dir")).toBe("ltr")
    expect(group.hasAttribute("data-disabled")).toBe(false)
    const radios = screen.getAllByRole("radio")
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "false", "false"])
    expect(radios.map((r) => r.getAttribute("data-state"))).toEqual(["unchecked", "unchecked", "unchecked"])
    expect(radios[0]!.getAttribute("type")).toBe("button")
  })

  test("defaultValue and indicator only in the checked item", () => {
    render(<Group defaultValue="b" />)
    expect(screen.getByRole("radio", { name: "item b" }).getAttribute("data-state")).toBe("checked")
    expect(screen.queryByTestId("ind-a")).toBeNull()
    expect(screen.getByTestId("ind-b").getAttribute("data-state")).toBe("checked")
  })

  test("clicking selects and reports; clicking the selected item does nothing", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Group onValueChange={onValueChange} />)
    await user.click(screen.getByRole("radio", { name: "item c" }))
    expect(onValueChange).toHaveBeenCalledWith("c")
    expect(screen.getByRole("radio", { name: "item c" }).getAttribute("aria-checked")).toBe("true")
    await user.click(screen.getByRole("radio", { name: "item c" }))
    expect(onValueChange).toHaveBeenCalledTimes(1)
  })

  test("controlled", async () => {
    const user = userEvent.setup()
    function Parent() {
      const [v, setV] = useState("a")
      return <Group value={v} onValueChange={setV} />
    }
    render(<Parent />)
    await user.click(screen.getByRole("radio", { name: "item b" }))
    expect(screen.getByRole("radio", { name: "item b" }).getAttribute("data-state")).toBe("checked")
    expect(screen.getByRole("radio", { name: "item a" }).getAttribute("data-state")).toBe("unchecked")
  })

  test("disabled group and item", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    const { rerender } = render(<Group disabled onValueChange={onValueChange} />)
    expect(screen.getByRole("radiogroup").getAttribute("data-disabled")).toBe("")
    await user.click(screen.getByRole("radio", { name: "item a" }))
    expect(onValueChange).not.toHaveBeenCalled()
    rerender(<Group disabledItem="b" onValueChange={onValueChange} />)
    await user.click(screen.getByRole("radio", { name: "item b" }))
    expect(onValueChange).not.toHaveBeenCalled()
    expect(screen.getByRole("radio", { name: "item b" }).getAttribute("data-disabled")).toBe("")
  })

  test("Tab goes to the checked item; arrow keys move focus and check", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Group defaultValue="b" onValueChange={onValueChange} />)
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "item b" }))
    await user.keyboard("{ArrowDown}")
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "item c" }))
    expect(onValueChange).toHaveBeenLastCalledWith("c")
    expect(screen.getByRole("radio", { name: "item c" }).getAttribute("aria-checked")).toBe("true")
    await user.keyboard("{ArrowRight}")
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "item a" }))
    expect(onValueChange).toHaveBeenLastCalledWith("a")
    await user.keyboard("{ArrowLeft}")
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "item c" }))
    await user.keyboard("{ArrowUp}")
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "item b" }))
  })

  test("arrow navigation skips disabled items", async () => {
    const user = userEvent.setup()
    render(<Group defaultValue="a" disabledItem="b" />)
    await user.tab()
    await user.keyboard("{ArrowDown}")
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "item c" }))
  })

  test("Space checks, Enter does not", async () => {
    const user = userEvent.setup()
    render(<Group />)
    await user.tab()
    await user.keyboard("{Enter}")
    expect(screen.getByRole("radio", { name: "item a" }).getAttribute("data-state")).toBe("unchecked")
    await user.keyboard(" ")
    expect(screen.getByRole("radio", { name: "item a" }).getAttribute("data-state")).toBe("checked")
  })

  test("Item outside a group throws", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<RadioGroup.Item value="x" />)).toThrow(/RadioGroup/)
    spy.mockRestore()
  })
})
