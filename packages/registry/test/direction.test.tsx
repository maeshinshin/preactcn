import { useState } from "preact/hooks"
import { render, screen } from "@testing-library/preact"
import userEvent from "@testing-library/user-event"
import { describe, expect, test } from "vitest"
import { DirectionProvider, useDirection, type Direction } from "../src/radix/direction"

function Probe({ dir }: { dir?: Direction }) {
  const direction = useDirection(dir)
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount((c) => c + 1)}>{`${direction}:${count}`}</button>
}

describe("direction", () => {
  test("a dir prop that is dropped and set again keeps hook order and state", async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <DirectionProvider dir="rtl">
        <Probe dir="rtl" />
      </DirectionProvider>
    )
    await user.click(screen.getByRole("button"))
    expect(screen.getByRole("button").textContent).toBe("rtl:1")

    rerender(
      <DirectionProvider dir="rtl">
        <Probe />
      </DirectionProvider>
    )
    expect(screen.getByRole("button").textContent).toBe("rtl:1")

    rerender(
      <DirectionProvider dir="rtl">
        <Probe dir="ltr" />
      </DirectionProvider>
    )
    expect(screen.getByRole("button").textContent).toBe("ltr:1")
  })
})
