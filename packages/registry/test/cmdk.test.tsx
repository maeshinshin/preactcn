import { createRef } from "preact"
import { useState } from "preact/hooks"
import { act, fireEvent, render, screen } from "@testing-library/preact"
import { afterEach, describe, expect, test, vi } from "vitest"
import { Command } from "../src/shims/cmdk"

type RootProps = Parameters<typeof Command>[0]

// Selection, sorting and scrolling run once the items re-rendered, a render pass after the event
const settle = async () => {
  for (let i = 0; i < 4; i++) await act(async () => {})
}
const setup = async (ui: preact.ComponentChildren) => {
  const result = render(ui)
  await settle()
  return result
}
const typeInto = async (text: string, input = screen.getByRole("combobox")) => {
  fireEvent.input(input, { target: { value: text } })
  await settle()
}
const press = async (key: string, init: KeyboardEventInit = {}) => {
  fireEvent.keyDown(screen.getByRole("combobox"), { key, ...init })
  await settle()
}

const item = (name: string) => screen.getByRole("option", { name })
const items = () => screen.queryAllByRole("option").map((item) => item.textContent)
const selected = () => document.querySelector('[cmdk-item][aria-selected="true"]')?.textContent ?? null

function Menu({ onSelect, ...props }: Partial<RootProps> & { onSelect?(value: string): void }) {
  return (
    <Command label="Commands" {...props}>
      <Command.Input placeholder="Search" />
      <Command.List>
        <Command.Empty>No results.</Command.Empty>
        <Command.Group heading="Suggestions">
          <Command.Item onSelect={onSelect}>Calendar</Command.Item>
          <Command.Item onSelect={onSelect}>Search Emoji</Command.Item>
          <Command.Item disabled onSelect={onSelect}>
            Calculator
          </Command.Item>
        </Command.Group>
        <Command.Separator />
        <Command.Group heading="Settings">
          <Command.Item onSelect={onSelect}>Profile</Command.Item>
          <Command.Item keywords={["account"]} onSelect={onSelect}>
            Billing
          </Command.Item>
          <Command.Item value="cfg" onSelect={onSelect}>
            Settings
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command>
  )
}

afterEach(() => vi.restoreAllMocks())

describe("cmdk structure", () => {
  test("renders cmdk's attributes and aria wiring", async () => {
    const { container } = await setup(<Menu />)
    const root = container.querySelector("[cmdk-root]")!
    expect(root.getAttribute("tabindex")).toBe("-1")

    const input = screen.getByRole("combobox")
    const list = screen.getByRole("listbox")
    const label = container.querySelector("[cmdk-label]")!
    expect(label.textContent).toBe("Commands")
    expect(label.getAttribute("for")).toBe(input.id)
    expect(label.id).toBe(input.getAttribute("aria-labelledby"))
    expect(input.hasAttribute("cmdk-input")).toBe(true)
    expect(input.getAttribute("type")).toBe("text")
    expect(input.getAttribute("autocomplete")).toBe("off")
    expect(input.getAttribute("aria-autocomplete")).toBe("list")
    expect(input.getAttribute("aria-expanded")).toBe("true")
    expect(input.getAttribute("aria-controls")).toBe(list.id)
    expect(list.hasAttribute("cmdk-list")).toBe(true)
    expect(list.getAttribute("aria-label")).toBe("Suggestions")
    expect(list.getAttribute("tabindex")).toBe("-1")
    expect(list.querySelector("[cmdk-list-sizer]")).not.toBeNull()

    const groups = container.querySelectorAll("[cmdk-group]")
    expect(groups.length).toBe(2)
    const heading = groups[0]!.querySelector("[cmdk-group-heading]")!
    expect(heading.textContent).toBe("Suggestions")
    expect(heading.getAttribute("aria-hidden")).toBe("true")
    expect(groups[0]!.getAttribute("role")).toBe("presentation")
    const groupItems = groups[0]!.querySelector("[cmdk-group-items]")!
    expect(groupItems.getAttribute("role")).toBe("group")
    expect(groupItems.getAttribute("aria-labelledby")).toBe(heading.id)
    expect(screen.getByRole("separator").hasAttribute("cmdk-separator")).toBe(true)
  })

  test("items are options with string-valued state attributes", async () => {
    await setup(<Menu />)
    const [calendar, , calculator] = screen.getAllByRole("option")
    expect(calendar!.hasAttribute("cmdk-item")).toBe(true)
    expect(calendar!.getAttribute("aria-selected")).toBe("true")
    expect(calendar!.getAttribute("data-selected")).toBe("true")
    expect(calendar!.getAttribute("aria-disabled")).toBe("false")
    expect(calendar!.getAttribute("data-disabled")).toBe("false")
    expect(calculator!.getAttribute("aria-selected")).toBe("false")
    expect(calculator!.getAttribute("data-selected")).toBe("false")
    expect(calculator!.getAttribute("aria-disabled")).toBe("true")
    expect(calculator!.getAttribute("data-disabled")).toBe("true")
  })

  test("an item's value is the value prop, else the trimmed text content", async () => {
    await setup(
      <Command>
        <Command.List>
          <Command.Item value="  explicit  ">Shown</Command.Item>
          <Command.Item>
            {" "}
            <b>Bold</b> text{" "}
          </Command.Item>
        </Command.List>
      </Command>
    )
    expect(screen.getAllByRole("option").map((item) => item.getAttribute("data-value"))).toEqual(["explicit", "Bold text"])
  })

  test("a group's value is its heading text or its value prop", async () => {
    const { container } = await setup(
      <Command>
        <Command.List>
          <Command.Group heading="Heading">
            <Command.Item>A</Command.Item>
          </Command.Group>
          <Command.Group value="g2">
            <Command.Item>B</Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    )
    expect(Array.from(container.querySelectorAll("[cmdk-group]")).map((group) => group.getAttribute("data-value"))).toEqual(["Heading", "g2"])
  })

  test("passes other props and the class to the elements", async () => {
    const { container } = await setup(
      <Command id="root" className="r" data-x="1">
        <Command.Input className="i" disabled />
        <Command.List className="l">
          <Command.Item className="c" data-y="2">
            A
          </Command.Item>
          <Command.Group id="gr" className="g" heading="H">
            <Command.Item>B</Command.Item>
          </Command.Group>
          <Command.Separator className="s" />
        </Command.List>
      </Command>
    )
    expect(container.querySelector("[cmdk-root]")!.matches("#root.r[data-x='1']")).toBe(true)
    expect(screen.getByRole("combobox").matches(".i[disabled]")).toBe(true)
    expect(screen.getByRole("listbox").matches(".l")).toBe(true)
    expect(screen.getAllByRole("option")[0]!.matches(".c[data-y='2']")).toBe(true)
    expect(container.querySelector("[cmdk-group]")!.matches("#gr.g")).toBe(true)
    expect(screen.getByRole("separator").matches(".s")).toBe(true)
  })

  test("parts deliver their elements through refs", async () => {
    const refs = Array.from({ length: 7 }, () => createRef<HTMLElement>())
    await setup(
      <Command ref={refs[0]}>
        <Command.Input ref={refs[1]} />
        <Command.List ref={refs[2]}>
          <Command.Empty ref={refs[3]} />
          <Command.Group ref={refs[4]} heading="H">
            <Command.Item ref={refs[5]}>A</Command.Item>
          </Command.Group>
          <Command.Separator ref={refs[6]} alwaysRender />
        </Command.List>
      </Command>
    )
    expect(refs.map((ref) => ref.current?.tagName)).toEqual(["DIV", "INPUT", "DIV", undefined, "DIV", "DIV", "DIV"])
    expect(refs[2]!.current).toBe(screen.getByRole("listbox"))
    expect(refs[5]!.current).toBe(screen.getByRole("option"))
  })

  test("a part outside Command says what it needs", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<Command.Item>A</Command.Item>)).toThrow("`Command.Item` must be used within `Command`")
  })
})

describe("cmdk filtering", () => {
  test("keeps the items that match the search and drops the others", async () => {
    await setup(<Menu />)
    expect(items()).toEqual(["Calendar", "Search Emoji", "Calculator", "Profile", "Billing", "Settings"])
    await typeInto("cal")
    expect(items()).toEqual(["Calculator", "Calendar"])
    await typeInto("")
    expect(items().length).toBe(6)
  })

  test("a disabled item still shows when it matches but is never selected", async () => {
    await setup(<Menu />)
    await typeInto("calc")
    expect(items()).toEqual(["Calculator"])
    expect(selected()).toBeNull()
  })

  test("orders items by score inside their group and loose items in the list", async () => {
    await setup(
      <Command>
        <Command.Input />
        <Command.List>
          <Command.Item>Profile</Command.Item>
          <Command.Item>Open file</Command.Item>
          <Command.Item>File</Command.Item>
          <Command.Item>a-file</Command.Item>
          <Command.Group heading="G">
            <Command.Item>xfile</Command.Item>
            <Command.Item>file x</Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    )
    await typeInto("file")
    // Loose items move behind the group, as cmdk reorders them with appendChild
    expect(items()).toEqual(["file x", "xfile", "File", "Open file", "a-file", "Profile"])
    // Items that come back after backspacing are not re-sorted, which cmdk does not do either
    await typeInto("")
    expect(items().length).toBe(6)
  })

  test("the order survives the parent re-rendering with the search in its own state", async () => {
    function App() {
      const [search, setSearch] = useState("")
      const [count, setCount] = useState(0)
      return (
        <div>
          <button onClick={() => setCount(count + 1)}>rerender {count}</button>
          <Command>
            <Command.Input value={search} onValueChange={setSearch} />
            <Command.List>
              <Command.Item>Profile</Command.Item>
              <Command.Item>Open file</Command.Item>
              <Command.Item>File</Command.Item>
            </Command.List>
          </Command>
        </div>
      )
    }
    await setup(<App />)
    await typeInto("file")
    expect(items()).toEqual(["File", "Open file", "Profile"])
    fireEvent.click(screen.getByRole("button"))
    await settle()
    expect(screen.getByRole("button").textContent).toBe("rerender 1")
    expect(items()).toEqual(["File", "Open file", "Profile"])
  })

  test("matches the keywords of an item too", async () => {
    await setup(<Menu />)
    await typeInto("account")
    expect(items()).toEqual(["Billing"])
  })

  test("matches on the value prop rather than the text", async () => {
    await setup(<Menu />)
    await typeInto("cfg")
    expect(items()).toEqual(["Settings"])
  })

  test("Empty shows only while nothing matches", async () => {
    const { container } = await setup(<Menu />)
    expect(container.querySelector("[cmdk-empty]")).toBeNull()
    await typeInto("zzz")
    expect(container.querySelector("[cmdk-empty]")!.textContent).toBe("No results.")
    expect(items()).toEqual([])
    await typeInto("pro")
    expect(container.querySelector("[cmdk-empty]")).toBeNull()
  })

  test("a group without a match is hidden and the separator goes while searching", async () => {
    const { container } = await setup(<Menu />)
    const groups = Array.from(container.querySelectorAll("[cmdk-group]"))
    expect(groups.map((group) => group.hasAttribute("hidden"))).toEqual([false, false])
    await typeInto("pro")
    expect(groups.map((group) => group.hasAttribute("hidden"))).toEqual([true, false])
    expect(screen.queryByRole("separator")).toBeNull()
    await typeInto("")
    expect(groups.map((group) => group.hasAttribute("hidden"))).toEqual([false, false])
    expect(screen.queryByRole("separator")).not.toBeNull()
  })

  test("alwaysRender keeps the separator and forceMount keeps items and groups", async () => {
    const { container } = await setup(
      <Command>
        <Command.Input />
        <Command.List>
          <Command.Item>Alpha</Command.Item>
          <Command.Item forceMount>Forced</Command.Item>
          <Command.Separator alwaysRender />
          <Command.Group heading="Group" forceMount>
            <Command.Item>In group</Command.Item>
          </Command.Group>
          <Command.Group heading="Other">
            <Command.Item>Beta</Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    )
    await typeInto("alp")
    expect(items()).toEqual(["In group", "Forced", "Alpha"])
    expect(screen.getByRole("separator")).not.toBeNull()
    const groups = Array.from(container.querySelectorAll("[cmdk-group]"))
    expect(groups.map((group) => group.hasAttribute("hidden"))).toEqual([false, true])
  })

  test("shouldFilter={false} leaves filtering and sorting to the caller", async () => {
    const { container } = await setup(<Menu shouldFilter={false} />)
    await typeInto("zzz")
    expect(items().length).toBe(6)
    expect(container.querySelector("[cmdk-empty]")).toBeNull()
    await press("ArrowDown")
    expect(selected()).toBe("Search Emoji")
  })

  test("a custom filter scores each value against the search and the keywords", async () => {
    const filter = vi.fn((value: string, search: string) => (value.toLowerCase().startsWith(search) ? 1 : 0))
    await setup(<Menu filter={filter} />)
    await typeInto("pr")
    expect(items()).toEqual(["Profile"])
    expect(filter).toHaveBeenCalledWith("Profile", "pr", [])
    expect(filter).toHaveBeenCalledWith("Billing", "pr", ["account"])
  })

  test("items mounted later take part in the search", async () => {
    function Dynamic() {
      const [more, setMore] = useState(false)
      return (
        <div>
          <button onClick={() => setMore(true)}>load</button>
          <Command>
            <Command.Input />
            <Command.List>
              <Command.Item>Alpha</Command.Item>
              {more && <Command.Item>Almond</Command.Item>}
              {more && <Command.Item>Beta</Command.Item>}
            </Command.List>
          </Command>
        </div>
      )
    }
    await setup(<Dynamic />)
    await typeInto("al")
    expect(items()).toEqual(["Alpha"])
    fireEvent.click(screen.getByRole("button"))
    await settle()
    expect(items()).toEqual(["Alpha", "Almond"])
  })
})

describe("cmdk selection", () => {
  test("selects the first enabled item and points aria-activedescendant at it", async () => {
    await setup(<Menu />)
    expect(selected()).toBe("Calendar")
    const id = screen.getAllByRole("option")[0]!.id
    expect(screen.getByRole("combobox").getAttribute("aria-activedescendant")).toBe(id)
    expect(screen.getByRole("listbox").getAttribute("aria-activedescendant")).toBe(id)
  })

  test("aria-activedescendant follows every change of the selection", async () => {
    await setup(<Menu />)
    const input = screen.getByRole("combobox")
    const idOf = (text: string) => screen.getAllByRole("option").find((item) => item.textContent === text)!.id
    await press("ArrowDown")
    expect(input.getAttribute("aria-activedescendant")).toBe(idOf("Search Emoji"))
    await press("ArrowDown")
    expect(selected()).toBe("Profile")
    expect(input.getAttribute("aria-activedescendant")).toBe(idOf("Profile"))
    await typeInto("bil")
    expect(selected()).toBe("Billing")
    expect(input.getAttribute("aria-activedescendant")).toBe(idOf("Billing"))
    await typeInto("zzz")
    expect(selected()).toBeNull()
    expect(input.hasAttribute("aria-activedescendant")).toBe(false)
    expect(screen.getByRole("listbox").hasAttribute("aria-activedescendant")).toBe(false)
  })

  test("moves the selection to the best match when the search changes", async () => {
    await setup(<Menu />)
    await typeInto("pro")
    expect(selected()).toBe("Profile")
    await typeInto("")
    expect(selected()).toBe("Calendar")
  })

  test("the selection waits for the items to render when Preact holds its renders back", async () => {
    await setup(<Menu />)
    await typeInto("calc")
    expect(selected()).toBeNull()
    // Inside an async act, renders are flushed when the callback ends, after any microtask
    await act(async () => {
      fireEvent.input(screen.getByRole("combobox"), { target: { value: "ca" } })
    })
    await settle()
    expect(selected()).toBe("Calendar")
  })

  test("removing the selected item selects the first one", async () => {
    function Removable() {
      const [shown, setShown] = useState(true)
      return (
        <div>
          <button onClick={() => setShown(false)}>remove</button>
          <Command defaultValue="Beta">
            <Command.List>
              <Command.Item>Alpha</Command.Item>
              {shown && <Command.Item>Beta</Command.Item>}
              <Command.Item>Gamma</Command.Item>
            </Command.List>
          </Command>
        </div>
      )
    }
    await setup(<Removable />)
    expect(selected()).toBe("Beta")
    fireEvent.click(screen.getByRole("button"))
    await settle()
    expect(items()).toEqual(["Alpha", "Gamma"])
    expect(selected()).toBe("Alpha")
  })

  test("defaultValue selects the item with that value", async () => {
    await setup(<Menu defaultValue="Profile" />)
    expect(selected()).toBe("Profile")
    await press("ArrowUp")
    expect(selected()).toBe("Search Emoji")
  })

  test("a controlled value selects the item and reports the keys through onValueChange", async () => {
    const onValueChange = vi.fn()
    const { rerender } = await setup(<Menu value="Billing" onValueChange={onValueChange} />)
    expect(selected()).toBe("Billing")
    await press("ArrowDown")
    expect(onValueChange).toHaveBeenLastCalledWith("cfg")
    rerender(<Menu value="cfg" onValueChange={onValueChange} />)
    await settle()
    expect(selected()).toBe("Settings")
    rerender(<Menu value="Profile" onValueChange={onValueChange} />)
    await settle()
    expect(selected()).toBe("Profile")
  })

  test("a controlled value is trimmed", async () => {
    await setup(<Menu value="  Billing " />)
    expect(selected()).toBe("Billing")
  })
})

describe("cmdk keyboard", () => {
  test("arrows move through the enabled items and stop at both ends", async () => {
    await setup(<Menu />)
    const order = []
    for (let i = 0; i < 6; i++) {
      await press("ArrowDown")
      order.push(selected())
    }
    expect(order).toEqual(["Search Emoji", "Profile", "Billing", "Settings", "Settings", "Settings"])
    for (let i = 0; i < 5; i++) await press("ArrowUp")
    expect(selected()).toBe("Calendar")
    await press("ArrowUp")
    expect(selected()).toBe("Calendar")
  })

  test("loop wraps around at both ends", async () => {
    await setup(<Menu loop />)
    await press("ArrowUp")
    expect(selected()).toBe("Settings")
    await press("ArrowDown")
    expect(selected()).toBe("Calendar")
  })

  test("Home and End jump to the first and last enabled item", async () => {
    await setup(<Menu />)
    await press("End")
    expect(selected()).toBe("Settings")
    await press("Home")
    expect(selected()).toBe("Calendar")
  })

  test("ctrl+n, j, p and k move too, unless vimBindings is off", async () => {
    const { unmount } = await setup(<Menu />)
    await press("n", { ctrlKey: true })
    expect(selected()).toBe("Search Emoji")
    await press("j", { ctrlKey: true })
    expect(selected()).toBe("Profile")
    await press("p", { ctrlKey: true })
    expect(selected()).toBe("Search Emoji")
    await press("k", { ctrlKey: true })
    expect(selected()).toBe("Calendar")
    await press("n")
    expect(selected()).toBe("Calendar")
    unmount()

    await setup(<Menu vimBindings={false} />)
    await press("n", { ctrlKey: true })
    expect(selected()).toBe("Calendar")
  })

  test("alt+arrow jumps between groups and meta+arrow to the ends", async () => {
    await setup(<Menu />)
    await press("ArrowDown", { altKey: true })
    expect(selected()).toBe("Profile")
    // No group after the last one: a plain step
    await press("ArrowDown", { altKey: true })
    expect(selected()).toBe("Billing")
    await press("ArrowUp", { altKey: true })
    expect(selected()).toBe("Calendar")
    await press("ArrowDown", { metaKey: true })
    expect(selected()).toBe("Settings")
    await press("ArrowUp", { metaKey: true })
    expect(selected()).toBe("Calendar")
  })

  test("arrows keep the focus on the input and cancel the default action", async () => {
    await setup(<Menu />)
    const input = screen.getByRole("combobox")
    input.focus()
    const notCancelled = fireEvent.keyDown(input, { key: "ArrowDown" })
    await settle()
    expect(notCancelled).toBe(false)
    expect(document.activeElement).toBe(input)
  })

  test("Enter selects the current item and reports its value", async () => {
    const onSelect = vi.fn()
    await setup(<Menu onSelect={onSelect} />)
    await press("Enter")
    expect(onSelect).toHaveBeenLastCalledWith("Calendar")
    await press("ArrowDown")
    await press("ArrowDown")
    await press("Enter")
    expect(onSelect).toHaveBeenLastCalledWith("Profile")
    expect(selected()).toBe("Profile")
    await typeInto("bil")
    await press("Enter")
    expect(onSelect).toHaveBeenLastCalledWith("Billing")
    await typeInto("cfg")
    await press("Enter")
    expect(onSelect).toHaveBeenLastCalledWith("cfg")
    expect(onSelect).toHaveBeenCalledTimes(4)
  })

  test("Enter with nothing selected does nothing", async () => {
    const onSelect = vi.fn()
    await setup(<Menu onSelect={onSelect} />)
    await typeInto("zzz")
    await press("Enter")
    expect(onSelect).not.toHaveBeenCalled()
  })

  test("keys during an IME composition are left to the IME", async () => {
    await setup(<Menu />)
    await press("ArrowDown", { isComposing: true })
    expect(selected()).toBe("Calendar")
    await press("ArrowDown", { keyCode: 229 })
    expect(selected()).toBe("Calendar")
  })

  test("a key handler of the caller that prevents the default stops the navigation", async () => {
    const onKeyDown = vi.fn((event: KeyboardEvent) => event.key === "ArrowDown" && event.preventDefault())
    await setup(<Menu onKeyDown={onKeyDown} />)
    await press("ArrowDown")
    expect(onKeyDown).toHaveBeenCalled()
    expect(selected()).toBe("Calendar")
    await press("End")
    expect(selected()).toBe("Settings")
  })

  test("scrolls the selected item into view, and its heading when it opens a group", async () => {
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {})
    await setup(<Menu />)
    scrollIntoView.mockClear()
    await press("ArrowDown")
    expect(scrollIntoView.mock.contexts.map((element) => (element as Element).textContent)).toEqual(["Search Emoji"])
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "nearest" })
    scrollIntoView.mockClear()
    await press("ArrowDown")
    expect(scrollIntoView.mock.contexts.map((element) => (element as Element).textContent)).toEqual(["Settings", "Profile"])
  })
})

describe("cmdk pointer", () => {
  test("moving the pointer over an item selects it without scrolling", async () => {
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {})
    await setup(<Menu />)
    scrollIntoView.mockClear()
    fireEvent.pointerMove(item("Profile"))
    await settle()
    expect(selected()).toBe("Profile")
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  test("a disabled item ignores the pointer", async () => {
    const onSelect = vi.fn()
    await setup(<Menu onSelect={onSelect} />)
    fireEvent.pointerMove(item("Calculator"))
    fireEvent.click(item("Calculator"))
    await settle()
    expect(selected()).toBe("Calendar")
    expect(onSelect).not.toHaveBeenCalled()
  })

  test("disablePointerSelection keeps the selection but clicks still select", async () => {
    const onSelect = vi.fn()
    await setup(<Menu disablePointerSelection onSelect={onSelect} />)
    fireEvent.pointerMove(item("Profile"))
    await settle()
    expect(selected()).toBe("Calendar")
    fireEvent.click(item("Profile"))
    await settle()
    expect(selected()).toBe("Profile")
    expect(onSelect).toHaveBeenCalledWith("Profile")
  })

  test("clicking an item selects it and reports its value", async () => {
    const onSelect = vi.fn()
    await setup(<Menu onSelect={onSelect} />)
    fireEvent.click(item("Settings"))
    await settle()
    expect(onSelect).toHaveBeenCalledWith("cfg")
    expect(selected()).toBe("Settings")
  })

  test("a changed onSelect is the one called", async () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = await setup(<Menu onSelect={first} />)
    rerender(<Menu onSelect={second} />)
    await settle()
    await press("Enter")
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith("Calendar")
  })
})

describe("cmdk input", () => {
  test("reports the typed text through onValueChange", async () => {
    const onValueChange = vi.fn()
    await setup(
      <Command>
        <Command.Input onValueChange={onValueChange} />
        <Command.List>
          <Command.Item>Alpha</Command.Item>
          <Command.Item>Beta</Command.Item>
        </Command.List>
      </Command>
    )
    await typeInto("be")
    expect(onValueChange).toHaveBeenCalledWith("be")
    expect(items()).toEqual(["Beta"])
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("be")
  })

  test("a controlled value drives the search and the caller keeps its own onInput", async () => {
    const onInput = vi.fn()
    function Controlled() {
      const [search, setSearch] = useState("al")
      return (
        <Command>
          <Command.Input value={search} onValueChange={setSearch} onInput={onInput} />
          <Command.List>
            <Command.Item>Alpha</Command.Item>
            <Command.Item>Beta</Command.Item>
          </Command.List>
        </Command>
      )
    }
    await setup(<Controlled />)
    expect(items()).toEqual(["Alpha"])
    expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("al")
    await typeInto("be")
    expect(items()).toEqual(["Beta"])
    expect(onInput).toHaveBeenCalledTimes(1)
  })

  test("a value that the caller does not follow is not typed over", async () => {
    await setup(
      <Command>
        <Command.Input value="al" />
        <Command.List>
          <Command.Item>Alpha</Command.Item>
          <Command.Item>Beta</Command.Item>
        </Command.List>
      </Command>
    )
    await typeInto("be")
    expect(items()).toEqual(["Alpha"])
  })
})

describe("cmdk list height", () => {
  test("publishes the content height as --cmdk-list-height", async () => {
    let notify = () => {}
    const observe = vi.fn()
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          notify = callback
        }
        observe = observe
        unobserve() {}
      }
    )
    vi.stubGlobal("requestAnimationFrame", (callback: () => void) => callback())
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(42)
    await setup(<Menu />)
    expect(observe).toHaveBeenCalledWith(document.querySelector("[cmdk-list-sizer]"))
    notify()
    expect(screen.getByRole("listbox").style.getPropertyValue("--cmdk-list-height")).toBe("42.0px")
    vi.unstubAllGlobals()
  })
})
