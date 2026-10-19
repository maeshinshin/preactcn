import { createContext, hydrate, render as preactRender } from "preact"
import { useContext, useId, useState } from "preact/hooks"
import { act, render, screen } from "@testing-library/preact"
import { renderToString } from "preact-render-to-string"
import { describe, expect, test } from "vitest"
import * as Portal from "../src/radix/internal/portal"

const Theme = createContext("light")

function Themed() {
  return <span data-testid="themed">{useContext(Theme)}</span>
}

function IdProbe({ name }: { name: string }) {
  return <i data-testid={name} id={useId()} />
}

describe("Portal", () => {
  test("renders its children as direct children of body, outside the container", () => {
    const { container } = render(
      <div id="app">
        <Portal.Root>
          <p data-testid="out">hello</p>
        </Portal.Root>
      </div>
    )
    expect(container.querySelector("p")).toBeNull()
    expect(screen.getByTestId("out").parentElement).toBe(document.body)
  })

  test("keeps context and follows context updates", () => {
    function App({ theme }: { theme: string }) {
      return (
        <Theme.Provider value={theme}>
          <Portal.Root>
            <Themed />
          </Portal.Root>
        </Theme.Provider>
      )
    }
    const { rerender } = render(<App theme="dark" />)
    expect(screen.getByTestId("themed").textContent).toBe("dark")
    rerender(<App theme="light" />)
    expect(screen.getByTestId("themed").textContent).toBe("light")
  })

  test("updates children and removes them on unmount", () => {
    function Counter() {
      const [count, setCount] = useState(0)
      return (
        <button type="button" onClick={() => setCount(count + 1)}>
          {count}
        </button>
      )
    }
    const { rerender, unmount } = render(
      <Portal.Root>
        <Counter />
        <i data-testid="a" />
      </Portal.Root>
    )
    act(() => screen.getByRole("button").click())
    expect(screen.getByRole("button").textContent).toBe("1")
    rerender(
      <Portal.Root>
        <Counter />
        <b data-testid="b" />
      </Portal.Root>
    )
    expect(screen.queryByTestId("a")).toBeNull()
    expect(screen.getByTestId("b")).not.toBeNull()
    unmount()
    expect(screen.queryByTestId("b")).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
  })

  test("ids from useId never repeat across the portal boundary, including content that mounts later and nested portals", () => {
    function App() {
      const [open, setOpen] = useState(false)
      return (
        <div>
          <IdProbe name="page" />
          <button type="button" onClick={() => setOpen(true)}>
            open
          </button>
          <Portal.Root>
            <IdProbe name="early" />
            {open && (
              <>
                <IdProbe name="late" />
                <Portal.Root>
                  <IdProbe name="nested" />
                </Portal.Root>
              </>
            )}
          </Portal.Root>
          <IdProbe name="after" />
        </div>
      )
    }
    render(<App />)
    act(() => screen.getByRole("button").click())
    const ids = ["page", "early", "late", "nested", "after"].map((name) => screen.getByTestId(name).id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test("after hydrating, the portal continues the ids of the server-rendered page", async () => {
    const App = () => (
      <div>
        <IdProbe name="before" />
        <Portal.Root>
          <IdProbe name="inside" />
        </Portal.Root>
        <IdProbe name="after" />
      </div>
    )
    const container = document.createElement("div")
    document.body.append(container)
    container.innerHTML = renderToString(<App />)
    const serverIds = Array.from(container.querySelectorAll("[id]"), (element) => element.id)
    await act(async () => void hydrate(<App />, container))
    const ids = [...serverIds, screen.getByTestId("inside").id]
    expect(ids).toHaveLength(3)
    expect(new Set(ids).size).toBe(3)
    preactRender(null, container)
    container.remove()
  })

  test("portals do not touch each other's nodes or the other children of body", () => {
    const existing = document.createElement("div")
    existing.id = "existing"
    document.body.append(existing)
    const { rerender } = render(
      <div>
        <Portal.Root>
          <i data-testid="one" />
        </Portal.Root>
        <Portal.Root>
          <i data-testid="two" />
        </Portal.Root>
      </div>
    )
    rerender(
      <div>
        <Portal.Root>
          <i data-testid="one" />
          <i data-testid="three" />
        </Portal.Root>
        <Portal.Root>
          <i data-testid="two" />
        </Portal.Root>
      </div>
    )
    for (const id of ["one", "two", "three"]) expect(screen.getByTestId(id).parentElement).toBe(document.body)
    expect(document.getElementById("existing")).toBe(existing)
    const order = Array.from(document.body.children).filter((el) => el.hasAttribute("data-testid"))
    expect(order.indexOf(screen.getByTestId("one"))).toBeLessThan(order.indexOf(screen.getByTestId("three")))
    existing.remove()
  })
})
