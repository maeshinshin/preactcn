import { render } from "preact"
import { act } from "preact/test-utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import ChartExample from "./.gen/examples/chart-example"
import { count, expectReactNumbers, settle, useFrameLayout } from "./layout"
import Stress from "./stress"

// Element counts per chart frame ({ svg elements, all elements }) of React recharts 3.8.0 rendering the same two pages in the same
// 520x260 happy-dom frames, once the animations have finished (markup unchanged for a second). Measured in a scratch project with
// react 19.3.0, react-dom 19.3.0 and recharts 3.8.0 from npm.
const REACT_EXAMPLE = [
  { svg: 34, all: 39 },
  { svg: 72, all: 77 },
  { svg: 36, all: 41 },
  { svg: 38, all: 43 },
  { svg: 33, all: 37 },
  { svg: 65, all: 70 },
]
const REACT_STRESS = [
  { svg: 46, all: 50 },
  { svg: 57, all: 61 },
  { svg: 67, all: 71 },
  { svg: 30, all: 41 },
  { svg: 54, all: 69 },
  { svg: 63, all: 70 },
  { svg: 76, all: 95 },
  { svg: 27, all: 31 },
  { svg: 39, all: 46 },
  { svg: 15, all: 19 },
  { svg: 8, all: 12 },
]

useFrameLayout()

let host: HTMLElement
let problems: string[]
beforeEach(() => {
  host = document.createElement("div")
  document.body.append(host)
  problems = []
  vi.spyOn(console, "error").mockImplementation((...args) => void problems.push(args.map(String).join(" ").slice(0, 300)))
  window.addEventListener("error", (event) => problems.push(String(event.message)))
})
afterEach(async () => {
  await act(() => render(null, host))
  host.remove()
  vi.restoreAllMocks()
})

async function mount(page: () => any) {
  await act(async () => render(page(), host))
  await settle(host)
}

describe("the upstream chart example", () => {
  it("draws the six charts like React recharts does", async () => {
    await mount(() => <ChartExample />)
    expect(problems).toEqual([])
    expectReactNumbers(count(host), REACT_EXAMPLE)
  })
})

describe("charts with elements inside <Bar> and a Legend", () => {
  it("draw like React recharts does", async () => {
    await mount(() => <Stress />)
    expect(problems).toEqual([])
    expectReactNumbers(count(host), REACT_STRESS)
  })

  it("draw what <Cell>, <LabelList> and <ErrorBar> contribute", async () => {
    await mount(() => <Stress />)
    const [cells, labels, errors] = [...host.querySelectorAll('[data-slot="chart"]')]
    expect([...cells!.querySelectorAll(".recharts-bar-rectangle path")].map((path) => path.getAttribute("fill"))).toEqual(["#e11d48", "#2563eb", "#16a34a", "#d97706", "#7c3aed"])
    expect([...labels!.querySelectorAll(".recharts-label-list text")].map((text) => text.textContent)).toEqual(["186", "305", "237", "73", "209"])
    expect(errors!.querySelectorAll(".recharts-errorBar")).toHaveLength(5)
  })
})
