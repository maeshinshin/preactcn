import { useState } from "preact/hooks"
import { render, screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, test, vi } from "vitest"
import * as Checkbox from "../src/radix/checkbox"
import * as RadioGroup from "../src/radix/radio-group"
import * as Switch from "../src/radix/switch"

const entries = (form: HTMLFormElement) => [...new FormData(form).entries()]
const getForm = (container: Element) => container.querySelector("form") as HTMLFormElement
const hiddenInputs = (container: Element) => Array.from(container.querySelectorAll<HTMLInputElement>("input"))

afterEach(() => vi.restoreAllMocks())

describe.each([
  ["checkbox", Checkbox.Root, "checkbox", "checkbox"],
  ["switch", Switch.Root, "switch", "checkbox"],
] as const)("%s form participation", (_name, Root: any, role, inputType) => {
  test("renders an aria-hidden, inert, visually hidden input carrying the form attributes", () => {
    const { container } = render(
      <form>
        <Root aria-label="terms" name="terms" value="yes" required />
      </form>
    )
    const [input] = hiddenInputs(container)
    expect(hiddenInputs(container)).toHaveLength(1)
    expect(input!.type).toBe(inputType)
    expect(input!.name).toBe("terms")
    expect(input!.value).toBe("yes")
    expect(input!.required).toBe(true)
    expect(input!.getAttribute("aria-hidden")).toBe("true")
    expect(input!.tabIndex).toBe(-1)
    expect(input!.style.position).toBe("absolute")
    expect(input!.style.pointerEvents).toBe("none")
    expect(input!.style.opacity).toBe("0")
    expect(screen.getAllByRole(role)).toHaveLength(1)
  })

  test("is sized like the control, so the browser anchors its validation message there", () => {
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(16)
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(12)
    const { container } = render(
      <form>
        <Root aria-label="terms" name="terms" />
      </form>
    )
    const [input] = hiddenInputs(container)
    expect(input!.style.width).toBe("16px")
    expect(input!.style.height).toBe("12px")
  })

  test("the submitted value follows the control state", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <form>
        <Root aria-label="terms" name="terms" value="yes" />
      </form>
    )
    const form = getForm(container)
    expect(entries(form)).toEqual([])
    await user.click(screen.getByRole(role))
    expect(entries(form)).toEqual([["terms", "yes"]])
    await user.click(screen.getByRole(role))
    expect(entries(form)).toEqual([])
  })

  test("the value defaults to on and defaultChecked is submitted", () => {
    const { container } = render(
      <form>
        <Root aria-label="terms" name="terms" defaultChecked />
      </form>
    )
    expect(entries(getForm(container))).toEqual([["terms", "on"]])
  })

  test("a controlled value change is mirrored and announced to the form", () => {
    const onChange = vi.fn()
    const onInput = vi.fn()
    const ui = (checked: boolean) => (
      <form onChange={onChange} onInput={onInput}>
        <Root aria-label="terms" name="terms" checked={checked} />
      </form>
    )
    const { container, rerender } = render(ui(false))
    const form = getForm(container)
    expect(onChange).not.toHaveBeenCalled()
    rerender(ui(true))
    expect(entries(form)).toEqual([["terms", "on"]])
    expect(onInput).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0].target).toBe(hiddenInputs(container)[0])
  })

  test("a click on the control fires a single change event on the hidden input", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { container } = render(
      <form onChange={onChange}>
        <Root aria-label="terms" name="terms" />
      </form>
    )
    await user.click(screen.getByRole(role))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0]![0].target).toBe(hiddenInputs(container)[0])
  })

  test("required blocks validation until checked", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <form>
        <Root aria-label="terms" name="terms" required />
      </form>
    )
    const form = getForm(container)
    expect(form.checkValidity()).toBe(false)
    await user.click(screen.getByRole(role))
    expect(form.checkValidity()).toBe(true)
  })

  test("a disabled control is not submitted", () => {
    const { container } = render(
      <form>
        <Root aria-label="terms" name="terms" defaultChecked disabled />
      </form>
    )
    expect(hiddenInputs(container)[0]!.disabled).toBe(true)
    expect(entries(getForm(container))).toEqual([])
  })

  test("no input is rendered outside a form", () => {
    const { container } = render(<Root aria-label="terms" name="terms" />)
    expect(hiddenInputs(container)).toHaveLength(0)
  })
})

describe("checkbox indeterminate", () => {
  test("mirrors indeterminate on the input and does not submit", () => {
    const { container } = render(
      <form>
        <Checkbox.Root aria-label="terms" name="terms" defaultChecked="indeterminate" />
      </form>
    )
    expect(hiddenInputs(container)[0]!.indeterminate).toBe(true)
    expect(entries(getForm(container))).toEqual([])
  })
})

describe("radio group form participation", () => {
  function Group(props: Partial<Parameters<typeof RadioGroup.Root>[0]>) {
    return (
      <form>
        <RadioGroup.Root aria-label="plan" name="plan" {...props}>
          {["a", "b", "c"].map((v) => (
            <RadioGroup.Item key={v} value={v} aria-label={`item ${v}`} />
          ))}
        </RadioGroup.Root>
      </form>
    )
  }

  test("one hidden radio per item with the group name and the item value", () => {
    const { container } = render(<Group required />)
    const inputs = hiddenInputs(container)
    expect(inputs.map((i) => [i.type, i.name, i.value, i.required])).toEqual([
      ["radio", "plan", "a", true],
      ["radio", "plan", "b", true],
      ["radio", "plan", "c", true],
    ])
    expect(inputs.every((i) => i.getAttribute("aria-hidden") === "true" && i.tabIndex === -1)).toBe(true)
    expect(screen.getAllByRole("radio")).toHaveLength(3)
  })

  test("the submitted value is the checked item", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { container } = render(
      <div onChange={onChange}>
        <Group defaultValue="b" />
      </div>
    )
    const form = getForm(container)
    expect(entries(form)).toEqual([["plan", "b"]])
    await user.click(screen.getByRole("radio", { name: "item c" }))
    expect(entries(form)).toEqual([["plan", "c"]])
    const targets = onChange.mock.calls.map(([event]) => (event.target as HTMLInputElement).value)
    expect(targets).toContain("c")
    expect(targets).not.toContain("a")
  })

  test("required validates only once an item is chosen", async () => {
    const user = userEvent.setup()
    const { container } = render(<Group required />)
    const form = getForm(container)
    expect(form.checkValidity()).toBe(false)
    await user.click(screen.getByRole("radio", { name: "item a" }))
    expect(form.checkValidity()).toBe(true)
  })

  test("controlled value is mirrored", async () => {
    const user = userEvent.setup()
    function Parent() {
      const [value, setValue] = useState("a")
      return <Group value={value} onValueChange={setValue} />
    }
    const { container } = render(<Parent />)
    await user.click(screen.getByRole("radio", { name: "item b" }))
    expect(entries(getForm(container))).toEqual([["plan", "b"]])
  })

  test("a disabled group or item is not submitted and nothing is rendered outside a form", () => {
    const { container, rerender } = render(<Group defaultValue="a" disabled />)
    expect(entries(getForm(container))).toEqual([])
    rerender(
      <RadioGroup.Root aria-label="plan" name="plan" defaultValue="a">
        <RadioGroup.Item value="a" aria-label="item a" />
      </RadioGroup.Root>
    )
    expect(hiddenInputs(container)).toHaveLength(0)
  })
})
