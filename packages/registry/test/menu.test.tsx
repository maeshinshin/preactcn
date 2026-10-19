import { useState } from "preact/hooks"
import { fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
import { flush, setupUser, useFakeTimers } from "./helpers"
import * as DropdownMenu from "../src/radix/dropdown-menu"

// The behavior shared by dropdown, context and menubar menus, exercised through the dropdown menu
const trigger = () => screen.getByTestId("trigger")
const item = (name: string) => screen.getByRole("menuitem", { name })
const active = () => document.activeElement as HTMLElement

function Basic({ loop, onSelect }: { loop?: boolean; onSelect?: (event: Event) => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger data-testid="trigger">Open</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content data-testid="content" loop={loop}>
          <DropdownMenu.Label>Account</DropdownMenu.Label>
          <DropdownMenu.Group>
            <DropdownMenu.Item onSelect={onSelect}>Profile</DropdownMenu.Item>
            <DropdownMenu.Item disabled>Billing</DropdownMenu.Item>
            <DropdownMenu.Item>Settings</DropdownMenu.Item>
          </DropdownMenu.Group>
          <DropdownMenu.Separator />
          <DropdownMenu.Item>Team</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

async function openWithKeyboard(user: ReturnType<typeof setupUser>) {
  trigger().focus()
  await user.keyboard("{ArrowDown}")
  await flush()
}

useFakeTimers()

describe("menu parts", () => {
  test("items, groups, labels and separators carry the menu roles and state attributes", async () => {
    const user = setupUser()
    render(<Basic />)
    await user.click(trigger())
    await flush()
    const profile = item("Profile")
    expect(profile.tagName).toBe("DIV")
    expect(profile.getAttribute("tabindex")).toBe("-1")
    expect(profile.getAttribute("data-radix-collection-item")).toBe("")
    expect(profile.getAttribute("data-orientation")).toBe("vertical")
    expect(profile.hasAttribute("data-highlighted")).toBe(false)
    expect(profile.hasAttribute("aria-disabled")).toBe(false)
    expect(item("Billing").getAttribute("aria-disabled")).toBe("true")
    expect(item("Billing").getAttribute("data-disabled")).toBe("")
    expect(screen.getByRole("group")).toBe(profile.parentElement)
    const separator = screen.getByRole("separator")
    expect(separator.getAttribute("aria-orientation")).toBe("horizontal")
    expect(screen.getByText("Account").getAttribute("role")).toBeNull()
  })

  test("an item can render as its child with asChild", async () => {
    const user = setupUser()
    const onSelect = vi.fn()
    render(
      <DropdownMenu.Root defaultOpen>
        <DropdownMenu.Trigger>Open</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item asChild onSelect={onSelect}>
              <a href="/profile">Profile</a>
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    )
    await flush()
    const link = screen.getByRole("menuitem", { name: "Profile" })
    expect(link.tagName).toBe("A")
    expect(link.getAttribute("href")).toBe("/profile")
    await user.click(link)
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})

describe("pointer highlighting", () => {
  test("hovering an item focuses and highlights it, leaving gives focus back to the menu", async () => {
    const user = setupUser()
    render(<Basic />)
    await user.click(trigger())
    await flush()
    await user.hover(item("Settings"))
    expect(active()).toBe(item("Settings"))
    expect(item("Settings").getAttribute("data-highlighted")).toBe("")
    await user.hover(item("Team"))
    expect(item("Settings").hasAttribute("data-highlighted")).toBe(false)
    expect(item("Team").hasAttribute("data-highlighted")).toBe(true)
    await user.unhover(item("Team"))
    expect(active()).toBe(screen.getByRole("menu"))
    expect(item("Team").hasAttribute("data-highlighted")).toBe(false)
  })

  test("a disabled item is never focused or highlighted by the pointer", async () => {
    const user = setupUser()
    render(<Basic />)
    await user.click(trigger())
    await flush()
    await user.hover(item("Profile"))
    await user.hover(item("Billing"))
    expect(active()).toBe(screen.getByRole("menu"))
    expect(item("Billing").hasAttribute("data-highlighted")).toBe(false)
  })

  test("touch pointers do not move focus", async () => {
    const user = setupUser()
    render(<Basic />)
    await user.click(trigger())
    await flush()
    fireEvent.pointerMove(item("Settings"), { pointerType: "touch" })
    expect(active()).toBe(screen.getByRole("menu"))
  })
})

describe("keyboard navigation", () => {
  test("arrows move through enabled items without wrapping by default", async () => {
    const user = setupUser()
    render(<Basic />)
    await openWithKeyboard(user)
    expect(active()).toBe(item("Profile"))
    await user.keyboard("{ArrowDown}")
    expect(active()).toBe(item("Settings"))
    await user.keyboard("{ArrowDown}")
    expect(active()).toBe(item("Team"))
    await user.keyboard("{ArrowDown}")
    expect(active()).toBe(item("Team"))
    await user.keyboard("{ArrowUp}")
    expect(active()).toBe(item("Settings"))
    await user.keyboard("{ArrowUp}{ArrowUp}")
    expect(active()).toBe(item("Profile"))
  })

  test("loop wraps around", async () => {
    const user = setupUser()
    render(<Basic loop />)
    await openWithKeyboard(user)
    await user.keyboard("{ArrowUp}")
    expect(active()).toBe(item("Team"))
    await user.keyboard("{ArrowDown}")
    expect(active()).toBe(item("Profile"))
  })

  test.each([
    ["Home", "Profile"],
    ["PageUp", "Profile"],
    ["End", "Team"],
    ["PageDown", "Team"],
  ])("%s focuses the %s item", async (key, name) => {
    const user = setupUser()
    render(<Basic />)
    await openWithKeyboard(user)
    await user.keyboard("{ArrowDown}")
    await user.keyboard(`{${key}}`)
    expect(active()).toBe(item(name))
  })

  test.each([
    ["ArrowDown", "Profile"],
    ["Home", "Profile"],
    ["ArrowUp", "Team"],
    ["End", "Team"],
  ])("with the menu itself focused after a pointer open, %s focuses the %s item", async (key, name) => {
    const user = setupUser()
    render(<Basic />)
    await user.click(trigger())
    await flush()
    expect(active()).toBe(screen.getByRole("menu"))
    await user.keyboard(`{${key}}`)
    expect(active()).toBe(item(name))
  })

  test("Tab does not leave the menu", async () => {
    const user = setupUser()
    render(<Basic />)
    await openWithKeyboard(user)
    await user.tab()
    expect(screen.getByRole("menu").contains(active())).toBe(true)
  })

  test("typing jumps to the next enabled item starting with the letters, and forgets them after a second", async () => {
    const user = setupUser()
    render(<Basic />)
    await openWithKeyboard(user)
    await user.keyboard("t")
    expect(active()).toBe(item("Team"))
    await flush(1000)
    await user.keyboard("s")
    expect(active()).toBe(item("Settings"))
    await flush(1000)
    // Disabled items are skipped
    await user.keyboard("b")
    expect(active()).toBe(item("Settings"))
    await flush(1000)
    await user.keyboard("p")
    expect(active()).toBe(item("Profile"))
  })

  test("typing several letters quickly matches the whole search", async () => {
    const user = setupUser()
    render(
      <DropdownMenu.Root defaultOpen>
        <DropdownMenu.Trigger data-testid="trigger">Open</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item>Save</DropdownMenu.Item>
            <DropdownMenu.Item>Settings</DropdownMenu.Item>
            <DropdownMenu.Item>Share</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    )
    await flush()
    screen.getByRole("menu").focus()
    await user.keyboard("se")
    expect(active()).toBe(item("Settings"))
    await flush(1000)
    await user.keyboard("sh")
    expect(active()).toBe(item("Share"))
  })
})

describe("selecting", () => {
  test("a click selects the item and closes the menu", async () => {
    const user = setupUser()
    const onSelect = vi.fn()
    render(<Basic onSelect={onSelect} />)
    await user.click(trigger())
    await flush()
    const profile = item("Profile")
    await user.click(profile)
    await flush()
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0]![0]).toBeInstanceOf(Event)
    expect(onSelect.mock.calls[0]![0].target).toBe(profile)
    expect(screen.queryByRole("menu")).toBeNull()
    expect(active()).toBe(trigger())
  })

  test("Enter and Space select the focused item", async () => {
    const user = setupUser()
    const onSelect = vi.fn()
    render(<Basic onSelect={onSelect} />)
    await openWithKeyboard(user)
    await user.keyboard("{Enter}")
    await flush()
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("menu")).toBeNull()
    await openWithKeyboard(user)
    await user.keyboard(" ")
    await flush()
    expect(onSelect).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole("menu")).toBeNull()
  })

  test("Space while typing ahead does not select", async () => {
    const user = setupUser()
    const onSelect = vi.fn()
    render(<Basic onSelect={onSelect} />)
    await openWithKeyboard(user)
    await user.keyboard("p")
    await user.keyboard(" ")
    await flush()
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.queryByRole("menu")).not.toBeNull()
  })

  test("preventDefault in onSelect keeps the menu open", async () => {
    const user = setupUser()
    render(<Basic onSelect={(event) => event.preventDefault()} />)
    await user.click(trigger())
    await flush()
    await user.click(item("Profile"))
    await flush()
    expect(screen.queryByRole("menu")).not.toBeNull()
  })

  test("a disabled item selects nothing", async () => {
    const user = setupUser()
    const onSelect = vi.fn()
    render(
      <DropdownMenu.Root defaultOpen>
        <DropdownMenu.Trigger>Open</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item disabled onSelect={onSelect}>
              Billing
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    )
    await flush()
    await user.click(item("Billing"))
    fireEvent.keyDown(item("Billing"), { key: "Enter" })
    await flush()
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.queryByRole("menu")).not.toBeNull()
  })

  test("pressing on one item and releasing over another selects the one released over", async () => {
    const onSelect = vi.fn()
    const onOther = vi.fn()
    render(
      <DropdownMenu.Root defaultOpen>
        <DropdownMenu.Trigger>Open</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.Item onSelect={onOther}>Pressed</DropdownMenu.Item>
            <DropdownMenu.Item onSelect={onSelect}>Released</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    )
    await flush()
    fireEvent.pointerDown(item("Pressed"), { button: 0 })
    fireEvent.pointerUp(item("Released"), { button: 0 })
    await flush()
    expect(onOther).not.toHaveBeenCalled()
    expect(onSelect).toHaveBeenCalledTimes(1)
  })
})

describe("checkbox and radio items", () => {
  function Checks({ onCheckedChange, onValueChange }: { onCheckedChange?: (checked: boolean | "indeterminate") => void; onValueChange?: (value: string) => void }) {
    const [checked, setChecked] = useState<boolean | "indeterminate">(false)
    const [value, setValue] = useState("bottom")
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger data-testid="trigger">Open</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.CheckboxItem
              checked={checked}
              onCheckedChange={(next) => {
                onCheckedChange?.(next)
                setChecked(next)
              }}
            >
              <DropdownMenu.ItemIndicator data-testid="check-indicator">v</DropdownMenu.ItemIndicator>
              Status bar
            </DropdownMenu.CheckboxItem>
            <DropdownMenu.RadioGroup
              value={value}
              onValueChange={(next) => {
                onValueChange?.(next)
                setValue(next)
              }}
            >
              <DropdownMenu.RadioItem value="top">
                <DropdownMenu.ItemIndicator>o</DropdownMenu.ItemIndicator>
                Top
              </DropdownMenu.RadioItem>
              <DropdownMenu.RadioItem value="bottom">
                <DropdownMenu.ItemIndicator data-testid="radio-indicator">o</DropdownMenu.ItemIndicator>
                Bottom
              </DropdownMenu.RadioItem>
            </DropdownMenu.RadioGroup>
            <button type="button" onClick={() => setChecked("indeterminate")}>
              mixed
            </button>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    )
  }

  test("a checkbox item reports its state, toggles on select and closes the menu", async () => {
    const user = setupUser()
    const onCheckedChange = vi.fn()
    render(<Checks onCheckedChange={onCheckedChange} />)
    await user.click(trigger())
    await flush()
    const checkbox = screen.getByRole("menuitemcheckbox", { name: "Status bar" })
    expect(checkbox.getAttribute("aria-checked")).toBe("false")
    expect(checkbox.getAttribute("data-state")).toBe("unchecked")
    expect(screen.queryByTestId("check-indicator")).toBeNull()
    await user.click(checkbox)
    await flush()
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(screen.queryByRole("menu")).toBeNull()
    await user.click(trigger())
    await flush()
    const reopened = screen.getByRole("menuitemcheckbox", { name: "v Status bar" })
    expect(reopened.getAttribute("aria-checked")).toBe("true")
    expect(reopened.getAttribute("data-state")).toBe("checked")
    expect(screen.getByTestId("check-indicator").getAttribute("data-state")).toBe("checked")
    await user.click(reopened)
    expect(onCheckedChange).toHaveBeenLastCalledWith(false)
  })

  test("an indeterminate checkbox item is mixed and becomes checked", async () => {
    const user = setupUser()
    const onCheckedChange = vi.fn()
    render(<Checks onCheckedChange={onCheckedChange} />)
    await user.click(trigger())
    await flush()
    await user.click(screen.getByRole("button", { name: "mixed" }))
    const checkbox = screen.getByRole("menuitemcheckbox")
    expect(checkbox.getAttribute("aria-checked")).toBe("mixed")
    expect(checkbox.getAttribute("data-state")).toBe("indeterminate")
    expect(screen.getByTestId("check-indicator").getAttribute("data-state")).toBe("indeterminate")
    await user.click(checkbox)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  test("preventDefault in onSelect keeps the menu open but the state still changes", async () => {
    const user = setupUser()
    const onCheckedChange = vi.fn()
    render(
      <DropdownMenu.Root defaultOpen>
        <DropdownMenu.Trigger>Open</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content>
            <DropdownMenu.CheckboxItem checked={false} onCheckedChange={onCheckedChange} onSelect={(event) => event.preventDefault()}>
              Status bar
            </DropdownMenu.CheckboxItem>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    )
    await flush()
    await user.click(screen.getByRole("menuitemcheckbox"))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
    expect(screen.queryByRole("menu")).not.toBeNull()
  })

  test("radio items check the one matching the group value and report the chosen one", async () => {
    const user = setupUser()
    const onValueChange = vi.fn()
    render(<Checks onValueChange={onValueChange} />)
    await user.click(trigger())
    await flush()
    expect(screen.getByRole("menuitemradio", { name: "Top" }).getAttribute("aria-checked")).toBe("false")
    expect(screen.getByRole("menuitemradio", { name: "o Bottom" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("menuitemradio", { name: "o Bottom" }).getAttribute("data-state")).toBe("checked")
    expect(screen.getByTestId("radio-indicator").getAttribute("data-state")).toBe("checked")
    expect(screen.getByRole("group")).not.toBeNull()
    await user.click(screen.getByRole("menuitemradio", { name: "Top" }))
    await flush()
    expect(onValueChange).toHaveBeenCalledWith("top")
    await user.click(trigger())
    await flush()
    expect(screen.getByRole("menuitemradio", { name: "o Top" }).getAttribute("aria-checked")).toBe("true")
  })
})

describe("submenus", () => {
  function WithSub({ onSelect, dir }: { onSelect?: (event: Event) => void; dir?: "ltr" | "rtl" }) {
    return (
      <DropdownMenu.Root dir={dir}>
        <DropdownMenu.Trigger data-testid="trigger">Open</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content data-testid="content">
            <DropdownMenu.Item>New</DropdownMenu.Item>
            <DropdownMenu.Sub>
              <DropdownMenu.SubTrigger data-testid="sub-trigger">More</DropdownMenu.SubTrigger>
              <DropdownMenu.Portal>
                <DropdownMenu.SubContent data-testid="sub-content">
                  <DropdownMenu.Item onSelect={onSelect}>Save as</DropdownMenu.Item>
                  <DropdownMenu.Item>Export</DropdownMenu.Item>
                </DropdownMenu.SubContent>
              </DropdownMenu.Portal>
            </DropdownMenu.Sub>
            <DropdownMenu.Item>Quit</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    )
  }
  const subTrigger = () => screen.getByTestId("sub-trigger")
  const subContent = () => screen.queryByTestId("sub-content")

  test("the sub trigger is a menu item that describes the submenu", async () => {
    const user = setupUser()
    render(<WithSub />)
    await user.click(trigger())
    await flush()
    expect(subTrigger().getAttribute("role")).toBe("menuitem")
    expect(subTrigger().getAttribute("aria-haspopup")).toBe("menu")
    expect(subTrigger().getAttribute("aria-expanded")).toBe("false")
    expect(subTrigger().getAttribute("data-state")).toBe("closed")
    expect(subContent()).toBeNull()
    expect(subTrigger().hasAttribute("aria-controls")).toBe(false)
    await user.keyboard("{ArrowDown}{ArrowDown}")
    expect(active()).toBe(subTrigger())
    await user.keyboard("{ArrowRight}")
    await flush(50)
    expect(subTrigger().getAttribute("aria-expanded")).toBe("true")
    expect(subTrigger().getAttribute("data-state")).toBe("open")
    expect(subTrigger().getAttribute("aria-controls")).toBe(subContent()!.id)
    expect(subContent()!.getAttribute("role")).toBe("menu")
    expect(subContent()!.getAttribute("aria-labelledby")).toBe(subTrigger().id)
    expect(subContent()!.getAttribute("data-side")).toBe("right")
    expect(subContent()!.getAttribute("data-align")).toBe("start")
    expect(subContent()!.getAttribute("data-state")).toBe("open")
    expect(subContent()!.style.getPropertyValue("--radix-dropdown-menu-content-transform-origin")).toBe("var(--radix-popper-transform-origin)")
  })

  test.each([["{ArrowRight}"], ["{Enter}"], [" "]])("%s opens it and focuses its first item; ArrowLeft closes it and focuses the trigger again", async (key) => {
    const user = setupUser()
    render(<WithSub />)
    await openWithKeyboard(user)
    await user.keyboard("{ArrowDown}")
    expect(active()).toBe(subTrigger())
    await user.keyboard(key)
    await flush(50)
    expect(subContent()).not.toBeNull()
    expect(active()).toBe(item("Save as"))
    await user.keyboard("{ArrowDown}")
    expect(active()).toBe(item("Export"))
    await user.keyboard("{ArrowLeft}")
    await flush()
    expect(subContent()).toBeNull()
    expect(active()).toBe(subTrigger())
    expect(screen.queryByRole("menu")).not.toBeNull()
  })

  test("a click opens it without moving focus into it", async () => {
    const user = setupUser()
    render(<WithSub />)
    await user.click(trigger())
    await flush()
    await user.click(subTrigger())
    await flush(50)
    expect(subContent()).not.toBeNull()
    expect(active()).toBe(subTrigger())
  })

  test("hovering opens it after a short delay, and leaving first cancels it", async () => {
    const user = setupUser()
    render(<WithSub />)
    await user.click(trigger())
    await flush()
    await user.hover(subTrigger())
    await flush(99)
    expect(subContent()).toBeNull()
    await user.unhover(subTrigger())
    await flush(200)
    expect(subContent()).toBeNull()
    await user.hover(subTrigger())
    await flush(100)
    expect(subContent()).not.toBeNull()
    expect(active()).toBe(subTrigger())
  })

  test("hovering another item of the parent menu closes it", async () => {
    const user = setupUser()
    render(<WithSub />)
    await user.click(trigger())
    await flush()
    await user.hover(subTrigger())
    await flush(100)
    expect(subContent()).not.toBeNull()
    await user.hover(item("Quit"))
    await flush()
    expect(subContent()).toBeNull()
    expect(screen.queryByRole("menu")).not.toBeNull()
  })

  test("Escape in the submenu closes the whole menu and returns focus to the trigger", async () => {
    const user = setupUser()
    render(<WithSub />)
    await openWithKeyboard(user)
    await user.keyboard("{ArrowDown}{ArrowRight}")
    await flush(50)
    expect(subContent()).not.toBeNull()
    await user.keyboard("{Escape}")
    await flush()
    expect(subContent()).toBeNull()
    expect(screen.queryByRole("menu")).toBeNull()
    expect(active()).toBe(trigger())
  })

  test("selecting a submenu item closes everything", async () => {
    const user = setupUser()
    const onSelect = vi.fn()
    render(<WithSub onSelect={onSelect} />)
    await user.click(trigger())
    await flush()
    await user.click(subTrigger())
    await flush(50)
    // No pointer travel from the trigger: without layout the grace area is empty and would close the submenu
    fireEvent.click(item("Save as"))
    await flush()
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(subContent()).toBeNull()
    expect(screen.queryByRole("menu")).toBeNull()
    expect(active()).toBe(trigger())
  })

  test("a pointer down inside the submenu does not dismiss the parent menu", async () => {
    const user = setupUser()
    render(<WithSub />)
    await user.click(trigger())
    await flush()
    await user.click(subTrigger())
    await flush(50)
    fireEvent.pointerDown(subContent()!)
    await flush()
    expect(subContent()).not.toBeNull()
    expect(screen.getByTestId("content")).not.toBeNull()
  })

  test("closing the parent menu closes the submenu", async () => {
    const user = setupUser()
    render(<WithSub />)
    await user.click(trigger())
    await flush()
    await user.click(subTrigger())
    await flush(50)
    fireEvent.pointerDown(document.body)
    await flush()
    expect(subContent()).toBeNull()
    expect(screen.queryByRole("menu")).toBeNull()
  })

  test("in rtl the submenu opens with ArrowLeft, closes with ArrowRight and sits on the left", async () => {
    const user = setupUser()
    render(<WithSub dir="rtl" />)
    await openWithKeyboard(user)
    await user.keyboard("{ArrowDown}{ArrowLeft}")
    await flush(50)
    expect(subContent()).not.toBeNull()
    expect(subContent()!.getAttribute("data-side")).toBe("left")
    await user.keyboard("{ArrowRight}")
    await flush()
    expect(subContent()).toBeNull()
  })

  test("moving the pointer toward an open submenu does not focus the items on the way, until the grace period ends", async () => {
    const user = setupUser()
    render(<WithSub />)
    await user.click(trigger())
    await flush()
    await user.hover(subTrigger())
    await flush(100)
    const rect = { left: 200, right: 300, top: 0, bottom: 100, width: 100, height: 100, x: 200, y: 0, toJSON() {} } as DOMRect
    vi.spyOn(subContent()!, "getBoundingClientRect").mockReturnValue(rect)
    // Leave the trigger towards the submenu on its right
    fireEvent.pointerMove(screen.getByTestId("content"), { clientX: 10, clientY: 10, pointerType: "mouse" })
    fireEvent.pointerLeave(subTrigger(), { clientX: 10, clientY: 10, pointerType: "mouse" })
    fireEvent.pointerMove(screen.getByTestId("content"), { clientX: 60, clientY: 20, pointerType: "mouse" })
    fireEvent.pointerMove(item("Quit"), { clientX: 100, clientY: 30, pointerType: "mouse" })
    await flush()
    expect(active()).not.toBe(item("Quit"))
    expect(subContent()).not.toBeNull()
    await flush(300)
    fireEvent.pointerMove(item("Quit"), { clientX: 101, clientY: 30, pointerType: "mouse" })
    await flush()
    expect(active()).toBe(item("Quit"))
    expect(subContent()).toBeNull()
  })

  test("moving the pointer away from the submenu does not hold on to it", async () => {
    const user = setupUser()
    render(<WithSub />)
    await user.click(trigger())
    await flush()
    await user.hover(subTrigger())
    await flush(100)
    const rect = { left: 200, right: 300, top: 0, bottom: 100, width: 100, height: 100, x: 200, y: 0, toJSON() {} } as DOMRect
    vi.spyOn(subContent()!, "getBoundingClientRect").mockReturnValue(rect)
    fireEvent.pointerMove(screen.getByTestId("content"), { clientX: 50, clientY: 10, pointerType: "mouse" })
    fireEvent.pointerLeave(subTrigger(), { clientX: 50, clientY: 10, pointerType: "mouse" })
    // Heading left, away from the submenu
    fireEvent.pointerMove(screen.getByTestId("content"), { clientX: 20, clientY: 20, pointerType: "mouse" })
    fireEvent.pointerMove(item("New"), { clientX: 20, clientY: 20, pointerType: "mouse" })
    await flush()
    expect(active()).toBe(item("New"))
    expect(subContent()).toBeNull()
  })
})
