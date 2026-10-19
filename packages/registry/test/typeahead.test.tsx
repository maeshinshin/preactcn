import { renderHook } from "@testing-library/preact"
import { act } from "@testing-library/preact"
import { describe, expect, test, vi } from "vitest"
import { flush, useFakeTimers } from "./helpers"
import { getNextMatch, useTypeahead, wrapArray } from "../src/radix/internal/typeahead"

describe("wrapArray", () => {
  test("rotates the array to start at the given index", () => {
    expect(wrapArray(["a", "b", "c", "d"], 2)).toEqual(["c", "d", "a", "b"])
    expect(wrapArray(["a", "b"], 5)).toEqual(["b", "a"])
  })
})

describe("getNextMatch", () => {
  const values = ["Apple", "Banana", "Blueberry", "Cherry"]

  test("finds the first value that starts with the search, ignoring case", () => {
    expect(getNextMatch(values, "c")).toBe("Cherry")
    expect(getNextMatch(values, "blu")).toBe("Blueberry")
  })

  test("a single character moves past the current match and wraps around", () => {
    expect(getNextMatch(values, "b", "Banana")).toBe("Blueberry")
    expect(getNextMatch(values, "b", "Blueberry")).toBe("Banana")
  })

  test("a repeated character cycles like a single one", () => {
    expect(getNextMatch(values, "bb", "Banana")).toBe("Blueberry")
  })

  test("a longer search keeps the current match instead of reporting it again", () => {
    expect(getNextMatch(values, "ba", "Banana")).toBeUndefined()
    expect(getNextMatch(values, "bl", "Banana")).toBe("Blueberry")
  })

  test("nothing matches", () => {
    expect(getNextMatch(values, "z")).toBeUndefined()
  })
})

describe("useTypeahead", () => {
  useFakeTimers()

  test("accumulates keys, reports the whole search, and forgets it one second after the last key", async () => {
    const onSearch = vi.fn()
    const { result } = renderHook(() => useTypeahead(onSearch))
    act(() => result.current.type("b"))
    await flush(900)
    act(() => result.current.type("l"))
    expect(onSearch.mock.calls).toEqual([["b"], ["bl"]])
    expect(result.current.search.current).toBe("bl")
    await flush(999)
    expect(result.current.search.current).toBe("bl")
    await flush(1)
    expect(result.current.search.current).toBe("")
    act(() => result.current.type("c"))
    expect(onSearch).toHaveBeenLastCalledWith("c")
  })

  test("reset clears the search right away", () => {
    const { result } = renderHook(() => useTypeahead(() => {}))
    act(() => result.current.type("a"))
    act(() => result.current.reset())
    expect(result.current.search.current).toBe("")
  })

  test("always calls the latest callback", () => {
    const first = vi.fn()
    const second = vi.fn()
    const { result, rerender } = renderHook(({ cb }) => useTypeahead(cb), { initialProps: { cb: first } })
    rerender({ cb: second })
    act(() => result.current.type("x"))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith("x")
  })
})
