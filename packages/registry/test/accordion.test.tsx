import { render, screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test, vi } from "vitest"
import * as Accordion from "../src/radix/accordion"

type RootProps = Parameters<typeof Accordion.Root>[0]

function Basic(props: Partial<RootProps> & { disabledItem?: string }) {
  const { disabledItem, ...rest } = props
  return (
    <Accordion.Root {...({ type: "single", ...rest } as RootProps)} data-testid="root">
      {["a", "b", "c"].map((v) => (
        <Accordion.Item key={v} value={v} disabled={disabledItem === v}>
          <Accordion.Header>
            <Accordion.Trigger>Trigger {v}</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content>Content {v}</Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  )
}

describe("accordion semantics", () => {
  test("headings, triggers and regions are wired together", async () => {
    render(<Basic defaultValue="a" />)
    expect(screen.getByTestId("root").getAttribute("data-orientation")).toBe("vertical")
    const headings = screen.getAllByRole("heading", { level: 3 })
    expect(headings.length).toBe(3)
    expect(headings[0]!.getAttribute("data-state")).toBe("open")
    expect(headings[0]!.getAttribute("data-orientation")).toBe("vertical")
    const trigger = screen.getByRole("button", { name: "Trigger a" })
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(trigger.getAttribute("data-state")).toBe("open")
    expect(trigger.getAttribute("data-orientation")).toBe("vertical")
    const region = screen.getByRole("region")
    expect(region.getAttribute("aria-labelledby")).toBe(trigger.id)
    expect(trigger.getAttribute("aria-controls")).toBe(region.id)
    expect(region.getAttribute("data-state")).toBe("open")
    expect(screen.getByRole("button", { name: "Trigger b" }).getAttribute("aria-expanded")).toBe("false")
  })

  test("the item carries data-state and data-orientation", () => {
    render(<Basic defaultValue="b" />)
    const itemEls = screen.getByTestId("root").children
    expect(Array.from(itemEls).map((i) => i.getAttribute("data-state"))).toEqual(["closed", "open", "closed"])
    expect(itemEls[0]!.getAttribute("data-orientation")).toBe("vertical")
  })

  test("content exposes the accordion CSS variables derived from the collapsible ones", () => {
    render(<Basic defaultValue="a" />)
    const style = screen.getByRole("region").getAttribute("style") ?? ""
    expect(style).toContain("--radix-accordion-content-height: var(--radix-collapsible-content-height)")
    expect(style).toContain("--radix-accordion-content-width: var(--radix-collapsible-content-width)")
  })
})

describe("accordion single", () => {
  test("opening another item closes the open one", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Basic defaultValue="a" onValueChange={onValueChange} />)
    await user.click(screen.getByRole("button", { name: "Trigger b" }))
    expect(onValueChange).toHaveBeenLastCalledWith("b")
    expect(screen.getAllByRole("region").length).toBe(1)
    expect(screen.getByRole("region").textContent).toBe("Content b")
  })

  test("without collapsible the open item cannot be closed and is aria-disabled", async () => {
    const user = userEvent.setup()
    render(<Basic defaultValue="a" />)
    const trigger = screen.getByRole("button", { name: "Trigger a" })
    expect(trigger.getAttribute("aria-disabled")).toBe("true")
    await user.click(trigger)
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
  })

  test("collapsible lets the open item close", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Basic defaultValue="a" collapsible onValueChange={onValueChange} />)
    const trigger = screen.getByRole("button", { name: "Trigger a" })
    expect(trigger.hasAttribute("aria-disabled")).toBe(false)
    await user.click(trigger)
    expect(onValueChange).toHaveBeenLastCalledWith("")
    expect(screen.queryByRole("region")).toBeNull()
  })

  test("controlled value", async () => {
    const user = userEvent.setup()
    render(<Basic value="c" />)
    expect(screen.getByRole("region").textContent).toBe("Content c")
    await user.click(screen.getByRole("button", { name: "Trigger a" }))
    expect(screen.getByRole("region").textContent).toBe("Content c")
  })
})

describe("accordion multiple", () => {
  test("several items can be open and are reported as an array", async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<Basic type="multiple" defaultValue={["a"]} onValueChange={onValueChange} />)
    await user.click(screen.getByRole("button", { name: "Trigger c" }))
    expect(onValueChange).toHaveBeenLastCalledWith(["a", "c"])
    expect(screen.getAllByRole("region").length).toBe(2)
    await user.click(screen.getByRole("button", { name: "Trigger a" }))
    expect(onValueChange).toHaveBeenLastCalledWith(["c"])
  })
})

describe("accordion disabled and keyboard", () => {
  test("a disabled item does not open", async () => {
    const user = userEvent.setup()
    render(<Basic disabledItem="b" />)
    const trigger = screen.getByRole("button", { name: "Trigger b" })
    await user.click(trigger)
    expect(trigger.getAttribute("data-disabled")).toBe("")
    expect(trigger.hasAttribute("disabled")).toBe(true)
    expect(screen.getAllByRole("heading")[1]!.getAttribute("data-disabled")).toBe("")
    expect(screen.queryByRole("region")).toBeNull()
  })

  test("arrows move between triggers with wrapping, Home and End jump, disabled are skipped", async () => {
    const user = userEvent.setup()
    render(<Basic disabledItem="b" />)
    screen.getByRole("button", { name: "Trigger a" }).focus()
    await user.keyboard("{ArrowDown}")
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Trigger c" }))
    await user.keyboard("{ArrowDown}")
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Trigger a" }))
    await user.keyboard("{ArrowUp}")
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Trigger c" }))
    await user.keyboard("{Home}")
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Trigger a" }))
    await user.keyboard("{End}")
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Trigger c" }))
  })

  test("Enter and Space toggle the focused trigger", async () => {
    const user = userEvent.setup()
    render(<Basic collapsible />)
    screen.getByRole("button", { name: "Trigger a" }).focus()
    await user.keyboard("{Enter}")
    expect(screen.getByRole("region").textContent).toBe("Content a")
    await user.keyboard(" ")
    expect(screen.queryByRole("region")).toBeNull()
  })

  test("throws without a type", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    // @ts-expect-error type is required
    expect(() => render(<Accordion.Root />)).toThrow(/type/)
    spy.mockRestore()
  })
})
