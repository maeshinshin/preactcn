import { useState } from "preact/hooks"
import { render, screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import * as ToggleGroup from "../src/radix/toggle-group"

type RootProps = Parameters<typeof ToggleGroup.Root>[0]

function Group(props: Partial<RootProps> & { disabledItem?: string }) {
  const { disabledItem, ...rest } = props
  return (
    <ToggleGroup.Root aria-label="align" {...({ type: "single", ...rest } as RootProps)}>
      <ToggleGroup.Item value="left">Left</ToggleGroup.Item>
      <ToggleGroup.Item value="center" disabled={disabledItem === "center"}>
        Center
      </ToggleGroup.Item>
      <ToggleGroup.Item value="right">Right</ToggleGroup.Item>
    </ToggleGroup.Root>
  )
}

describe("toggle-group single", () => {
  test("radiogroup role and radio items with aria-checked", () => {
    render(<Group defaultValue="center" />)
    expect(screen.getByRole("radiogroup").getAttribute("dir")).toBe("ltr")
    const radios = screen.getAllByRole("radio")
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["false", "true", "false"])
    expect(radios.map((r) => r.getAttribute("data-state"))).toEqual(["off", "on", "off"])
    expect(radios[1]!.hasAttribute("aria-pressed")).toBe(false)
  })

  test("selecting replaces the value; clicking again clears it with an empty string", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Group onValueChange={onValueChange} />)
    await user.click(screen.getByRole("radio", { name: "Left" }))
    expect(onValueChange).toHaveBeenLastCalledWith("left")
    await user.click(screen.getByRole("radio", { name: "Right" }))
    expect(onValueChange).toHaveBeenLastCalledWith("right")
    expect(screen.getByRole("radio", { name: "Left" }).getAttribute("data-state")).toBe("off")
    await user.click(screen.getByRole("radio", { name: "Right" }))
    expect(onValueChange).toHaveBeenLastCalledWith("")
    expect(screen.getByRole("radio", { name: "Right" }).getAttribute("data-state")).toBe("off")
  })

  test("controlled", async () => {
    const user = userEvent.setup()
    function Parent() {
      const [value, setValue] = useState("left")
      return <Group value={value} onValueChange={setValue} />
    }
    render(<Parent />)
    await user.click(screen.getByRole("radio", { name: "Center" }))
    expect(screen.getByRole("radio", { name: "Center" }).getAttribute("aria-checked")).toBe("true")
  })

  test("disabled item", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Group disabledItem="center" onValueChange={onValueChange} />)
    await user.click(screen.getByRole("radio", { name: "Center" }))
    expect(onValueChange).not.toHaveBeenCalled()
    expect(screen.getByRole("radio", { name: "Center" }).getAttribute("data-disabled")).toBe("")
  })
})

describe("toggle-group multiple", () => {
  test("items are toggle buttons with aria-pressed", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Group type="multiple" defaultValue={["left"]} onValueChange={onValueChange} />)
    const buttons = screen.getAllByRole("button")
    expect(screen.getByRole("toolbar")).toBeTruthy()
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"])
    await user.click(buttons[2]!)
    expect(onValueChange).toHaveBeenLastCalledWith(["left", "right"])
    await user.click(buttons[0]!)
    expect(onValueChange).toHaveBeenLastCalledWith(["right"])
  })

  test("throws without a type", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    // @ts-expect-error type is required
    expect(() => render(<ToggleGroup.Root />)).toThrow(/type/)
    spy.mockRestore()
  })
})

describe("toggle-group keyboard", () => {
  test("Tab enters on the selected item, arrows move focus, looping at the ends", async () => {
    const user = userEvent.setup()
    render(<Group defaultValue="center" />)
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Center" }))
    await user.keyboard("{ArrowRight}")
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Right" }))
    await user.keyboard("{ArrowRight}")
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Left" }))
    await user.keyboard("{ArrowLeft}")
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Right" }))
    await user.keyboard("{Home}")
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Left" }))
    await user.keyboard("{End}")
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Right" }))
  })

  test("only one item is in the tab order", () => {
    render(<Group defaultValue="center" />)
    const tabIndexes = screen.getAllByRole("radio").map((r) => r.tabIndex)
    expect(tabIndexes.filter((i) => i === 0).length).toBeLessThanOrEqual(1)
  })

  test("disabled items are skipped", async () => {
    const user = userEvent.setup()
    render(<Group disabledItem="center" />)
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Left" }))
    await user.keyboard("{ArrowRight}")
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Right" }))
  })

  test("rtl reverses horizontal arrows", async () => {
    const user = userEvent.setup()
    render(<Group dir="rtl" defaultValue="center" />)
    await user.tab()
    await user.keyboard("{ArrowRight}")
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Left" }))
  })

  test("vertical orientation uses up/down arrows", async () => {
    const user = userEvent.setup()
    render(<Group orientation="vertical" defaultValue="left" />)
    expect(screen.getByRole("radiogroup").getAttribute("data-orientation")).toBe("vertical")
    await user.tab()
    await user.keyboard("{ArrowRight}")
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Left" }))
    await user.keyboard("{ArrowDown}")
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "Center" }))
  })

  test("Space activates the focused item", async () => {
    const user = userEvent.setup()
    render(<Group />)
    await user.tab()
    await user.keyboard(" ")
    expect(screen.getByRole("radio", { name: "Left" }).getAttribute("aria-checked")).toBe("true")
  })
})
