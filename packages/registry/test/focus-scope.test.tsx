import { type ComponentChildren } from "preact"
import { useState } from "preact/hooks"
import { render, screen } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
import { flush, setupUser, useFakeTimers } from "./helpers"
import { useFocusScope } from "../src/radix/internal/focus-scope"

type Options = Parameters<typeof useFocusScope>[1]

function Scope({ children, ...options }: Options & { children?: ComponentChildren }) {
  const [node, setNode] = useState<HTMLElement | null>(null)
  useFocusScope(node, options)
  return (
    <div ref={setNode} tabIndex={-1} data-testid="scope">
      {children}
    </div>
  )
}

useFakeTimers()

describe("useFocusScope", () => {
  test("focuses the first tabbable element on mount, skipping links, disabled, hidden and untabbable ones", () => {
    render(
      <Scope>
        <a href="/x">link</a>
        <button type="button" disabled>
          disabled
        </button>
        <input type="hidden" />
        <button type="button" tabIndex={-1}>
          untabbable
        </button>
        <button type="button" hidden>
          hidden
        </button>
        <button type="button">first</button>
        <button type="button">second</button>
      </Scope>
    )
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "first" }))
  })

  test("focuses the container when there is nothing tabbable", () => {
    render(<Scope>text</Scope>)
    expect(document.activeElement).toBe(screen.getByTestId("scope"))
  })

  test("selects the text of an input it focuses", () => {
    render(
      <Scope>
        <input defaultValue="hello" aria-label="name" />
      </Scope>
    )
    const input = screen.getByLabelText("name") as HTMLInputElement
    expect(document.activeElement).toBe(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(5)
  })

  test("onMountAutoFocus can prevent the default and receives a cancelable event", () => {
    const onMountAutoFocus = vi.fn((event: Event) => event.preventDefault())
    render(
      <Scope onMountAutoFocus={onMountAutoFocus}>
        <button type="button">first</button>
      </Scope>
    )
    expect(onMountAutoFocus.mock.calls[0]![0].cancelable).toBe(true)
    expect(document.activeElement).toBe(document.body)
  })

  test("leaves focus alone when it is already inside", () => {
    function Inside() {
      const [node, setNode] = useState<HTMLElement | null>(null)
      useFocusScope(node, {})
      return (
        <div ref={setNode} tabIndex={-1}>
          <button type="button" ref={(el) => el?.focus()}>
            a
          </button>
          <button type="button">b</button>
        </div>
      )
    }
    render(<Inside />)
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "a" }))
  })

  test("loop wraps Tab and Shift+Tab around the edges, ignoring hidden elements", async () => {
    const user = setupUser()
    render(
      <div>
        <button type="button">before</button>
        <Scope loop>
          <button type="button" style={{ display: "none" }}>
            hidden first
          </button>
          <button type="button">one</button>
          <button type="button">two</button>
          <button type="button" style={{ visibility: "hidden" }}>
            hidden last
          </button>
        </Scope>
        <button type="button">after</button>
      </div>
    )
    screen.getByRole("button", { name: "one" }).focus()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "two" }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "one" }))
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "two" }))
  })

  test("without loop Tab leaves the scope", async () => {
    const user = setupUser()
    render(
      <div>
        <Scope>
          <button type="button">only</button>
        </Scope>
        <button type="button">after</button>
      </div>
    )
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "after" }))
  })

  test("returns focus to the previously focused element after unmount, unless prevented", async () => {
    const opener = document.createElement("button")
    document.body.append(opener)
    opener.focus()
    const { unmount } = render(
      <Scope>
        <button type="button">first</button>
      </Scope>
    )
    expect(document.activeElement).not.toBe(opener)
    unmount()
    expect(document.activeElement).not.toBe(opener)
    await flush()
    expect(document.activeElement).toBe(opener)

    const onUnmountAutoFocus = vi.fn((event: Event) => event.preventDefault())
    const second = render(
      <Scope onUnmountAutoFocus={onUnmountAutoFocus}>
        <button type="button">first</button>
      </Scope>
    )
    second.unmount()
    await flush()
    expect(onUnmountAutoFocus).toHaveBeenCalledTimes(1)
    expect(document.activeElement).not.toBe(opener)
    opener.remove()
  })
})
