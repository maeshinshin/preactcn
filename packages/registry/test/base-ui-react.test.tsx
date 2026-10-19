import { type ComponentChildren, type ComponentProps } from "preact"
import { forwardRef } from "../src/radix/internal/forward-ref"
import { useRef, useState } from "preact/hooks"
import { act, fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
import { defineBrowserProperty, flush, setupUser, useFakeTimers } from "./helpers"
import { Combobox } from "../src/shims/base-ui-react"

const frameworks = ["Next.js", "SvelteKit", "Nuxt.js", "Remix", "Astro"]

type RootProps = ComponentProps<typeof Combobox.Root<any, any>>
type PopupProps = ComponentProps<typeof Combobox.Popup>

function Basic({ root, content, empty = "No items found.", children }: { root?: Partial<RootProps>; content?: Partial<PopupProps>; empty?: string; children?: ComponentChildren }) {
  return (
    <div>
      <button type="button">outside</button>
      <Combobox.Root items={frameworks} {...root}>
        <Combobox.Input placeholder="Select a framework" />
        <Combobox.Trigger aria-label="Toggle" />
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={6} align="start">
            <Combobox.Popup data-testid="popup" {...content}>
              <Combobox.Empty>{empty}</Combobox.Empty>
              <Combobox.List>
                {(item: string) => (
                  <Combobox.Item key={item} value={item}>
                    {item}
                    <Combobox.ItemIndicator data-testid="indicator">✓</Combobox.ItemIndicator>
                  </Combobox.Item>
                )}
              </Combobox.List>
              {children}
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    </div>
  )
}

const input = () => screen.getByRole("combobox") as HTMLInputElement
const options = () => screen.queryAllByRole("option")
const labels = () => options().map((option) => option.textContent?.replace("✓", ""))
const highlighted = () => options().filter((option) => option.hasAttribute("data-highlighted")).map((option) => option.textContent?.replace("✓", ""))
const hiddenInput = () => document.querySelector<HTMLInputElement>('input[aria-hidden="true"]')!

useFakeTimers()

async function open(user = setupUser()) {
  await user.click(input())
  await flush(50)
  return user
}

describe("closed", () => {
  test("the input is the combobox and nothing else is rendered yet", () => {
    render(<Basic />)
    expect(input().tagName).toBe("INPUT")
    expect(input().getAttribute("aria-expanded")).toBe("false")
    expect(input().getAttribute("aria-haspopup")).toBe("listbox")
    expect(input().getAttribute("aria-autocomplete")).toBe("list")
    expect(input().getAttribute("autocomplete")).toBe("off")
    expect(input().hasAttribute("aria-controls")).toBe(false)
    expect(input().hasAttribute("aria-activedescendant")).toBe(false)
    expect(input().hasAttribute("data-popup-open")).toBe(false)
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(document.querySelector("[data-base-ui-portal]")).toBeNull()
  })

  test("the trigger is a plain button that stays out of the tab order and has no stray id", () => {
    render(<Basic />)
    const trigger = screen.getByRole("button", { name: "Toggle" })
    expect(trigger.getAttribute("type")).toBe("button")
    expect(trigger.getAttribute("tabindex")).toBe("-1")
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox")
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
    expect(trigger.hasAttribute("role")).toBe(false)
    expect(trigger.hasAttribute("id")).toBe(false)
    expect(trigger.hasAttribute("data-popup-open")).toBe(false)
    expect(trigger.hasAttribute("data-placeholder")).toBe(true)
  })

  test("spellcheck and autocorrect are off where the browser reflects them as properties", () => {
    // Preact writes a prop through the property when the element has one, and `"false"` or `"off"` would read as true there
    const restore = [defineBrowserProperty("spellcheck", ["true", "false"]), defineBrowserProperty("autocorrect", ["on", "off"])]
    render(<Basic />)
    restore.forEach((undo) => undo())
    expect(input().getAttribute("spellcheck")).toBe("false")
    expect(input().getAttribute("autocorrect")).toBe("off")
  })

  test("generated ids carry the base-ui prefix and the parts derive theirs from the root's", async () => {
    render(<Basic />)
    expect(input().id).toMatch(/^base-ui-/)
    expect(hiddenInput().id).toBe(`${input().id}-hidden-input`)
    await open()
    for (const [i, option] of options().entries()) expect(option.id).toBe(`${input().id}-${i}`)
  })

  test("a hidden input mirrors the selected value", () => {
    render(<Basic root={{ defaultValue: "Remix" }} />)
    expect(input().value).toBe("Remix")
    expect(hiddenInput().value).toBe("Remix")
    expect(hiddenInput().hasAttribute("name")).toBe(false)
    expect(hiddenInput().tabIndex).toBe(-1)
  })
})

describe("opening and closing", () => {
  test("pressing the input opens the popup in a portal with the listbox wiring", async () => {
    const { container } = render(<Basic />)
    await open()
    const list = screen.getByRole("listbox")
    expect(container.contains(list)).toBe(false)
    expect(list.closest("[data-base-ui-portal]")?.parentElement).toBe(document.body)
    expect(input().getAttribute("aria-expanded")).toBe("true")
    expect(input().getAttribute("aria-controls")).toBe(list.id)
    expect(input().hasAttribute("data-popup-open")).toBe(true)
    expect(input().hasAttribute("data-pressed")).toBe(true)
    expect(input().getAttribute("data-popup-side")).toBe("bottom")
    expect(labels()).toEqual(frameworks)
    // nothing is highlighted until the user navigates, and focus stays in the input
    expect(input().hasAttribute("aria-activedescendant")).toBe(false)
    expect(document.activeElement).toBe(input())
    for (const [i, option] of options().entries()) {
      expect(option.getAttribute("aria-selected")).toBe("false")
      expect(option.id).toBe(`${option.id.slice(0, option.id.lastIndexOf("-"))}-${i}`)
    }
  })

  test("the popup and positioner carry the open state and the side they were placed on", async () => {
    render(<Basic />)
    await open()
    const popup = screen.getByTestId("popup")
    const positioner = popup.parentElement!
    expect(popup.hasAttribute("data-open")).toBe(true)
    expect(popup.getAttribute("data-side")).toBe("bottom")
    expect(popup.getAttribute("data-align")).toBe("start")
    expect(popup.getAttribute("role")).toBe("presentation")
    expect(popup.hasAttribute("data-base-ui-focusable")).toBe(true)
    expect(positioner.getAttribute("role")).toBe("presentation")
    expect(positioner.hasAttribute("data-open")).toBe(true)
    expect(positioner.getAttribute("data-side")).toBe("bottom")
    expect(positioner.style.getPropertyValue("--anchor-width")).toBe("0px")
    expect(positioner.style.getPropertyValue("--available-height")).not.toBe("")
    expect(positioner.style.getPropertyValue("--transform-origin")).not.toBe("")
    expect(positioner.style.position).toBe("absolute")
  })

  test("the trigger toggles the popup and gives the focus to the input", async () => {
    render(<Basic />)
    const user = setupUser()
    const trigger = screen.getByRole("button", { name: "Toggle" })
    await user.click(trigger)
    await flush(50)
    expect(screen.getByRole("listbox")).toBeTruthy()
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(trigger.hasAttribute("data-pressed")).toBe(true)
    expect(document.activeElement).toBe(input())
    await user.click(trigger)
    await flush(50)
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
  })

  test("Escape closes the popup, a second Escape clears the selection", async () => {
    render(<Basic root={{ defaultValue: "Remix" }} />)
    const user = await open()
    await user.keyboard("{Escape}")
    await flush(50)
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(input().value).toBe("Remix")
    await user.keyboard("{Escape}")
    await flush(50)
    expect(input().value).toBe("")
    expect(hiddenInput().value).toBe("")
  })

  test("a press outside closes it, a press on the input keeps it open", async () => {
    render(<Basic />)
    const user = await open()
    await user.click(input())
    await flush(50)
    expect(screen.getByRole("listbox")).toBeTruthy()
    await user.click(screen.getByText("outside"))
    await flush(50)
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  test("moving the focus out of the combobox closes it", async () => {
    render(<Basic />)
    const user = await open()
    await user.tab()
    await flush(50)
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  test("a disabled combobox does not open", async () => {
    render(<Basic root={{ disabled: true }} />)
    const user = setupUser()
    expect(input().disabled).toBe(true)
    expect(input().hasAttribute("data-disabled")).toBe(true)
    await user.click(input())
    await user.click(screen.getByRole("button", { name: "Toggle" }))
    await flush(50)
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  test("calls onOpenChange with the reason, and a cancelled change keeps the state", async () => {
    // moving the focus to the button that was pressed is a request to close as well
    const onOpenChange = vi.fn((_open: boolean, details: { reason: string; cancel(): void }) => ["outside-press", "focus-out"].includes(details.reason) && details.cancel())
    render(<Basic root={{ onOpenChange }} />)
    const user = await open()
    expect(onOpenChange).toHaveBeenLastCalledWith(true, expect.objectContaining({ reason: "input-press" }))
    await user.click(screen.getByText("outside"))
    await flush(50)
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.objectContaining({ reason: "outside-press" }))
    expect(screen.getByRole("listbox")).toBeTruthy()
    await user.keyboard("{Escape}")
    await flush(50)
    expect(onOpenChange).toHaveBeenLastCalledWith(false, expect.objectContaining({ reason: "escape-key" }))
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  test("open can be controlled", async () => {
    function Controlled() {
      const [open, setOpen] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setOpen(false)}>
            close
          </button>
          <Basic root={{ open, onOpenChange: setOpen }} />
        </>
      )
    }
    render(<Controlled />)
    await flush(50)
    expect(screen.getByRole("listbox")).toBeTruthy()
    await act(() => void fireEvent.click(screen.getByText("close")))
    await flush(50)
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  test("the popup stays mounted while its exit animation runs", async () => {
    const real = window.getComputedStyle.bind(window)
    vi.spyOn(window, "getComputedStyle").mockImplementation((node, pseudo) => {
      return new Proxy(real(node, pseudo), {
        get(style, prop) {
          if (prop === "animationName") return (node as HTMLElement).hasAttribute("data-closed") ? "fade-out" : "fade-in"
          const value = Reflect.get(style, prop)
          return typeof value === "function" ? value.bind(style) : value
        },
      })
    })
    render(<Basic />)
    const user = await open()
    await user.keyboard("{Escape}")
    await flush(50)
    const popup = screen.getByTestId("popup")
    expect(popup.hasAttribute("data-closed")).toBe(true)
    expect(popup.hasAttribute("data-open")).toBe(false)
    expect(input().getAttribute("aria-expanded")).toBe("false")
    act(() => void popup.dispatchEvent(Object.assign(new Event("animationend", { bubbles: true }), { animationName: "fade-out" })))
    await flush(50)
    expect(screen.queryByTestId("popup")).toBeNull()
  })
})

describe("assistive technology", () => {
  const outside = () => screen.getByText("outside")
  const toggle = () => screen.getByText("outside").closest("div")!.querySelector<HTMLElement>('[aria-label="Toggle"]')!

  test("an open popup hides the rest of the page, the input, the popup and the dismiss button stay", async () => {
    render(
      <>
        <Basic />
        <div aria-live="polite">
          <span>saved</span>
        </div>
      </>
    )
    await open()
    expect(outside().getAttribute("aria-hidden")).toBe("true")
    expect(toggle().getAttribute("aria-hidden")).toBe("true")
    expect(screen.queryByRole("button", { name: "outside" })).toBeNull()
    expect(input().hasAttribute("aria-hidden")).toBe(false)
    expect(screen.getByRole("listbox")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy()
    // a live region keeps announcing
    expect(screen.getByText("saved").closest("[aria-hidden]")).toBeNull()
  })

  test("closing gives the page back, and what the page hid itself stays hidden", async () => {
    render(
      <>
        <Basic />
        <p aria-hidden="true">decoration</p>
      </>
    )
    const user = await open()
    await user.keyboard("{Escape}")
    await flush(50)
    expect(outside().hasAttribute("aria-hidden")).toBe(false)
    expect(toggle().hasAttribute("aria-hidden")).toBe(false)
    expect(screen.getByRole("button", { name: "outside" })).toBeTruthy()
    expect(screen.getByText("decoration").getAttribute("aria-hidden")).toBe("true")
  })

  test("with the input in the popup the page stays available, like a non-modal popover", async () => {
    render(
      <>
        <button type="button">outside</button>
        <Combobox.Root items={frameworks}>
          <Combobox.Trigger aria-label="Open" />
          <Combobox.Portal>
            <Combobox.Positioner>
              <Combobox.Popup>
                <Combobox.Input aria-label="Search" />
                <Combobox.List>{(item: string) => <Combobox.Item key={item} value={item}>{item}</Combobox.Item>}</Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </Combobox.Root>
      </>
    )
    const user = setupUser()
    await user.click(screen.getByRole("combobox"))
    await flush(50)
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(screen.getByRole("button", { name: "outside" })).toBeTruthy()
  })
})

describe("filtering", () => {
  test("typing opens the popup and filters ignoring case and accents", async () => {
    render(<Basic root={{ items: ["Café", "Cafe Latte", "Tea"] }} />)
    const user = setupUser()
    await user.click(input())
    await user.keyboard("CAF")
    await flush(50)
    expect(labels()).toEqual(["Café", "Cafe Latte"])
    expect(input().value).toBe("CAF")
  })

  test("typing into a closed combobox opens it", async () => {
    render(<Basic />)
    const user = setupUser()
    input().focus()
    await user.keyboard("re")
    await flush(50)
    expect(input().getAttribute("aria-expanded")).toBe("true")
    expect(labels()).toEqual(["Remix"])
  })

  test("nothing matching shows the empty message and flags the empty state", async () => {
    render(<Basic />)
    const user = await open()
    expect(screen.getByRole("status").textContent).toBe("")
    await user.keyboard("zzz")
    await flush(50)
    const status = screen.getByRole("status")
    expect(status.textContent).toBe("No items found.")
    expect(status.getAttribute("aria-live")).toBe("polite")
    expect(status.getAttribute("aria-atomic")).toBe("true")
    expect(options()).toEqual([])
    expect(screen.getByRole("listbox").hasAttribute("data-empty")).toBe(true)
    expect(screen.getByTestId("popup").hasAttribute("data-empty")).toBe(true)
    expect(input().hasAttribute("data-list-empty")).toBe(true)
    await user.keyboard("{Backspace}{Backspace}{Backspace}")
    await flush(50)
    expect(screen.getByRole("status").textContent).toBe("")
    expect(labels()).toEqual(frameworks)
  })

  test("the label of the selection does not filter the list", async () => {
    render(<Basic root={{ defaultValue: "Remix" }} />)
    await open()
    expect(labels()).toEqual(frameworks)
  })

  test("a custom filter, or none, decides what is shown", async () => {
    const { unmount } = render(<Basic root={{ filter: (item: string, query: string) => item.startsWith(query) }} />)
    const user = setupUser()
    await user.click(input())
    await user.keyboard("re")
    await flush(50)
    expect(labels()).toEqual([])
    unmount()
    render(<Basic root={{ filter: null }} />)
    await user.click(input())
    await user.keyboard("zzz")
    await flush(50)
    expect(labels()).toEqual(frameworks)
  })

  test("grouped items drop the groups that have no match", async () => {
    const groups = [
      { value: "Americas", items: ["New York", "Toronto"] },
      { value: "Europe", items: ["Paris", "Berlin"] },
    ]
    render(
      <Combobox.Root items={groups}>
        <Combobox.Input />
        <Combobox.Portal>
          <Combobox.Positioner>
            <Combobox.Popup>
              <Combobox.List>
                {(group: (typeof groups)[number]) => (
                  <Combobox.Group key={group.value} items={group.items} data-testid={group.value}>
                    <Combobox.GroupLabel>{group.value}</Combobox.GroupLabel>
                    <Combobox.Collection>
                      {(item: string) => (
                        <Combobox.Item key={item} value={item}>
                          {item}
                        </Combobox.Item>
                      )}
                    </Combobox.Collection>
                    <Combobox.Separator data-testid="separator" />
                  </Combobox.Group>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    )
    const user = await open()
    expect(screen.getAllByRole("group").map((group) => group.getAttribute("data-testid"))).toEqual(["Americas", "Europe"])
    const europe = screen.getByTestId("Europe")
    const label = europe.firstElementChild!
    expect(europe.getAttribute("aria-labelledby")).toBe(label.id)
    expect(label.getAttribute("aria-hidden")).toBe("true")
    expect(screen.getAllByTestId("separator")[0]!.getAttribute("role")).toBe("presentation")
    await user.keyboard("par")
    await flush(50)
    expect(screen.getAllByRole("group").map((group) => group.getAttribute("data-testid"))).toEqual(["Europe"])
    expect(labels()).toEqual(["Paris"])
  })
})

describe("keyboard", () => {
  test("ArrowDown opens the popup on the first enabled item, ArrowUp on the last", async () => {
    const { unmount } = render(<Basic />)
    const user = setupUser()
    input().focus()
    await user.keyboard("{ArrowDown}")
    await flush(50)
    expect(highlighted()).toEqual(["Next.js"])
    expect(input().getAttribute("aria-activedescendant")).toBe(options()[0]!.id)
    unmount()
    render(<Basic />)
    input().focus()
    await user.keyboard("{ArrowUp}")
    await flush(50)
    expect(highlighted()).toEqual(["Astro"])
  })

  test("the arrow keys move the highlight and leave the list at both ends", async () => {
    render(<Basic />)
    const user = await open()
    await user.keyboard("{ArrowDown}")
    expect(highlighted()).toEqual(["Next.js"])
    await user.keyboard("{ArrowDown}{ArrowDown}")
    expect(highlighted()).toEqual(["Nuxt.js"])
    await user.keyboard("{ArrowUp}")
    expect(highlighted()).toEqual(["SvelteKit"])
    await user.keyboard("{ArrowUp}{ArrowUp}")
    // past the first item the highlight goes back to the input, and the next ArrowUp enters at the end
    expect(highlighted()).toEqual([])
    expect(input().hasAttribute("aria-activedescendant")).toBe(false)
    await user.keyboard("{ArrowUp}")
    expect(highlighted()).toEqual(["Astro"])
    await user.keyboard("{ArrowDown}")
    expect(highlighted()).toEqual([])
    await user.keyboard("{ArrowDown}")
    expect(highlighted()).toEqual(["Next.js"])
  })

  test("with autoHighlight the highlight wraps around instead of leaving the list", async () => {
    render(<Basic root={{ autoHighlight: true }} />)
    const user = await open()
    await user.keyboard("{ArrowDown}")
    await user.keyboard("{ArrowUp}")
    expect(highlighted()).toEqual(["Astro"])
    await user.keyboard("{ArrowDown}")
    expect(highlighted()).toEqual(["Next.js"])
  })

  test("Home and End move the caret and leave the highlight alone", async () => {
    render(<Basic />)
    const user = await open()
    await user.keyboard("re")
    await user.keyboard("{ArrowDown}{Home}")
    expect(input().selectionStart).toBe(0)
    expect(highlighted()).toEqual(["Remix"])
    await user.keyboard("{End}")
    expect(input().selectionStart).toBe(2)
    expect(highlighted()).toEqual(["Remix"])
  })

  test("the highlight follows the pointer and goes when it leaves", async () => {
    render(<Basic />)
    const user = await open()
    await user.hover(options()[3]!)
    expect(highlighted()).toEqual(["Remix"])
    expect(input().getAttribute("aria-activedescendant")).toBe(options()[3]!.id)
    await user.unhover(options()[3]!)
    expect(highlighted()).toEqual([])
  })

  test("Enter picks the highlighted item, closes the popup and shows its label", async () => {
    const onValueChange = vi.fn()
    render(<Basic root={{ onValueChange }} />)
    const user = await open()
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}")
    await flush(50)
    expect(onValueChange).toHaveBeenCalledWith("SvelteKit", expect.objectContaining({ reason: "item-press" }))
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(input().value).toBe("SvelteKit")
    expect(hiddenInput().value).toBe("SvelteKit")
    expect(document.activeElement).toBe(input())
  })

  test("Enter without a highlight closes the popup and lets the form submit", async () => {
    const onSubmit = vi.fn((event: Event) => event.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <Basic />
        <button type="submit">send</button>
      </form>
    )
    const user = await open()
    await user.keyboard("{Enter}")
    await flush(50)
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  test("Enter on a highlighted item does not submit the form", async () => {
    const onSubmit = vi.fn((event: Event) => event.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <Basic />
        <button type="submit">send</button>
      </form>
    )
    const user = await open()
    await user.keyboard("{ArrowDown}{Enter}")
    await flush(50)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  test("autoHighlight highlights the first match while typing", async () => {
    render(<Basic root={{ autoHighlight: true }} />)
    const user = await open()
    expect(highlighted()).toEqual([])
    await user.keyboard("re")
    await flush(50)
    expect(highlighted()).toEqual(["Remix"])
    await user.keyboard("{Enter}")
    await flush(50)
    expect(input().value).toBe("Remix")
  })

  test("typing takes the highlight back to the input", async () => {
    render(<Basic />)
    const user = await open()
    await user.keyboard("{ArrowDown}")
    expect(highlighted()).toEqual(["Next.js"])
    await user.keyboard("n")
    await flush(50)
    expect(highlighted()).toEqual([])
    expect(input().hasAttribute("aria-activedescendant")).toBe(false)
  })
})

describe("selection", () => {
  test("clicking an item selects it, marks it and closes the popup", async () => {
    render(<Basic />)
    const user = await open()
    await user.click(options()[2]!)
    await flush(50)
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(input().value).toBe("Nuxt.js")
    expect(document.activeElement).toBe(input())
    expect(screen.getByRole("button", { name: "Toggle" }).hasAttribute("data-placeholder")).toBe(false)
  })

  test("reopening highlights the selected item, which is marked and indicated", async () => {
    render(<Basic root={{ defaultValue: "Remix" }} />)
    await open()
    const remix = options()[3]!
    expect(remix.getAttribute("aria-selected")).toBe("true")
    expect(remix.hasAttribute("data-selected")).toBe(true)
    expect(remix.hasAttribute("data-highlighted")).toBe(true)
    expect(input().getAttribute("aria-activedescendant")).toBe(remix.id)
    expect(screen.getAllByTestId("indicator")).toHaveLength(1)
    expect(screen.getByTestId("indicator").getAttribute("aria-hidden")).toBe("true")
    expect(remix.contains(screen.getByTestId("indicator"))).toBe(true)
  })

  test("reopening after a search highlights the item that was picked", async () => {
    render(<Basic />)
    const user = await open()
    await user.keyboard("re{ArrowDown}{Enter}")
    await flush(50)
    expect(input().value).toBe("Remix")
    await user.click(input())
    await flush(50)
    expect(labels()).toEqual(frameworks)
    expect(highlighted()).toEqual(["Remix"])
    expect(input().getAttribute("aria-activedescendant")).toBe(options()[3]!.id)
  })

  test("the selected item is scrolled into view on open", async () => {
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    render(<Basic root={{ defaultValue: "Astro" }} />)
    await open()
    expect(scrollIntoView).toHaveBeenCalled()
    expect((scrollIntoView.mock.contexts.at(-1) as HTMLElement).textContent).toContain("Astro")
  })

  test("typing a query and closing restores the label of the selection", async () => {
    render(<Basic root={{ defaultValue: "Remix" }} />)
    const user = await open()
    input().setSelectionRange(0, 5)
    await user.keyboard("nu")
    await flush(50)
    expect(labels()).toEqual(["Nuxt.js"])
    await user.keyboard("{Escape}")
    await flush(50)
    expect(input().value).toBe("Remix")
  })

  test("emptying the input clears a single selection", async () => {
    const onValueChange = vi.fn()
    render(<Basic root={{ defaultValue: "Remix", onValueChange }} />)
    const user = setupUser()
    await user.click(input())
    await user.clear(input())
    await flush(50)
    expect(onValueChange).toHaveBeenLastCalledWith(null, expect.objectContaining({ reason: "input-clear" }))
    expect(hiddenInput().value).toBe("")
  })

  test("value and input value can be controlled", async () => {
    const onValueChange = vi.fn()
    const { rerender } = render(<Basic root={{ value: "Remix", onValueChange }} />)
    expect(input().value).toBe("Remix")
    const user = await open()
    await user.click(options()[0]!)
    await flush(50)
    // controlled: the request is reported but the value stays until the parent changes it
    expect(onValueChange).toHaveBeenCalledWith("Next.js", expect.anything())
    expect(hiddenInput().value).toBe("Remix")
    rerender(<Basic root={{ value: "Astro", onValueChange }} />)
    await flush(50)
    expect(hiddenInput().value).toBe("Astro")
    expect(input().value).toBe("Astro")
  })

  test("a controlled input value is reported and shown", async () => {
    function Controlled() {
      const [text, setText] = useState("")
      return (
        <>
          <output data-testid="text">{text}</output>
          <Basic root={{ inputValue: text, onInputValueChange: setText }} />
        </>
      )
    }
    render(<Controlled />)
    const user = setupUser()
    await user.click(input())
    await user.keyboard("re")
    await flush(50)
    expect(screen.getByTestId("text").textContent).toBe("re")
    expect(input().value).toBe("re")
    expect(labels()).toEqual(["Remix"])
  })

  test("a cancelled input change is reverted", async () => {
    render(<Basic root={{ inputValue: "", onInputValueChange: (_value: string, details: { cancel(): void }) => details.cancel() }} />)
    const user = setupUser()
    await user.click(input())
    await user.keyboard("a")
    await flush(50)
    expect(input().value).toBe("")
  })

  test("a cancelled selection is not applied", async () => {
    render(<Basic root={{ onValueChange: (_value: unknown, details: { cancel(): void }) => details.cancel() }} />)
    const user = await open()
    await user.click(options()[1]!)
    await flush(50)
    expect(input().value).toBe("")
    expect(hiddenInput().value).toBe("")
  })

  test("a disabled item can be highlighted but not picked", async () => {
    render(
      <Combobox.Root items={frameworks}>
        <Combobox.Input />
        <Combobox.Portal>
          <Combobox.Positioner>
            <Combobox.Popup>
              <Combobox.List>
                {(item: string) => (
                  <Combobox.Item key={item} value={item} disabled={item === "SvelteKit"}>
                    {item}
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    )
    const user = await open()
    const disabled = options()[1]!
    expect(disabled.getAttribute("aria-disabled")).toBe("true")
    expect(disabled.hasAttribute("data-disabled")).toBe(true)
    await user.keyboard("{ArrowDown}{ArrowDown}")
    expect(highlighted()).toEqual(["SvelteKit"])
    await user.keyboard("{Enter}")
    await user.click(disabled)
    await flush(50)
    expect(screen.getByRole("listbox")).toBeTruthy()
    expect(input().value).toBe("")
  })

  test("ArrowDown opens on the first item that is not disabled", async () => {
    render(
      <Combobox.Root items={frameworks}>
        <Combobox.Input />
        <Combobox.Portal>
          <Combobox.Positioner>
            <Combobox.Popup>
              <Combobox.List>
                {(item: string) => (
                  <Combobox.Item key={item} value={item} disabled={item === "Next.js"}>
                    {item}
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    )
    const user = setupUser()
    input().focus()
    await user.keyboard("{ArrowDown}")
    await flush(50)
    expect(highlighted()).toEqual(["SvelteKit"])
  })

  test("object values show their label, submit their value and compare with isItemEqualToValue", async () => {
    const countries = [
      { value: "de", label: "Germany" },
      { value: "fr", label: "France" },
    ]
    render(
      <Combobox.Root items={countries} defaultValue={{ value: "fr", label: "France" }} isItemEqualToValue={(item: any, value: any) => item.value === value.value} name="country">
        <Combobox.Input />
        <Combobox.Portal>
          <Combobox.Positioner>
            <Combobox.Popup>
              <Combobox.List>
                {(country: (typeof countries)[number]) => (
                  <Combobox.Item key={country.value} value={country}>
                    {country.label}
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    )
    expect(input().value).toBe("France")
    expect(hiddenInput().name).toBe("country")
    expect(hiddenInput().value).toBe("fr")
    const user = await open()
    expect(options()[1]!.getAttribute("aria-selected")).toBe("true")
    await user.click(options()[0]!)
    await flush(50)
    expect(input().value).toBe("Germany")
    expect(hiddenInput().value).toBe("de")
  })

  test("itemToStringLabel and itemToStringValue override the defaults", async () => {
    const people = [{ id: 1, name: "Ada" }]
    render(
      <Combobox.Root items={people} itemToStringLabel={(person: any) => person.name} itemToStringValue={(person: any) => String(person.id)} name="person" defaultValue={people[0]}>
        <Combobox.Input />
      </Combobox.Root>
    )
    expect(input().value).toBe("Ada")
    expect(hiddenInput().value).toBe("1")
  })

  test("Value shows the label, a placeholder or what a function makes of the selection", () => {
    function Probe({ value }: { value: string | null }) {
      return (
        <Combobox.Root items={[{ value: "a", label: "Alpha" }]} value={value}>
          <Combobox.Value placeholder="Pick one" data-testid="value" />
          <Combobox.Value>{(selected: string | null) => <i data-testid="fn">{String(selected)}</i>}</Combobox.Value>
        </Combobox.Root>
      )
    }
    const { rerender } = render(<Probe value={null} />)
    expect(document.body.textContent).toContain("Pick one")
    expect(screen.getByTestId("fn").textContent).toBe("null")
    rerender(<Probe value="a" />)
    expect(document.body.textContent).toContain("Alpha")
    expect(screen.getByTestId("fn").textContent).toBe("a")
  })
})

describe("clear", () => {
  function WithClear({ root }: { root?: Partial<RootProps> }) {
    return (
      <Combobox.Root items={frameworks} {...root}>
        <Combobox.Input />
        <Combobox.Clear data-testid="clear" />
      </Combobox.Root>
    )
  }

  test("is only rendered while there is a value, and clears it", async () => {
    const onValueChange = vi.fn()
    const { unmount } = render(<WithClear />)
    expect(screen.queryByTestId("clear")).toBeNull()
    unmount()
    render(<WithClear root={{ defaultValue: "Remix", onValueChange }} />)
    const clear = screen.getByTestId("clear")
    expect(clear.tagName).toBe("BUTTON")
    expect(clear.getAttribute("type")).toBe("button")
    expect(clear.getAttribute("tabindex")).toBe("-1")
    expect(clear.hasAttribute("data-visible")).toBe(true)
    expect(clear.textContent).toBe("x")
    const user = setupUser()
    await user.click(clear)
    await flush(50)
    expect(onValueChange).toHaveBeenCalledWith(null, expect.objectContaining({ reason: "clear-press" }))
    expect(input().value).toBe("")
    expect(screen.queryByTestId("clear")).toBeNull()
    expect(document.activeElement).toBe(input())
  })
})

describe("multiple", () => {
  function Chips({ root, anchorRef }: { root?: Partial<RootProps>; anchorRef?: { current: HTMLDivElement | null } }) {
    return (
      <Combobox.Root multiple items={frameworks} defaultValue={["Next.js"]} {...root}>
        <Combobox.Chips ref={anchorRef} data-testid="chips">
          <Combobox.Value>
            {(values: string[]) => (
              <>
                {values.map((value) => (
                  <Combobox.Chip key={value} data-testid={`chip-${value}`}>
                    {value}
                    <Combobox.ChipRemove aria-label={`Remove ${value}`} />
                  </Combobox.Chip>
                ))}
                <Combobox.Input data-testid="chip-input" />
              </>
            )}
          </Combobox.Value>
        </Combobox.Chips>
        <Combobox.Portal>
          <Combobox.Positioner anchor={anchorRef}>
            <Combobox.Popup>
              <Combobox.List>
                {(item: string) => (
                  <Combobox.Item key={item} value={item}>
                    {item}
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
    )
  }

  const chips = () => [...screen.getByTestId("chips").querySelectorAll("[data-testid^=chip-]:not(input):not(button)")].map((chip) => chip.textContent)

  test("renders a chip per value in a toolbar, with a remove button each", () => {
    render(<Chips root={{ defaultValue: ["Next.js", "Remix"] }} />)
    expect(screen.getByTestId("chips").getAttribute("role")).toBe("toolbar")
    expect(chips()).toEqual(["Next.js", "Remix"])
    const chip = screen.getByTestId("chip-Next.js")
    expect(chip.getAttribute("tabindex")).toBe("-1")
    const remove = screen.getByRole("button", { name: "Remove Next.js" })
    expect(remove.getAttribute("type")).toBe("button")
    expect(remove.getAttribute("tabindex")).toBe("-1")
    expect(remove.getAttribute("aria-disabled")).toBe("false")
    expect(screen.getByTestId("chip-input").getAttribute("aria-expanded")).toBe("false")
  })

  test("the chips container has no role while nothing is selected", () => {
    render(<Chips root={{ defaultValue: [] }} />)
    expect(screen.getByTestId("chips").hasAttribute("role")).toBe(false)
  })

  test("items toggle, the popup stays open and the list is marked multiselectable", async () => {
    const onValueChange = vi.fn()
    render(<Chips root={{ onValueChange }} />)
    const user = setupUser()
    await user.click(screen.getByTestId("chip-input"))
    await flush(50)
    expect(screen.getByRole("listbox").getAttribute("aria-multiselectable")).toBe("true")
    expect(options()[0]!.getAttribute("aria-selected")).toBe("true")
    // the selected item is where the highlight starts
    expect(highlighted()).toEqual(["Next.js"])
    await user.click(options()[3]!)
    await flush(50)
    expect(onValueChange).toHaveBeenLastCalledWith(["Next.js", "Remix"], expect.anything())
    expect(chips()).toEqual(["Next.js", "Remix"])
    expect(screen.getByRole("listbox")).toBeTruthy()
    await user.click(options()[0]!)
    await flush(50)
    expect(chips()).toEqual(["Remix"])
  })

  test("picking after a search closes the popup and clears the search", async () => {
    render(<Chips />)
    const user = setupUser()
    await user.click(screen.getByTestId("chip-input"))
    await user.keyboard("re")
    await flush(50)
    expect(labels()).toEqual(["Remix"])
    await user.keyboard("{ArrowDown}{Enter}")
    await flush(50)
    expect(chips()).toEqual(["Next.js", "Remix"])
    expect(screen.queryByRole("listbox")).toBeNull()
    expect((screen.getByTestId("chip-input") as HTMLInputElement).value).toBe("")
  })

  test("Backspace in the empty input removes the last chip", async () => {
    render(<Chips root={{ defaultValue: ["Next.js", "Remix"] }} />)
    const user = setupUser()
    await user.click(screen.getByTestId("chip-input"))
    await user.keyboard("{Backspace}")
    await flush(50)
    expect(chips()).toEqual(["Next.js"])
    expect(document.activeElement).toBe(screen.getByTestId("chip-input"))
  })

  test("ArrowLeft at the start of the input moves to the last chip, the arrow keys then move between chips", async () => {
    render(<Chips root={{ defaultValue: ["Next.js", "Remix", "Astro"] }} />)
    const user = setupUser()
    await user.click(screen.getByTestId("chip-input"))
    await user.keyboard("{Escape}")
    await user.keyboard("{ArrowLeft}")
    expect(document.activeElement).toBe(screen.getByTestId("chip-Astro"))
    await user.keyboard("{ArrowLeft}")
    expect(document.activeElement).toBe(screen.getByTestId("chip-Remix"))
    await user.keyboard("{ArrowRight}{ArrowRight}")
    // past the last chip the input takes the focus back
    expect(document.activeElement).toBe(screen.getByTestId("chip-input"))
  })

  test("Backspace on a chip removes it and focuses the next one, or the previous one at the end", async () => {
    render(<Chips root={{ defaultValue: ["Next.js", "Remix", "Astro"] }} />)
    const user = setupUser()
    screen.getByTestId("chip-Remix").focus()
    await user.keyboard("{Backspace}")
    await flush(50)
    expect(chips()).toEqual(["Next.js", "Astro"])
    expect(document.activeElement).toBe(screen.getByTestId("chip-Astro"))
    await user.keyboard("{Backspace}")
    await flush(50)
    expect(chips()).toEqual(["Next.js"])
    expect(document.activeElement).toBe(screen.getByTestId("chip-Next.js"))
    await user.keyboard("{Delete}")
    await flush(50)
    expect(chips()).toEqual([])
    expect(document.activeElement).toBe(screen.getByTestId("chip-input"))
  })

  test("the remove button removes its chip and returns the focus to the input", async () => {
    const onValueChange = vi.fn()
    render(<Chips root={{ defaultValue: ["Next.js", "Remix"], onValueChange }} />)
    const user = setupUser()
    await user.click(screen.getByRole("button", { name: "Remove Next.js" }))
    await flush(50)
    expect(onValueChange).toHaveBeenCalledWith(["Remix"], expect.objectContaining({ reason: "chip-remove-press" }))
    expect(chips()).toEqual(["Remix"])
    expect(document.activeElement).toBe(screen.getByTestId("chip-input"))
    // the press must not open the popup behind it
    expect(screen.queryByRole("listbox")).toBeNull()
  })

  test("a disabled combobox disables its chips", () => {
    render(<Chips root={{ disabled: true }} />)
    expect(screen.getByTestId("chip-Next.js").getAttribute("aria-disabled")).toBe("true")
    expect(screen.getByTestId("chip-Next.js").hasAttribute("data-disabled")).toBe(true)
    expect(screen.getByRole("button", { name: "Remove Next.js" }).getAttribute("aria-disabled")).toBe("true")
    expect((screen.getByTestId("chip-input") as HTMLInputElement).disabled).toBe(true)
  })

  test("pressing the container opens the popup, anchored to it", async () => {
    function Anchored() {
      const ref = useRef<HTMLDivElement | null>(null)
      return <Chips anchorRef={ref} />
    }
    render(<Anchored />)
    const user = setupUser()
    await user.click(screen.getByTestId("chips"))
    await flush(50)
    expect(screen.getByRole("listbox")).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByTestId("chip-input"))
  })

  test("submits one hidden input per value", () => {
    render(<Chips root={{ name: "frameworks", defaultValue: ["Next.js", "Remix"] }} />)
    const hidden = [...document.querySelectorAll<HTMLInputElement>('input[type="hidden"][name="frameworks"]')]
    expect(hidden.map((field) => field.value)).toEqual(["Next.js", "Remix"])
  })
})

describe("render prop", () => {
  // the input props are not narrowed, which Preact 11 would ask for
  const Field = forwardRef<any>((props, ref) => <input data-field="" {...props} ref={ref} />)
  const Pill = (props: ComponentProps<"button">) => <button data-pill="" {...props} />

  test("an element is cloned with the part's props, its own props and className win or merge", async () => {
    const onClick = vi.fn()
    render(
      <Combobox.Root items={frameworks}>
        <Combobox.Input render={<Field className="own" placeholder="mine" disabled={false} />} className="extra" />
        <Combobox.Trigger render={<Pill className="pill" onClick={onClick} />} aria-label="Toggle">
          <span>icon</span>
        </Combobox.Trigger>
      </Combobox.Root>
    )
    const field = input()
    expect(field.hasAttribute("data-field")).toBe(true)
    expect(field.getAttribute("role")).toBe("combobox")
    expect(field.getAttribute("placeholder")).toBe("mine")
    expect(field.className.split(" ").sort()).toEqual(["extra", "own"])
    const user = setupUser()
    const pill = screen.getByRole("button", { name: "Toggle" })
    expect(pill.hasAttribute("data-pill")).toBe(true)
    expect(pill.className.split(" ")).toContain("pill")
    expect(pill.textContent).toBe("icon")
    // both the element's own handler and the part's run
    await user.click(pill)
    await flush(50)
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(pill.getAttribute("aria-expanded")).toBe("true")
  })

  test("the refs of the render element and of the part both receive the node", () => {
    const own = { current: null as HTMLInputElement | null }
    const outer = { current: null as HTMLInputElement | null }
    render(
      <Combobox.Root items={frameworks}>
        <Combobox.Input render={<Field ref={own} />} ref={outer} />
      </Combobox.Root>
    )
    expect(own.current).toBe(input())
    expect(outer.current).toBe(input())
  })

  test("a function receives the merged props and the state", () => {
    const seen = vi.fn()
    render(
      <Combobox.Root items={frameworks} defaultValue="Remix">
        <Combobox.Clear
          render={(props: any, state: unknown) => {
            seen(state)
            return <a {...props} data-custom="" />
          }}
        />
      </Combobox.Root>
    )
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ visible: true, disabled: false }))
    expect(document.querySelector("a[data-custom]")).not.toBeNull()
  })
})

describe("input inside the popup", () => {
  function InPopup({ root }: { root?: Partial<RootProps> }) {
    return (
      <div>
        <button type="button">outside</button>
        <Combobox.Root items={frameworks} defaultValue="Remix" name="framework" {...root}>
          <Combobox.Trigger data-testid="trigger">
            <Combobox.Value />
          </Combobox.Trigger>
          <Combobox.Portal>
            <Combobox.Positioner>
              <Combobox.Popup data-testid="popup">
                <Combobox.Input data-testid="search" />
                <Combobox.Empty>No items found.</Combobox.Empty>
                <Combobox.List>
                  {(item: string) => (
                    <Combobox.Item key={item} value={item}>
                      {item}
                    </Combobox.Item>
                  )}
                </Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </Combobox.Root>
        <button type="button">after</button>
      </div>
    )
  }
  const trigger = () => screen.getByTestId("trigger")

  test("the trigger is the combobox and shows the selected label", () => {
    render(<InPopup />)
    expect(trigger().getAttribute("role")).toBe("combobox")
    expect(trigger().getAttribute("tabindex")).toBe("0")
    expect(trigger().getAttribute("aria-haspopup")).toBe("dialog")
    expect(trigger().id).not.toBe("")
    expect(trigger().textContent).toBe("Remix")
  })

  test("opening moves the focus to the search, lists everything and highlights the selection", async () => {
    render(<InPopup />)
    const user = setupUser()
    await user.click(trigger())
    await flush(50)
    const popup = screen.getByTestId("popup")
    const search = screen.getByTestId("search") as HTMLInputElement
    expect(popup.getAttribute("role")).toBe("dialog")
    expect(trigger().getAttribute("aria-controls")).toBe(popup.id)
    expect(trigger().getAttribute("aria-expanded")).toBe("true")
    expect(search.value).toBe("")
    expect(document.activeElement).toBe(search)
    expect(labels()).toEqual(frameworks)
    expect(highlighted()).toEqual(["Remix"])
    expect(search.getAttribute("aria-activedescendant")).toBe(options()[3]!.id)
  })

  test("typing filters, Enter picks and the focus returns to the trigger", async () => {
    render(<InPopup />)
    const user = setupUser()
    await user.click(trigger())
    await flush(50)
    await user.keyboard("nu")
    await flush(50)
    expect(labels()).toEqual(["Nuxt.js"])
    await user.keyboard("{ArrowDown}{Enter}")
    await flush(50)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(trigger().textContent).toBe("Nuxt.js")
    expect(hiddenInput().value).toBe("Nuxt.js")
    expect(hiddenInput().name).toBe("framework")
    expect(document.activeElement).toBe(trigger())
  })

  test("Escape closes the popup, returns the focus and keeps the selection", async () => {
    render(<InPopup />)
    const user = setupUser()
    await user.click(trigger())
    await flush(50)
    await user.keyboard("{Escape}")
    await flush(50)
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(document.activeElement).toBe(trigger())
    expect(trigger().textContent).toBe("Remix")
    // the search starts empty again
    await user.click(trigger())
    await flush(50)
    expect((screen.getByTestId("search") as HTMLInputElement).value).toBe("")
  })

  // Base UI's focus guards: Shift+Tab from the search is the trigger with the popup still open, Tab from the trigger enters the search
  test("Shift+Tab from the search returns to the trigger, Tab from there re-enters the search, Tab from the search leaves", async () => {
    render(<InPopup />)
    const user = setupUser()
    await user.click(trigger())
    await flush(50)
    await user.tab({ shift: true })
    await flush(50)
    expect(document.activeElement).toBe(trigger())
    expect(screen.getByRole("dialog")).toBeTruthy()
    await user.tab()
    await flush(50)
    expect(document.activeElement).toBe(screen.getByTestId("search"))
    expect(screen.getByRole("dialog")).toBeTruthy()
    await user.tab()
    await flush(50)
    expect(document.activeElement).toBe(screen.getByText("after"))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  test("Shift+Tab from the trigger of an open popup leaves for the element before it and closes", async () => {
    render(<InPopup />)
    const user = setupUser()
    await user.click(trigger())
    await flush(50)
    await user.tab({ shift: true })
    await user.tab({ shift: true })
    await flush(50)
    expect(document.activeElement).toBe(screen.getByText("outside"))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  test("opened by touch, the popup takes the focus so the on-screen keyboard stays away", async () => {
    render(<InPopup />)
    fireEvent.pointerDown(trigger(), { pointerType: "touch" })
    fireEvent.mouseDown(trigger())
    await flush(50)
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(document.activeElement).toBe(screen.getByTestId("popup"))
    // pressing the search field is what brings the keyboard up
    fireEvent.pointerDown(screen.getByTestId("search"), { pointerType: "touch" })
    screen.getByTestId("search").focus()
    expect(document.activeElement).toBe(screen.getByTestId("search"))
  })

  test("an arrow key on the focused trigger opens the popup", async () => {
    render(<InPopup root={{ defaultValue: null }} />)
    const user = setupUser()
    trigger().focus()
    await user.keyboard("{ArrowDown}")
    await flush(50)
    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(highlighted()).toEqual(["Next.js"])
  })

  test("Enter on the focused trigger opens the popup", async () => {
    render(<InPopup />)
    const user = setupUser()
    trigger().focus()
    await user.keyboard("{Enter}")
    await flush(50)
    expect(screen.getByRole("dialog")).toBeTruthy()
  })
})

describe("form", () => {
  test("the hidden input is required with the root and focuses the visible input", () => {
    render(<Basic root={{ required: true }} />)
    expect(hiddenInput().required).toBe(true)
    expect(input().getAttribute("aria-required")).toBe("true")
    hiddenInput().focus()
    expect(document.activeElement).toBe(input())
  })

  test("props of the input reach the element, so a name on it is submitted with the label", () => {
    render(
      <form>
        <Combobox.Root items={frameworks} defaultValue="Remix">
          <Combobox.Input name="framework" required aria-invalid="true" id="fw" />
        </Combobox.Root>
      </form>
    )
    const field = input()
    expect(field.name).toBe("framework")
    expect(field.required).toBe(true)
    expect(field.getAttribute("aria-invalid")).toBe("true")
    expect(field.id).toBe("fw")
    expect(new FormData(field.form!).get("framework")).toBe("Remix")
  })
})

describe("composition", () => {
  test("a text composition is only filtered once it is finished", async () => {
    render(<Basic />)
    const field = input()
    field.focus()
    fireEvent.compositionStart(field)
    field.value = "re"
    fireEvent.input(field, { inputType: "insertCompositionText" })
    await flush(50)
    expect(field.value).toBe("re")
    expect(field.getAttribute("aria-expanded")).toBe("true")
    expect(labels()).toEqual(frameworks)
    fireEvent.compositionEnd(field)
    await flush(50)
    expect(labels()).toEqual(["Remix"])
  })
})
