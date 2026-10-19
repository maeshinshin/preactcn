// @vitest-environment node
import { renderToString } from "preact-render-to-string"
import { expect, test } from "vitest"
import { toast, Toaster } from "../src/shims/sonner"

// No window or document here: importing the module and rendering may not touch them
test("renders the empty live region on the server", () => {
  const html = renderToString(<Toaster theme="system" position="top-right" />)
  expect(html).toBe(
    '<section aria-label="Notifications alt+T" tabindex="-1" aria-live="polite" aria-relevant="additions text" aria-atomic="false" data-react-aria-top-layer="true"></section>'
  )
})

test("toast() called on the server does not throw and shows nothing", () => {
  expect(() => toast.success("server")).not.toThrow()
  expect(renderToString(<Toaster />)).not.toContain("server")
})
