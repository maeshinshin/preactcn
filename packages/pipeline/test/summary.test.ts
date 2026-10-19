import { describe, expect, it } from "vitest"
import { movedLines, summaryKeys, tally, type Status } from "../src/summary.ts"

const row = (name: string, stages: Record<string, Status>) => ({ name, stages })

describe("summaryKeys", () => {
  it("counts the diff columns on the version that was diffed", () => {
    expect(summaryKeys("10", "10")).toEqual(
      expect.arrayContaining(["generate", "add", "tsc10", "build10", "ssr10", "browser10", "dom", "pixels"])
    )
  })

  it("leaves the diff columns off the other version", () => {
    expect(summaryKeys("11", "10")).not.toContain("dom")
    expect(summaryKeys("11", "10")).not.toContain("tsc10")
  })

  it("counts the fresh column on the Fresh line only", () => {
    expect(summaryKeys("fresh", "10")).toEqual(["generate", "add", "fresh"])
    expect(summaryKeys("10", "10")).not.toContain("fresh")
  })
})

describe("tally", () => {
  const rows = [
    row("button", { generate: "pass", tsc10: "pass", dom: "pass", pixels: "pass" }),
    row("chart", { generate: "pass", tsc10: "pass", dom: "fail", pixels: "pass" }),
    row("combobox", { generate: "pass", tsc10: "blocked", dom: "n/a" }),
  ]

  it("fails a row that only fails a diff column", () => {
    const t = tally(rows, summaryKeys("10", "10"))
    expect(t.failing).toEqual(["chart"])
    expect(t.blocked).toEqual(["combobox"])
    expect(t.passing).toBe(1)
  })

  it("ignores a failing column outside the keys", () => {
    expect(tally(rows, summaryKeys("11", "10")).failing).toEqual([])
  })

  it("lists a row that fails and is blocked as failing only", () => {
    const t = tally([row("x", { a: "fail", b: "blocked" })], ["a", "b"])
    expect(t).toEqual({ passing: 0, blocked: [], failing: ["x"] })
  })
})

describe("movedLines", () => {
  const tooltip = "  div .recharts-tooltip-wrapper tabindex=\"-1\""

  it("finds a line that is removed in one place and added in another, indentation included", () => {
    const lines = [`- ${tooltip}`, "~ g: - id=\"a\" + id=\"b\"", `+ ${tooltip}`]
    expect([...movedLines(lines)]).toEqual([0, 2])
  })

  it("leaves a line that was only added or removed, and one whose indentation changed", () => {
    expect(movedLines([`- ${tooltip}`, `+  ${tooltip}`, "+ span", "- li"]).size).toBe(0)
  })

  it("pairs each removed line with one added line", () => {
    expect([...movedLines(["- li", "- li", "+ li"])]).toEqual([0, 2])
  })
})
