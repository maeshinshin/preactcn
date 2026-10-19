import { render } from "@testing-library/preact"
import { renderToString } from "preact-render-to-string"
import { expect, test } from "vitest"
import { useTheme } from "../src/shims/next-themes"

// The way the sonner wrapper calls it
function Probe() {
  const { theme = "system" } = useTheme()
  return <p>{theme}</p>
}

test("without a provider there is no theme, so the caller's default applies", () => {
  const { container } = render(<Probe />)
  expect(container.textContent).toBe("system")
  expect(renderToString(<Probe />)).toBe("<p>system</p>")
})

test("matches next-themes' context default: no theme, no themes, setTheme does nothing", () => {
  let result!: ReturnType<typeof useTheme>
  function Capture() {
    result = useTheme()
    return null
  }
  render(<Capture />)
  expect(result.theme).toBeUndefined()
  expect(result.themes).toEqual([])
  expect(() => result.setTheme("dark")).not.toThrow()
})
