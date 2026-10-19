// @vitest-environment node
import { renderToString } from "preact-render-to-string"
import { expect, test } from "vitest"
import { Drawer } from "../src/shims/vaul"

// No window or document here: importing the module and rendering may not touch them
test("renders the trigger on the server and keeps the drawer out of the markup", () => {
  const html = renderToString(
    <Drawer.Root direction="left" defaultOpen>
      <Drawer.Trigger>Open</Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay />
        <Drawer.Content>
          <Drawer.Title>Move goal</Drawer.Title>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
  expect(html).toMatch(/^<button type="button" aria-haspopup="dialog" aria-expanded="true" aria-controls="[^"]+" data-state="open">Open<\/button>$/)
})
