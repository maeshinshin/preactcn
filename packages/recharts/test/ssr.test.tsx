// @vitest-environment node
import { renderToString } from "preact-render-to-string"
import { describe, expect, it } from "vitest"
import ChartExample from "./.gen/examples/chart-example"
import { expectReactNumbers } from "./layout"
import Stress from "./stress"

// Number of elements in the string React's renderToString makes of the same pages (react-dom 19.3.0 and recharts 3.8.0 from npm)
const REACT_TAGS = { example: 89, stress: 73 }
const tags = (html: string) => (html.match(/<[a-zA-Z]/g) ?? []).length

describe("server rendering", () => {
  it("renders the upstream chart example like React recharts does", () => {
    const html = renderToString(<ChartExample />)
    expect(html).toContain("recharts-surface")
    expectReactNumbers(tags(html), REACT_TAGS.example)
  })

  it("renders charts with elements inside <Bar> and a Legend like React recharts does", () => {
    expectReactNumbers(tags(renderToString(<Stress />)), REACT_TAGS.stress)
  })
})
