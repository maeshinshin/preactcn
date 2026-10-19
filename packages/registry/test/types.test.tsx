import { createRef, type Ref } from "preact"
import { render } from "@testing-library/preact"
import { describe, expect, test } from "vitest"
import * as Checkbox from "../src/radix/checkbox"
import * as Dialog from "../src/radix/dialog"
import * as HoverCard from "../src/radix/hover-card"
import * as Popover from "../src/radix/popover"
import * as Switch from "../src/radix/switch"
import * as Tooltip from "../src/radix/tooltip"

// `pnpm typecheck` is the assertion: Radix declares handlers as methods (bivariant) and parts accept a ref of any element type,
// and upstream wrappers rely on both.
describe("prop types", () => {
  test("a handler that takes a narrower argument than the component reports is accepted", () => {
    const onBoolean = (checked: boolean) => void checked
    render(<Checkbox.Root onCheckedChange={onBoolean} />)
    expect(document.querySelectorAll("button").length).toBe(1)
  })

  test("parts accept a ref of any element type and deliver their element", () => {
    const refs = Array.from({ length: 10 }, () => createRef<HTMLElement>())
    const anyRef: Ref<any> = refs[9]!
    render(
      <Dialog.Root>
        <Dialog.Trigger ref={refs[0]} />
        <Dialog.Close ref={refs[1]} />
        <Dialog.Title ref={refs[2]} />
        <Dialog.Description ref={refs[3]} />
        <Popover.Root>
          <Popover.Trigger ref={refs[4]} />
          <Popover.Anchor ref={refs[5]} />
        </Popover.Root>
        <Tooltip.Provider>
          <Tooltip.Root>
            <Tooltip.Trigger ref={refs[6]} />
          </Tooltip.Root>
        </Tooltip.Provider>
        <HoverCard.Root>
          <HoverCard.Trigger ref={refs[7]} />
        </HoverCard.Root>
        <Checkbox.Root ref={refs[8]} />
        <Switch.Root ref={anyRef} />
      </Dialog.Root>
    )
    expect(refs.map((ref) => ref.current?.tagName)).toEqual(["BUTTON", "BUTTON", "H2", "P", "BUTTON", "DIV", "BUTTON", "A", "BUTTON", "BUTTON"])
  })
})
