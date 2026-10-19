// @vitest-environment node
import { renderToString } from "preact-render-to-string"
import { expect, test } from "vitest"
import { Command } from "../src/shims/cmdk"

// No document or window here: any DOM access while rendering would throw
test("renders the menu on the server without touching the DOM", () => {
  const html = renderToString(
    <Command label="Commands" className="root">
      <Command.Input placeholder="Search" />
      <Command.List>
        <Command.Group heading="Suggestions">
          <Command.Item>Calendar</Command.Item>
          <Command.Item disabled>Calculator</Command.Item>
        </Command.Group>
        <Command.Separator />
      </Command.List>
    </Command>
  )
  expect(html).toContain('class="root"')
  expect(html).toContain("<label cmdk-label")
  expect(html).toContain('role="combobox"')
  expect(html).toContain('spellcheck="false"')
  expect(html).toContain('role="listbox"')
  expect(html).toMatch(/<div cmdk-group-heading aria-hidden="true" id="[^"]+">Suggestions<\/div>/)
  expect(html).toMatch(/role="option" aria-disabled="false" aria-selected="false" data-disabled="false" data-selected="false">Calendar</)
  expect(html).toMatch(/role="option" aria-disabled="true" aria-selected="false" data-disabled="true" data-selected="false">Calculator</)
  expect(html).toContain("cmdk-separator")
})
