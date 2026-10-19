import { useState } from "preact/hooks"
import { fireEvent, render, screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import * as Tabs from "../src/radix/tabs"

type RootProps = Parameters<typeof Tabs.Root>[0]

function Basic(props: Partial<RootProps> & { disabledTab?: string }) {
  const { disabledTab, ...rest } = props
  return (
    <Tabs.Root defaultValue="one" {...rest}>
      <Tabs.List aria-label="demo">
        <Tabs.Trigger value="one">One</Tabs.Trigger>
        <Tabs.Trigger value="two" disabled={disabledTab === "two"}>
          Two
        </Tabs.Trigger>
        <Tabs.Trigger value="three">Three</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="one">Panel one</Tabs.Content>
      <Tabs.Content value="two">Panel two</Tabs.Content>
      <Tabs.Content value="three">Panel three</Tabs.Content>
    </Tabs.Root>
  )
}

describe("tabs", () => {
  test("mousedown focuses the trigger itself, as Safari does not on click", () => {
    render(<Basic />)
    const two = screen.getByRole("tab", { name: "Two" })
    fireEvent.mouseDown(two)
    expect(document.activeElement).toBe(two)
    expect(two.getAttribute("aria-selected")).toBe("true")
  })

  test("tablist, tab and tabpanel semantics", () => {
    const { container } = render(<Basic />)
    const root = container.firstElementChild!
    expect(root.getAttribute("dir")).toBe("ltr")
    expect(root.getAttribute("data-orientation")).toBe("horizontal")
    const list = screen.getByRole("tablist")
    expect(list.getAttribute("aria-orientation")).toBe("horizontal")
    const tabs = screen.getAllByRole("tab")
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false"])
    expect(tabs.map((t) => t.getAttribute("data-state"))).toEqual(["active", "inactive", "inactive"])
    expect(tabs[0]!.getAttribute("type")).toBe("button")
    const panel = screen.getByRole("tabpanel")
    expect(panel.textContent).toBe("Panel one")
    expect(panel.getAttribute("data-state")).toBe("active")
    expect(panel.getAttribute("aria-labelledby")).toBe(tabs[0]!.id)
    expect(tabs[0]!.getAttribute("aria-controls")).toBe(panel.id)
    expect(panel.tabIndex).toBe(0)
  })

  test("inactive panels are hidden and empty", () => {
    const { container } = render(<Basic />)
    const hidden = container.querySelectorAll("[role=tabpanel][hidden]")
    expect(hidden.length).toBe(2)
    expect(Array.from(hidden).every((p) => p.textContent === "")).toBe(true)
  })

  test("clicking a tab selects it (on mousedown) and reports", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Basic onValueChange={onValueChange} />)
    await user.click(screen.getByRole("tab", { name: "Two" }))
    expect(onValueChange).toHaveBeenCalledWith("two")
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel two")
    expect(screen.getByRole("tab", { name: "Two" }).getAttribute("data-state")).toBe("active")
  })

  test("controlled", async () => {
    const user = userEvent.setup()
    function Parent() {
      const [v, setV] = useState("one")
      return <Basic value={v} onValueChange={setV} />
    }
    render(<Parent />)
    await user.click(screen.getByRole("tab", { name: "Three" }))
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel three")
  })

  test("a disabled tab cannot be selected", async () => {
    const user = userEvent.setup()
    render(<Basic disabledTab="two" />)
    const tab = screen.getByRole("tab", { name: "Two" })
    await user.click(tab)
    expect(tab.getAttribute("data-disabled")).toBe("")
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel one")
  })

  test("arrow keys move focus and activate, looping; Home and End jump", async () => {
    const user = userEvent.setup()
    render(<Basic />)
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "One" }))
    await user.keyboard("{ArrowRight}")
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Two" }))
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel two")
    await user.keyboard("{End}")
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel three")
    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel one")
    await user.keyboard("{ArrowLeft}")
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel three")
    await user.keyboard("{Home}")
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel one")
  })

  test("disabled tabs are skipped by arrow keys", async () => {
    const user = userEvent.setup()
    render(<Basic disabledTab="two" />)
    await user.tab()
    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel three")
  })

  test("vertical orientation uses up/down arrows", async () => {
    const user = userEvent.setup()
    const { container } = render(<Basic orientation="vertical" />)
    expect(container.firstElementChild!.getAttribute("data-orientation")).toBe("vertical")
    expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe("vertical")
    await user.tab()
    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel one")
    await user.keyboard("{ArrowDown}")
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel two")
  })

  test("rtl reverses horizontal arrows", async () => {
    const user = userEvent.setup()
    render(<Basic dir="rtl" />)
    await user.tab()
    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("tabpanel").textContent).toBe("Panel three")
  })

  test("Tab moves from the tab list to the panel", async () => {
    const user = userEvent.setup()
    render(<Basic />)
    await user.tab()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole("tabpanel"))
  })
})
