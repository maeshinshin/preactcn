import { act, render, screen } from "@testing-library/preact"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import * as Avatar from "../src/radix/avatar"

class MockImage extends EventTarget {
  static instances: MockImage[] = []
  src = ""
  complete = false
  naturalWidth = 0
  referrerPolicy = ""
  crossOrigin: string | null = null
  constructor() {
    super()
    MockImage.instances.push(this)
  }
  finish(result: "load" | "error") {
    if (result === "load") {
      this.complete = true
      this.naturalWidth = 10
    }
    this.dispatchEvent(new Event(result))
  }
}

beforeEach(() => {
  MockImage.instances = []
  vi.stubGlobal("Image", MockImage)
})
afterEach(() => vi.unstubAllGlobals())

function setup() {
  return render(
    <Avatar.Root data-testid="root">
      <Avatar.Image src="/me.png" alt="me" />
      <Avatar.Fallback>JD</Avatar.Fallback>
    </Avatar.Root>
  )
}

describe("avatar", () => {
  test("renders a span root and shows the fallback while the image is loading", () => {
    setup()
    expect(screen.getByTestId("root").tagName).toBe("SPAN")
    expect(screen.getByText("JD")).not.toBeNull()
    expect(screen.queryByRole("img")).toBeNull()
    expect(MockImage.instances[0]!.src).toBe("/me.png")
  })

  test("shows the image and hides the fallback once loaded", () => {
    setup()
    act(() => MockImage.instances[0]!.finish("load"))
    expect(screen.getByRole("img").getAttribute("src")).toBe("/me.png")
    expect(screen.queryByText("JD")).toBeNull()
  })

  test("keeps the fallback when the image fails", () => {
    setup()
    act(() => MockImage.instances[0]!.finish("error"))
    expect(screen.queryByRole("img")).toBeNull()
    expect(screen.getByText("JD")).not.toBeNull()
  })

  test("a missing src is an error", () => {
    render(
      <Avatar.Root>
        <Avatar.Image alt="x" />
        <Avatar.Fallback>FB</Avatar.Fallback>
      </Avatar.Root>
    )
    expect(screen.getByText("FB")).not.toBeNull()
  })

  test("an already cached image is shown without waiting for an event", () => {
    class Cached extends MockImage {
      override complete = true
      override naturalWidth = 5
    }
    vi.stubGlobal("Image", Cached)
    setup()
    expect(screen.getByRole("img")).not.toBeNull()
  })
})
