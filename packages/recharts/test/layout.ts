import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, beforeEach, expect, vi } from "vitest"

// The React numbers in smoke.test.tsx and ssr.test.tsx were measured with recharts 3.8.0 and say nothing about another version, whose
// converted package is judged by the diff stage of verify.sh against React recharts of the same version. Checked only for 3.8.0.
const MEASURED = "3.8.0"
const version: string = JSON.parse(readFileSync(join(import.meta.dirname, "../package.json"), "utf8")).version
export function expectReactNumbers(actual: unknown, measured: unknown) {
  if (version.startsWith(`${MEASURED}-`)) expect(actual).toEqual(measured)
}

// happy-dom has no layout. Give every element the size of the chart frame (520x260), so ResponsiveContainer measures something.
export const FRAME = { width: 520, height: 260 }

export function useFrameLayout() {
  beforeEach(() => {
    vi.useFakeTimers()
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      return { ...FRAME, x: 0, y: 0, top: 0, left: 0, right: FRAME.width, bottom: FRAME.height, toJSON() {} }
    }
    Object.defineProperties(HTMLElement.prototype, {
      offsetWidth: { configurable: true, get: () => FRAME.width },
      offsetHeight: { configurable: true, get: () => FRAME.height },
      clientWidth: { configurable: true, get: () => FRAME.width },
      clientHeight: { configurable: true, get: () => FRAME.height },
    })
  })
  afterEach(() => void vi.useRealTimers())
}

// element counts of every chart frame: the svg elements, and everything inside the frame
export function count(root: ParentNode) {
  return [...root.querySelectorAll('[data-slot="chart"]')].map((frame) => ({ svg: frame.querySelectorAll("svg, svg *").length, all: frame.querySelectorAll("*").length }))
}

// recharts animates with timers (a 400ms delay, then 1500ms) and measures in effects: run the clock until the markup stops changing
export async function settle(root: Element) {
  let last = ""
  for (let round = 0; round < 6; round++) {
    await vi.advanceTimersByTimeAsync(3000)
    if (root.innerHTML === last) return
    last = root.innerHTML
  }
  throw new Error("the chart keeps changing")
}
