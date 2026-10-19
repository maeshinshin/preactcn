import { useState } from "preact/hooks"
import { act, render } from "@testing-library/preact"
import { describe, expect, test } from "vitest"
import { createCollection } from "../src/radix/internal/collection"

const Collection = createCollection<{ label: string }>()

function List({ labels, onItems }: { labels: string[]; onItems: (items: string[]) => void }) {
  return (
    <Collection.Provider>
      <Collection.Slot>
        <ul>
          {labels.map((label) => (
            <Collection.ItemSlot key={label} label={label}>
              <li>{label}</li>
            </Collection.ItemSlot>
          ))}
          <Reader onItems={onItems} />
        </ul>
      </Collection.Slot>
    </Collection.Provider>
  )
}

function Reader({ onItems }: { onItems: (items: string[]) => void }) {
  const getItems = Collection.useCollection()
  const [, force] = useState(0)
  return (
    <button
      type="button"
      onClick={() => {
        onItems(getItems().map((item) => item.label))
        force((n) => n + 1)
      }}
    />
  )
}

describe("createCollection", () => {
  test("returns items in DOM order, including after reordering", () => {
    let seen: string[] = []
    const { container, rerender } = render(<List labels={["a", "b", "c"]} onItems={(items) => (seen = items)} />)
    const click = () =>
      act(() => {
        container.querySelector("button")!.click()
      })
    click()
    expect(seen).toEqual(["a", "b", "c"])
    rerender(<List labels={["c", "a"]} onItems={(items) => (seen = items)} />)
    click()
    expect(seen).toEqual(["c", "a"])
  })

  test("marks item elements", () => {
    const { container } = render(<List labels={["a"]} onItems={() => {}} />)
    expect(container.querySelector("li")!.hasAttribute("data-radix-collection-item")).toBe(true)
  })
})
