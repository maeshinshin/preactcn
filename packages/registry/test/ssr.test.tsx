// @vitest-environment node
import { renderToString } from "preact-render-to-string"
import { describe, expect, test } from "vitest"
import * as AlertDialog from "../src/radix/alert-dialog"
import * as Checkbox from "../src/radix/checkbox"
import * as Dialog from "../src/radix/dialog"
import * as HoverCard from "../src/radix/hover-card"
import * as Popover from "../src/radix/popover"
import * as RadioGroup from "../src/radix/radio-group"
import * as Switch from "../src/radix/switch"
import * as Tooltip from "../src/radix/tooltip"

// No document or window here: any DOM access while rendering would throw
describe("server rendering", () => {
  test("portaled content is not rendered, even when open", () => {
    const html = renderToString(
      <div>
        <Dialog.Root defaultOpen>
          <Dialog.Trigger>open dialog</Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay />
            <Dialog.Content>dialog body</Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
        <AlertDialog.Root defaultOpen>
          <AlertDialog.Trigger>open alert</AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Content>alert body</AlertDialog.Content>
          </AlertDialog.Portal>
        </AlertDialog.Root>
        <Popover.Root defaultOpen>
          <Popover.Trigger>open popover</Popover.Trigger>
          <Popover.Portal>
            <Popover.Content>popover body</Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <Tooltip.Provider>
          <Tooltip.Root defaultOpen>
            <Tooltip.Trigger>hover</Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content>tooltip body</Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
        <HoverCard.Root defaultOpen>
          <HoverCard.Trigger>card</HoverCard.Trigger>
          <HoverCard.Portal>
            <HoverCard.Content>card body</HoverCard.Content>
          </HoverCard.Portal>
        </HoverCard.Root>
      </div>
    )
    for (const trigger of ["open dialog", "open alert", "open popover", "hover", "card"]) expect(html).toContain(trigger)
    expect(html).not.toMatch(/dialog body|alert body|popover body|tooltip body|card body/)
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-expanded="true"')
  })

  test("content rendered without a Portal does not touch the DOM either", () => {
    const html = renderToString(
      <Popover.Root defaultOpen>
        <Popover.Trigger>open</Popover.Trigger>
        <Popover.Content>inline body</Popover.Content>
      </Popover.Root>
    )
    expect(html).toContain("inline body")
    expect(html).toContain("data-radix-popper-content-wrapper")
    expect(html).toContain("translate(0, -200%)")
  })

  test("form controls render their hidden input so a form submits before hydration", () => {
    const html = renderToString(
      <form>
        <Checkbox.Root name="terms" value="yes" defaultChecked required />
        <Switch.Root name="alerts" />
        <RadioGroup.Root name="plan" defaultValue="b">
          <RadioGroup.Item value="a" />
          <RadioGroup.Item value="b" />
        </RadioGroup.Root>
      </form>
    )
    const inputs = html.match(/<input[^>]*>/g)!
    expect(inputs).toHaveLength(4)
    expect(inputs[0]).toContain('name="terms"')
    expect(inputs[0]).toContain('value="yes"')
    expect(inputs[0]).toContain("checked")
    expect(inputs[0]).toContain("required")
    expect(inputs[0]).toContain('aria-hidden="true"')
    expect(inputs[1]).toContain('name="alerts"')
    expect(inputs[1]).not.toContain("checked")
    expect(inputs[2]).toContain('type="radio"')
    expect(inputs[2]).not.toContain("checked")
    expect(inputs[3]).toContain("checked")
  })
})
