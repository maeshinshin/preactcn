import { createRef, type ComponentProps } from "preact"
import { useState } from "preact/hooks"
import { act, fireEvent, render, screen } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
import { flush, mockAnimations, setupUser, useFakeTimers } from "./helpers"
import * as NavigationMenu from "../src/radix/navigation-menu"

type RootProps = ComponentProps<typeof NavigationMenu.Root>

// Two items with content, then a plain link; the order is what `data-motion` and the keyboard navigation follow
function Example({
  root,
  viewport = false,
  indicator = false,
  activeDocs = false,
}: {
  root?: Partial<RootProps>
  viewport?: boolean
  indicator?: boolean
  activeDocs?: boolean
}) {
  return (
    <NavigationMenu.Root data-testid="root" {...root}>
      <NavigationMenu.List data-testid="list">
        <NavigationMenu.Item value="one" data-testid="item-one">
          <NavigationMenu.Trigger data-testid="trigger-one">One</NavigationMenu.Trigger>
          <NavigationMenu.Content data-testid="content-one">
            <NavigationMenu.Link href="/one/a" onClick={(event) => event.preventDefault()}>
              One A
            </NavigationMenu.Link>
            <NavigationMenu.Link href="/one/b" onClick={(event) => event.preventDefault()}>
              One B
            </NavigationMenu.Link>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
        <NavigationMenu.Item value="two">
          <NavigationMenu.Trigger data-testid="trigger-two">Two</NavigationMenu.Trigger>
          <NavigationMenu.Content data-testid="content-two">
            <NavigationMenu.Link href="/two/a" onClick={(event) => event.preventDefault()}>
              Two A
            </NavigationMenu.Link>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
        <NavigationMenu.Item>
          <NavigationMenu.Link data-testid="docs" href="/docs" active={activeDocs}>
            Docs
          </NavigationMenu.Link>
        </NavigationMenu.Item>
      </NavigationMenu.List>
      {indicator && <NavigationMenu.Indicator data-testid="indicator" />}
      {viewport && <NavigationMenu.Viewport data-testid="viewport" />}
    </NavigationMenu.Root>
  )
}

const byId = (id: string) => screen.getByTestId(id)
const queryById = (id: string) => screen.queryByTestId(id)
const activeTestId = () => document.activeElement?.getAttribute("data-testid")
const mouse = { pointerType: "mouse" }

// happy-dom has no layout: report sizes and offsets per data-testid
function mockBoxes(boxes: Record<string, { width?: number; height?: number; left?: number; top?: number }>) {
  const box = (element: Element) => boxes[element.getAttribute("data-testid") ?? ""]
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    return box(this)?.width ?? 0
  })
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
    return box(this)?.height ?? 0
  })
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
    return box(this)?.left ?? 0
  })
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
    return box(this)?.top ?? 0
  })
}

useFakeTimers()

describe("structure and semantics", () => {
  test("is a labelled navigation landmark around a list in a relatively positioned track", () => {
    render(<Example />)
    const nav = screen.getByRole("navigation", { name: "Main" })
    expect(nav).toBe(byId("root"))
    expect(nav.getAttribute("data-orientation")).toBe("horizontal")
    expect(nav.getAttribute("dir")).toBe("ltr")
    const list = byId("list")
    expect(list.tagName).toBe("UL")
    expect(list.getAttribute("data-orientation")).toBe("horizontal")
    expect(list.getAttribute("dir")).toBe("ltr")
    expect(list.parentElement!.style.position).toBe("relative")
    expect(list.parentElement!.parentElement).toBe(nav)
    expect(screen.getAllByRole("listitem")).toHaveLength(3)
  })

  test("triggers start collapsed and no content is rendered", () => {
    render(<Example />)
    for (const name of ["One", "Two"]) {
      const trigger = screen.getByRole("button", { name })
      expect(trigger.getAttribute("aria-expanded")).toBe("false")
      expect(trigger.getAttribute("data-state")).toBe("closed")
      expect(trigger.hasAttribute("aria-controls")).toBe(false)
      expect(trigger.id).not.toBe("")
    }
    expect(queryById("content-one")).toBeNull()
    expect(queryById("content-two")).toBeNull()
  })

  test("Root takes dir and orientation and passes them down", () => {
    render(<Example root={{ dir: "rtl", orientation: "vertical" }} />)
    expect(byId("root").getAttribute("dir")).toBe("rtl")
    expect(byId("root").getAttribute("data-orientation")).toBe("vertical")
    expect(byId("list").getAttribute("data-orientation")).toBe("vertical")
    expect(byId("list").getAttribute("dir")).toBe("rtl")
  })

  test("parts deliver their elements through a ref", () => {
    const refs = Array.from({ length: 7 }, () => createRef<HTMLElement>())
    render(
      <NavigationMenu.Root ref={refs[0]} defaultValue="a">
        <NavigationMenu.List ref={refs[1]}>
          <NavigationMenu.Item value="a" ref={refs[2]}>
            <NavigationMenu.Trigger ref={refs[3]}>A</NavigationMenu.Trigger>
            <NavigationMenu.Content ref={refs[4]}>
              <NavigationMenu.Link href="/" ref={refs[5]}>
                link
              </NavigationMenu.Link>
            </NavigationMenu.Content>
          </NavigationMenu.Item>
        </NavigationMenu.List>
        <NavigationMenu.Viewport ref={refs[6]} />
      </NavigationMenu.Root>
    )
    expect(refs.map((ref) => ref.current?.tagName)).toEqual(["NAV", "UL", "LI", "BUTTON", "DIV", "A", "DIV"])
  })

  test("a part outside its parents throws a readable error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<NavigationMenu.Trigger>x</NavigationMenu.Trigger>)).toThrow(/NavigationMenu/)
    spy.mockRestore()
  })

  test("a disabled trigger is inert", async () => {
    const user = setupUser()
    render(
      <NavigationMenu.Root>
        <NavigationMenu.List>
          <NavigationMenu.Item value="a">
            <NavigationMenu.Trigger disabled>A</NavigationMenu.Trigger>
            <NavigationMenu.Content data-testid="content">body</NavigationMenu.Content>
          </NavigationMenu.Item>
        </NavigationMenu.List>
      </NavigationMenu.Root>
    )
    const trigger = screen.getByRole("button", { name: "A" })
    expect(trigger.getAttribute("data-disabled")).toBe("")
    expect((trigger as HTMLButtonElement).disabled).toBe(true)
    await user.hover(trigger)
    await user.click(trigger)
    await flush(500)
    expect(queryById("content")).toBeNull()
  })
})

describe("opening and closing", () => {
  test("a click opens the content in place, wired to its trigger, and a second click closes it", async () => {
    const onValueChange = vi.fn()
    render(<Example root={{ onValueChange }} />)
    const trigger = byId("trigger-one")
    fireEvent.click(trigger)
    await flush()
    const content = byId("content-one")
    expect(onValueChange).toHaveBeenLastCalledWith("one")
    expect(trigger.getAttribute("aria-expanded")).toBe("true")
    expect(trigger.getAttribute("data-state")).toBe("open")
    expect(trigger.getAttribute("aria-controls")).toBe(content.id)
    expect(content.getAttribute("aria-labelledby")).toBe(trigger.id)
    expect(content.getAttribute("data-state")).toBe("open")
    expect(content.getAttribute("data-orientation")).toBe("horizontal")
    expect(content.getAttribute("dir")).toBe("ltr")
    expect(content.hasAttribute("data-motion")).toBe(false)
    // In place: a sibling of the trigger inside the item
    expect(content.parentElement).toBe(byId("item-one"))
    expect(queryById("content-two")).toBeNull()

    fireEvent.click(trigger)
    await flush()
    expect(onValueChange).toHaveBeenLastCalledWith("")
    expect(queryById("content-one")).toBeNull()
    expect(trigger.getAttribute("aria-expanded")).toBe("false")
  })

  test("Enter and Space on a focused trigger toggle it", async () => {
    const user = setupUser()
    render(<Example />)
    await user.tab()
    expect(document.activeElement).toBe(byId("trigger-one"))
    await user.keyboard("{Enter}")
    await flush()
    expect(queryById("content-one")).not.toBeNull()
    await user.keyboard(" ")
    await flush()
    expect(queryById("content-one")).toBeNull()
    await user.keyboard(" ")
    await flush()
    expect(queryById("content-one")).not.toBeNull()
  })

  test("opening another item replaces the open one", async () => {
    render(<Example />)
    fireEvent.click(byId("trigger-one"))
    await flush()
    fireEvent.click(byId("trigger-two"))
    await flush()
    expect(queryById("content-one")).toBeNull()
    expect(queryById("content-two")).not.toBeNull()
    expect(byId("trigger-one").getAttribute("aria-expanded")).toBe("false")
    expect(byId("trigger-two").getAttribute("aria-expanded")).toBe("true")
  })

  test("controlled: the value prop decides and onValueChange only reports", async () => {
    const onValueChange = vi.fn()
    const { rerender } = render(<Example root={{ value: "", onValueChange }} />)
    fireEvent.click(byId("trigger-one"))
    await flush()
    expect(onValueChange).toHaveBeenCalledWith("one")
    expect(queryById("content-one")).toBeNull()
    rerender(<Example root={{ value: "two", onValueChange }} />)
    await flush()
    expect(queryById("content-two")).not.toBeNull()
    expect(byId("trigger-two").getAttribute("aria-expanded")).toBe("true")
    rerender(<Example root={{ value: "", onValueChange }} />)
    await flush()
    expect(queryById("content-two")).toBeNull()
  })

  test("defaultValue opens an item at mount", async () => {
    render(<Example root={{ defaultValue: "two" }} />)
    await flush()
    expect(queryById("content-two")).not.toBeNull()
    expect(byId("trigger-two").getAttribute("aria-expanded")).toBe("true")
  })

  test("stays mounted with data-state closed until the exit animation ends", async () => {
    const endAnimation = mockAnimations()
    render(<Example root={{ defaultValue: "one" }} />)
    await flush()
    const content = byId("content-one")
    fireEvent.click(byId("trigger-one"))
    await flush()
    expect(byId("content-one")).toBe(content)
    expect(content.getAttribute("data-state")).toBe("closed")
    // Nothing can be clicked while it animates out
    expect(content.style.pointerEvents).toBe("none")
    endAnimation(content)
    await flush()
    expect(queryById("content-one")).toBeNull()
  })
})

describe("hover", () => {
  test("hovering a trigger opens it after delayDuration and leaving closes it after 150ms", async () => {
    const user = setupUser()
    const onValueChange = vi.fn()
    render(<Example root={{ onValueChange }} />)
    const trigger = byId("trigger-one")
    await user.hover(trigger)
    await flush(199)
    expect(queryById("content-one")).toBeNull()
    await flush(1)
    expect(queryById("content-one")).not.toBeNull()
    expect(onValueChange).toHaveBeenCalledTimes(1)
    expect(onValueChange).toHaveBeenCalledWith("one")
    await user.unhover(trigger)
    await flush(149)
    expect(queryById("content-one")).not.toBeNull()
    await flush(1)
    expect(queryById("content-one")).toBeNull()
    expect(onValueChange).toHaveBeenLastCalledWith("")
  })

  test("delayDuration is configurable", async () => {
    const user = setupUser()
    render(<Example root={{ delayDuration: 50 }} />)
    await user.hover(byId("trigger-one"))
    await flush(49)
    expect(queryById("content-one")).toBeNull()
    await flush(1)
    expect(queryById("content-one")).not.toBeNull()
  })

  test("leaving before the delay never opens it", async () => {
    const user = setupUser()
    render(<Example />)
    await user.hover(byId("trigger-one"))
    await flush(100)
    await user.unhover(byId("trigger-one"))
    await flush(1000)
    expect(queryById("content-one")).toBeNull()
  })

  test("moving from the trigger onto the content keeps it open; leaving the content closes it", async () => {
    const user = setupUser()
    render(<Example />)
    await user.hover(byId("trigger-one"))
    await flush(200)
    await user.hover(byId("content-one"))
    await flush(1000)
    expect(queryById("content-one")).not.toBeNull()
    await user.unhover(byId("content-one"))
    await flush(150)
    expect(queryById("content-one")).toBeNull()
  })

  test("once one item is open, another opens at once; the delay returns after skipDelayDuration", async () => {
    const user = setupUser()
    render(<Example />)
    await user.hover(byId("trigger-one"))
    await flush(200)
    expect(queryById("content-one")).not.toBeNull()
    await user.hover(byId("trigger-two"))
    await flush()
    expect(queryById("content-one")).toBeNull()
    expect(queryById("content-two")).not.toBeNull()

    await user.unhover(byId("trigger-two"))
    await flush(150)
    expect(queryById("content-two")).toBeNull()
    // Closed 100ms ago: still inside the skip window
    await flush(100)
    await user.hover(byId("trigger-one"))
    await flush()
    expect(queryById("content-one")).not.toBeNull()

    await user.unhover(byId("trigger-one"))
    await flush(150)
    expect(queryById("content-one")).toBeNull()
    await flush(300)
    await user.hover(byId("trigger-one"))
    await flush(199)
    expect(queryById("content-one")).toBeNull()
    await flush(1)
    expect(queryById("content-one")).not.toBeNull()
  })

  test("touch pointers do not open or close it", async () => {
    render(<Example />)
    fireEvent.pointerMove(byId("trigger-one"), { pointerType: "touch" })
    await flush(500)
    expect(queryById("content-one")).toBeNull()
    fireEvent.click(byId("trigger-one"))
    await flush()
    expect(queryById("content-one")).not.toBeNull()
    fireEvent.pointerLeave(byId("trigger-one"), { pointerType: "touch" })
    await flush(500)
    expect(queryById("content-one")).not.toBeNull()
  })

  test("a click that closes it keeps it closed until the pointer comes back", async () => {
    render(<Example />)
    const trigger = byId("trigger-one")
    fireEvent.pointerEnter(trigger, mouse)
    fireEvent.pointerMove(trigger, mouse)
    await flush(200)
    expect(queryById("content-one")).not.toBeNull()
    fireEvent.click(trigger)
    await flush()
    expect(queryById("content-one")).toBeNull()
    fireEvent.pointerLeave(trigger, mouse)
    await flush(150)
    fireEvent.pointerMove(trigger, mouse)
    await flush(500)
    expect(queryById("content-one")).toBeNull()
    fireEvent.pointerEnter(trigger, mouse)
    fireEvent.pointerLeave(trigger, mouse)
    fireEvent.pointerEnter(trigger, mouse)
    fireEvent.pointerMove(trigger, mouse)
    await flush(200)
    expect(queryById("content-one")).not.toBeNull()
  })
})

describe("dismissing", () => {
  test("Escape closes it and focus goes back to the trigger when it was inside the content", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(byId("trigger-one"))
    await flush(200)
    await user.keyboard("{ArrowDown}")
    await flush()
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "One A" }))
    await user.keyboard("{Escape}")
    await flush()
    expect(queryById("content-one")).toBeNull()
    expect(document.activeElement).toBe(byId("trigger-one"))
  })

  test("Escape leaves focus alone when it is not inside the content", async () => {
    const user = setupUser()
    render(
      <>
        <button data-testid="outside" type="button" />
        <Example root={{ defaultValue: "one" }} />
      </>
    )
    await flush()
    byId("outside").focus()
    await user.keyboard("{Escape}")
    await flush()
    expect(queryById("content-one")).toBeNull()
    expect(activeTestId()).toBe("outside")
  })

  test("after Escape the trigger does not reopen on pointer moves until the pointer re-enters", async () => {
    render(<Example />)
    const trigger = byId("trigger-one")
    fireEvent.click(trigger)
    await flush()
    fireEvent.keyDown(document.body, { key: "Escape" })
    await flush()
    expect(queryById("content-one")).toBeNull()
    fireEvent.pointerMove(trigger, mouse)
    await flush(500)
    expect(queryById("content-one")).toBeNull()
    fireEvent.pointerEnter(trigger, mouse)
    fireEvent.pointerMove(trigger, mouse)
    await flush(200)
    expect(queryById("content-one")).not.toBeNull()
  })

  test("a pointer down outside closes it; one on a trigger or inside the content does not", async () => {
    render(<Example root={{ defaultValue: "one" }} />)
    await flush()
    await flush()
    fireEvent.pointerDown(byId("content-one"), mouse)
    fireEvent.pointerDown(byId("trigger-one"), mouse)
    await flush()
    expect(queryById("content-one")).not.toBeNull()
    fireEvent.pointerDown(document.body, mouse)
    await flush()
    expect(queryById("content-one")).toBeNull()
  })

  test("focus leaving the menu closes it; focus arriving from outside the menu does not", async () => {
    const user = setupUser()
    render(
      <>
        <button data-testid="outside" type="button" />
        <Example />
      </>
    )
    await user.click(byId("trigger-one"))
    await flush(200)
    expect(queryById("content-one")).not.toBeNull()
    byId("outside").focus()
    await flush()
    expect(queryById("content-one")).toBeNull()

    // Opened by hover while focus rests elsewhere
    byId("outside").focus()
    await user.hover(byId("trigger-two"))
    await flush(200)
    expect(queryById("content-two")).not.toBeNull()
    document.body.focus()
    byId("outside").focus()
    await flush()
    expect(queryById("content-two")).not.toBeNull()
  })

  test("selecting a link inside the content reports onSelect, closes the menu and returns focus to the trigger", async () => {
    const user = setupUser()
    const onSelect = vi.fn()
    render(
      <NavigationMenu.Root>
        <NavigationMenu.List>
          <NavigationMenu.Item value="a">
            <NavigationMenu.Trigger data-testid="trigger">A</NavigationMenu.Trigger>
            <NavigationMenu.Content>
              <NavigationMenu.Link href="/a" onSelect={onSelect} onClick={(event) => event.preventDefault()}>
                inside
              </NavigationMenu.Link>
            </NavigationMenu.Content>
          </NavigationMenu.Item>
        </NavigationMenu.List>
      </NavigationMenu.Root>
    )
    await user.click(byId("trigger"))
    await flush(200)
    await user.click(screen.getByRole("link", { name: "inside" }))
    await flush()
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0]![0]).toBeInstanceOf(Event)
    expect(screen.queryByRole("link", { name: "inside" })).toBeNull()
    expect(activeTestId()).toBe("trigger")
  })

  test("preventing the select event, or a meta-click, keeps the menu open", async () => {
    const onSelect = vi.fn((event: Event) => event.preventDefault())
    render(
      <NavigationMenu.Root defaultValue="a">
        <NavigationMenu.List>
          <NavigationMenu.Item value="a">
            <NavigationMenu.Trigger>A</NavigationMenu.Trigger>
            <NavigationMenu.Content data-testid="content">
              <NavigationMenu.Link href="/a" onSelect={onSelect} onClick={(event) => event.preventDefault()}>
                keep
              </NavigationMenu.Link>
              <NavigationMenu.Link href="/b" onClick={(event) => event.preventDefault()}>
                meta
              </NavigationMenu.Link>
            </NavigationMenu.Content>
          </NavigationMenu.Item>
        </NavigationMenu.List>
      </NavigationMenu.Root>
    )
    await flush()
    fireEvent.click(screen.getByRole("link", { name: "keep" }))
    await flush()
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(queryById("content")).not.toBeNull()
    fireEvent.click(screen.getByRole("link", { name: "meta" }), { metaKey: true })
    await flush()
    expect(queryById("content")).not.toBeNull()
    fireEvent.click(screen.getByRole("link", { name: "meta" }))
    await flush()
    expect(queryById("content")).toBeNull()
  })
})

describe("links", () => {
  test("an active link is marked for the current page", () => {
    render(<Example activeDocs />)
    const docs = byId("docs")
    expect(docs.tagName).toBe("A")
    expect(docs.getAttribute("data-active")).toBe("")
    expect(docs.getAttribute("aria-current")).toBe("page")
    expect(byId("root").querySelectorAll("[data-active]")).toHaveLength(1)
  })

  test("an inactive link carries neither", () => {
    render(<Example />)
    expect(byId("docs").hasAttribute("data-active")).toBe(false)
    expect(byId("docs").hasAttribute("aria-current")).toBe(false)
  })

  test("asChild turns the child element into the link", async () => {
    const user = setupUser()
    const Anchor = (props: ComponentProps<"a">) => <a {...props} />
    render(
      <NavigationMenu.Root>
        <NavigationMenu.List>
          <NavigationMenu.Item>
            <NavigationMenu.Link asChild active class="from-link">
              <Anchor href="/docs" class="from-child" data-testid="custom">
                Documentation
              </Anchor>
            </NavigationMenu.Link>
          </NavigationMenu.Item>
        </NavigationMenu.List>
      </NavigationMenu.Root>
    )
    const link = byId("custom")
    expect(link.tagName).toBe("A")
    expect(link.getAttribute("data-active")).toBe("")
    expect(link.getAttribute("aria-current")).toBe("page")
    expect(link.className).toContain("from-link")
    expect(link.className).toContain("from-child")
    // It is part of the keyboard group too
    await user.tab()
    expect(document.activeElement).toBe(link)
  })
})

describe("keyboard", () => {
  test("arrow keys, Home and End move focus among the triggers and links of the list without wrapping", async () => {
    const user = setupUser()
    render(<Example />)
    byId("trigger-one").focus()
    const press = async (key: string) => {
      await user.keyboard(key)
      await flush()
    }
    await press("{ArrowRight}")
    expect(activeTestId()).toBe("trigger-two")
    await press("{ArrowDown}")
    expect(activeTestId()).toBe("docs")
    await press("{ArrowRight}")
    expect(activeTestId()).toBe("docs")
    await press("{ArrowLeft}")
    expect(activeTestId()).toBe("trigger-two")
    await press("{ArrowUp}")
    expect(activeTestId()).toBe("trigger-one")
    await press("{ArrowLeft}")
    expect(activeTestId()).toBe("trigger-one")
    await press("{End}")
    expect(activeTestId()).toBe("docs")
    await press("{Home}")
    expect(activeTestId()).toBe("trigger-one")
  })

  test("in a right-to-left menu the horizontal arrows are mirrored", async () => {
    const user = setupUser()
    render(<Example root={{ dir: "rtl" }} />)
    byId("trigger-one").focus()
    await user.keyboard("{ArrowLeft}")
    await flush()
    expect(activeTestId()).toBe("trigger-two")
    await user.keyboard("{ArrowRight}")
    await flush()
    expect(activeTestId()).toBe("trigger-one")
  })

  test("ArrowDown on an open trigger moves focus into its content, where the arrows move among its links", async () => {
    const user = setupUser()
    render(<Example />)
    await user.click(byId("trigger-one"))
    await flush(200)
    await user.keyboard("{ArrowDown}")
    await flush()
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "One A" }))
    await user.keyboard("{ArrowDown}")
    await flush()
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "One B" }))
    await user.keyboard("{ArrowDown}")
    await flush()
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "One B" }))
    await user.keyboard("{ArrowUp}")
    await flush()
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "One A" }))
  })

  test("in a vertical menu ArrowRight enters the content and ArrowDown moves to the next trigger", async () => {
    const user = setupUser()
    render(<Example root={{ orientation: "vertical" }} />)
    await user.click(byId("trigger-one"))
    await flush(200)
    expect(byId("content-one").getAttribute("data-orientation")).toBe("vertical")
    await user.keyboard("{ArrowDown}")
    await flush()
    expect(activeTestId()).toBe("trigger-two")
    byId("trigger-one").focus()
    await user.keyboard("{ArrowRight}")
    await flush()
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "One A" }))
  })

  test("in a right-to-left vertical menu ArrowLeft enters the content", async () => {
    const user = setupUser()
    render(<Example root={{ orientation: "vertical", dir: "rtl" }} />)
    await user.click(byId("trigger-one"))
    await flush(200)
    await user.keyboard("{ArrowRight}")
    await flush()
    // The right arrow is "previous" in right-to-left: nothing before the first trigger
    expect(activeTestId()).toBe("trigger-one")
    await user.keyboard("{ArrowLeft}")
    await flush()
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "One A" }))
  })

  test("an arrow key on a closed trigger does not open it", async () => {
    const user = setupUser()
    render(<Example />)
    byId("trigger-one").focus()
    await user.keyboard("{ArrowDown}")
    await flush()
    expect(queryById("content-one")).toBeNull()
    expect(activeTestId()).toBe("trigger-two")
  })

  test("Tab from an open trigger enters the content; Tab and Shift+Tab at its edges lead back to the list", async () => {
    const user = setupUser()
    render(<Example viewport />)
    await user.click(byId("trigger-one"))
    await flush(200)
    expect(document.activeElement).toBe(byId("trigger-one"))

    await user.tab()
    await flush()
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "One A" }))
    await user.tab()
    await flush()
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "One B" }))
    // Past the last link the focus proxy takes it and the browser continues to the next trigger
    await user.tab()
    await flush()
    expect(document.activeElement).toBe(byId("trigger-two"))

    // Back into the content from the next trigger is not possible (it only leads to its own); go via Shift+Tab from the first link
    byId("trigger-one").focus()
    await user.tab()
    await flush()
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "One A" }))
    await user.tab({ shift: true })
    await flush()
    expect(document.activeElement).toBe(byId("trigger-one"))
  })

  test("the focus proxy is a hidden tab stop that only exists while the item is open", async () => {
    render(<Example viewport />)
    const item = byId("item-one")
    expect(item.querySelectorAll("[aria-hidden][tabindex='0']")).toHaveLength(0)
    fireEvent.click(byId("trigger-one"))
    await flush()
    expect(item.querySelectorAll("span[aria-hidden='true'][tabindex='0']")).toHaveLength(1)
    // With a viewport the content is elsewhere: the accessibility tree is told it belongs to the item
    expect(item.querySelectorAll(`span[aria-owns="${byId("content-one").id}"]`)).toHaveLength(1)
    fireEvent.click(byId("trigger-one"))
    await flush()
    expect(item.querySelectorAll("span")).toHaveLength(0)
  })

  test("content links leave the tab order when focus leaves the content and return when it is entered again", async () => {
    const user = setupUser()
    render(
      <>
        <Example />
        <button data-testid="outside" type="button" />
      </>
    )
    await user.click(byId("trigger-one"))
    await flush(200)
    await user.keyboard("{ArrowDown}")
    await flush()
    byId("trigger-one").focus()
    await flush()
    const link = screen.getByRole("link", { name: "One A" })
    expect(link.getAttribute("tabindex")).toBe("-1")
    await user.keyboard("{ArrowDown}")
    await flush()
    expect(document.activeElement).toBe(link)
    expect(link.getAttribute("tabindex")).not.toBe("-1")
  })
})

describe("direction of motion", () => {
  test("content entering and leaving is told which way, following the order of the triggers", async () => {
    const endAnimation = mockAnimations()
    render(<Example root={{ defaultValue: "one" }} />)
    await flush()
    const one = byId("content-one")
    expect(one.hasAttribute("data-motion")).toBe(false)

    fireEvent.click(byId("trigger-two"))
    await flush()
    const two = byId("content-two")
    expect(one.getAttribute("data-motion")).toBe("to-start")
    expect(two.getAttribute("data-motion")).toBe("from-end")
    endAnimation(one)
    await flush()
    expect(queryById("content-one")).toBeNull()

    fireEvent.click(byId("trigger-one"))
    await flush()
    const oneAgain = byId("content-one")
    expect(two.getAttribute("data-motion")).toBe("to-end")
    expect(oneAgain.getAttribute("data-motion")).toBe("from-start")
    endAnimation(two)
    await flush()

    // Closing everything has no direction
    fireEvent.click(byId("trigger-one"))
    await flush()
    expect(oneAgain.hasAttribute("data-motion")).toBe(false)
  })

  test("right-to-left reverses the direction", async () => {
    const endAnimation = mockAnimations()
    render(<Example root={{ defaultValue: "one", dir: "rtl" }} />)
    await flush()
    fireEvent.click(byId("trigger-two"))
    await flush()
    expect(byId("content-one").getAttribute("data-motion")).toBe("to-end")
    expect(byId("content-two").getAttribute("data-motion")).toBe("from-start")
    endAnimation(byId("content-one"))
  })
})

describe("viewport", () => {
  test("open content is rendered inside the Viewport, which takes the size of the content", async () => {
    mockBoxes({ "content-one": { width: 300, height: 120 }, "content-two": { width: 180, height: 60 } })
    render(<Example viewport />)
    expect(queryById("viewport")).toBeNull()
    fireEvent.click(byId("trigger-one"))
    await flush()
    await flush()
    const viewport = byId("viewport")
    const content = byId("content-one")
    expect(content.parentElement).toBe(viewport)
    expect(viewport.getAttribute("data-state")).toBe("open")
    expect(viewport.getAttribute("data-orientation")).toBe("horizontal")
    expect(viewport.style.getPropertyValue("--radix-navigation-menu-viewport-width")).toBe("300px")
    expect(viewport.style.getPropertyValue("--radix-navigation-menu-viewport-height")).toBe("120px")
    // Content in a viewport has no data-state of its own (the viewport carries it) but keeps its ARIA wiring
    expect(content.hasAttribute("data-state")).toBe(false)
    expect(content.getAttribute("aria-labelledby")).toBe(byId("trigger-one").id)
    expect(byId("trigger-one").getAttribute("aria-controls")).toBe(content.id)
    expect(byId("item-one").contains(content)).toBe(false)

    fireEvent.click(byId("trigger-two"))
    await flush()
    await flush()
    expect(viewport.contains(byId("content-two"))).toBe(true)
    expect(viewport.style.getPropertyValue("--radix-navigation-menu-viewport-width")).toBe("180px")
    expect(viewport.style.getPropertyValue("--radix-navigation-menu-viewport-height")).toBe("60px")
  })

  test("the Viewport is only there while an item is open", async () => {
    render(<Example viewport />)
    expect(queryById("viewport")).toBeNull()
    fireEvent.click(byId("trigger-one"))
    await flush()
    expect(queryById("viewport")).not.toBeNull()
    fireEvent.click(byId("trigger-one"))
    await flush()
    expect(queryById("viewport")).toBeNull()
    expect(queryById("content-one")).toBeNull()
  })

  test("it stays with its last content until the exit animation ends", async () => {
    const endAnimation = mockAnimations()
    render(<Example viewport root={{ defaultValue: "one" }} />)
    await flush()
    await flush()
    const viewport = byId("viewport")
    const content = byId("content-one")
    fireEvent.click(byId("trigger-one"))
    await flush()
    expect(byId("viewport")).toBe(viewport)
    expect(byId("content-one")).toBe(content)
    expect(viewport.getAttribute("data-state")).toBe("closed")
    expect(content.hasAttribute("data-state")).toBe(false)
    expect(viewport.style.pointerEvents).toBe("none")
    endAnimation(viewport)
    await flush()
    expect(queryById("viewport")).toBeNull()
    expect(queryById("content-one")).toBeNull()
  })

  test("switching items keeps the leaving content in the Viewport for its exit animation, with directions", async () => {
    // As the upstream styles do: content in a viewport animates by its motion direction only
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (node) =>
        ({
          get animationName() {
            return (node as HTMLElement).getAttribute("data-motion")?.startsWith("to-") ? "slide-out" : "slide-in"
          },
          display: "block",
        }) as CSSStyleDeclaration
    )
    const endAnimation = (node: Element) =>
      act(() => {
        node.dispatchEvent(Object.assign(new Event("animationend", { bubbles: true }), { animationName: "slide-out" }))
      })
    render(<Example viewport root={{ defaultValue: "one" }} />)
    await flush()
    await flush()
    const one = byId("content-one")
    expect(one.hasAttribute("data-motion")).toBe(false)
    fireEvent.click(byId("trigger-two"))
    await flush()
    await flush()
    const two = byId("content-two")
    expect(byId("content-one")).toBe(one)
    expect(one.parentElement).toBe(byId("viewport"))
    expect(two.parentElement).toBe(byId("viewport"))
    expect(one.getAttribute("data-motion")).toBe("to-start")
    expect(two.getAttribute("data-motion")).toBe("from-end")
    expect(one.hasAttribute("data-state")).toBe(false)
    expect(two.hasAttribute("data-state")).toBe(false)
    endAnimation(one)
    await flush()
    expect(queryById("content-one")).toBeNull()
    expect(queryById("content-two")).not.toBeNull()
  })

  test("pointer events on the Viewport keep the menu open like the content's own", async () => {
    const user = setupUser()
    render(<Example viewport />)
    await user.hover(byId("trigger-one"))
    await flush(200)
    await flush()
    await user.hover(byId("viewport"))
    await flush(1000)
    expect(queryById("content-one")).not.toBeNull()
    await user.unhover(byId("viewport"))
    await flush(150)
    expect(queryById("content-one")).toBeNull()
  })

  test("a pointer down in the Viewport outside the content does not dismiss the menu", async () => {
    render(<Example viewport root={{ defaultValue: "one" }} />)
    await flush()
    await flush()
    fireEvent.pointerDown(byId("viewport"), mouse)
    await flush()
    expect(queryById("content-one")).not.toBeNull()
    fireEvent.pointerDown(document.body, mouse)
    await flush()
    expect(queryById("content-one")).toBeNull()
  })

  test("Escape closes content that lives in the Viewport and returns focus to its trigger", async () => {
    const user = setupUser()
    render(<Example viewport />)
    await user.click(byId("trigger-one"))
    await flush(200)
    await user.keyboard("{ArrowDown}")
    await flush()
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "One A" }))
    await user.keyboard("{Escape}")
    await flush()
    expect(queryById("content-one")).toBeNull()
    expect(document.activeElement).toBe(byId("trigger-one"))
  })

  test("a link selected inside the Viewport closes the menu", async () => {
    render(<Example viewport root={{ defaultValue: "one" }} />)
    await flush()
    await flush()
    fireEvent.click(screen.getByRole("link", { name: "One B" }))
    await flush()
    expect(queryById("content-one")).toBeNull()
  })

  test("content that changes while open is shown in the Viewport", async () => {
    function Changing() {
      const [more, setMore] = useState(false)
      return (
        <NavigationMenu.Root defaultValue="a">
          <NavigationMenu.List>
            <NavigationMenu.Item value="a">
              <NavigationMenu.Trigger>A</NavigationMenu.Trigger>
              <NavigationMenu.Content data-testid="content">
                <button type="button" data-testid="more" onClick={() => setMore(true)}>
                  more
                </button>
                {more && <p data-testid="extra">extra</p>}
              </NavigationMenu.Content>
            </NavigationMenu.Item>
          </NavigationMenu.List>
          <NavigationMenu.Viewport />
        </NavigationMenu.Root>
      )
    }
    render(<Changing />)
    await flush()
    await flush()
    expect(queryById("extra")).toBeNull()
    fireEvent.click(byId("more"))
    await flush()
    await flush()
    expect(queryById("extra")).not.toBeNull()
  })
})

describe("indicator", () => {
  test("sits in the track after the list and follows the active trigger", async () => {
    mockBoxes({ "trigger-one": { width: 60, height: 36, left: 10, top: 0 }, "trigger-two": { width: 50, height: 36, left: 70, top: 0 } })
    render(<Example indicator />)
    expect(queryById("indicator")).toBeNull()
    fireEvent.click(byId("trigger-two"))
    await flush()
    await flush()
    const indicator = byId("indicator")
    expect(indicator.parentElement).toBe(byId("list").parentElement)
    expect(indicator.previousElementSibling).toBe(byId("list"))
    expect(indicator.getAttribute("data-state")).toBe("visible")
    expect(indicator.getAttribute("data-orientation")).toBe("horizontal")
    expect(indicator.getAttribute("aria-hidden")).toBe("true")
    expect(indicator.style.position).toBe("absolute")
    expect(indicator.style.left).toBe("0px")
    expect(indicator.style.width).toBe("50px")
    expect(indicator.style.transform).toBe("translateX(70px)")
    expect(indicator.style.getPropertyValue("--radix-navigation-menu-indicator-translate-x")).toBe("70px")

    fireEvent.click(byId("trigger-one"))
    await flush()
    await flush()
    expect(indicator.style.width).toBe("60px")
    expect(indicator.style.transform).toBe("translateX(10px)")
  })

  test("is hidden while it animates out and gone afterwards", async () => {
    mockBoxes({ "trigger-one": { width: 60, height: 36, left: 10, top: 0 } })
    // The indicator spells its states visible and hidden, so mockAnimations (open and closed) does not fit
    vi.spyOn(window, "getComputedStyle").mockImplementation(
      (node) =>
        ({
          get animationName() {
            return (node as HTMLElement).getAttribute("data-state") === "hidden" ? "fade-out" : "fade-in"
          },
          display: "block",
        }) as CSSStyleDeclaration
    )
    render(<Example indicator root={{ defaultValue: "one" }} />)
    await flush()
    await flush()
    const indicator = byId("indicator")
    expect(indicator.getAttribute("data-state")).toBe("visible")
    fireEvent.click(byId("trigger-one"))
    await flush()
    expect(byId("indicator")).toBe(indicator)
    expect(indicator.getAttribute("data-state")).toBe("hidden")
    act(() => {
      indicator.dispatchEvent(Object.assign(new Event("animationend", { bubbles: true }), { animationName: "fade-out" }))
    })
    await flush()
    expect(queryById("indicator")).toBeNull()
  })

  test("finds its trigger when the trigger has an id of its own and the item is open at mount", async () => {
    mockBoxes({ "own-id": { width: 70, height: 36, left: 20, top: 0 } })
    render(
      <NavigationMenu.Root defaultValue="a">
        <NavigationMenu.List>
          <NavigationMenu.Item value="a">
            <NavigationMenu.Trigger id="mine" data-testid="own-id">
              A
            </NavigationMenu.Trigger>
          </NavigationMenu.Item>
        </NavigationMenu.List>
        <NavigationMenu.Indicator data-testid="indicator" />
      </NavigationMenu.Root>
    )
    await flush()
    await flush()
    expect(byId("indicator").style.width).toBe("70px")
    expect(byId("indicator").style.transform).toBe("translateX(20px)")
  })

  test("a vertical menu positions it by height and top", async () => {
    mockBoxes({ "trigger-one": { width: 60, height: 36, left: 0, top: 4 }, "trigger-two": { width: 60, height: 40, left: 0, top: 44 } })
    render(<Example indicator root={{ orientation: "vertical", defaultValue: "two" }} />)
    await flush()
    await flush()
    const indicator = byId("indicator")
    expect(indicator.getAttribute("data-orientation")).toBe("vertical")
    expect(indicator.style.top).toBe("0px")
    expect(indicator.style.height).toBe("40px")
    expect(indicator.style.transform).toBe("translateY(44px)")
    expect(indicator.style.getPropertyValue("--radix-navigation-menu-indicator-translate-y")).toBe("44px")
  })
})
