// @vitest-environment node
import { renderToString } from "preact-render-to-string"
import { expect, test } from "vitest"
import { Combobox } from "../src/shims/base-ui-react"

// No window or document here: importing the module and rendering may not touch them
const items = ["Next.js", "Remix", "Astro"]

function Tree({ root }: { root?: Record<string, unknown> }) {
  return (
    <Combobox.Root items={items} {...root}>
      <Combobox.Input placeholder="Pick one" />
      <Combobox.Trigger aria-label="Toggle" />
      <Combobox.Clear aria-label="Clear" />
      <Combobox.Portal>
        <Combobox.Positioner>
          <Combobox.Popup>
            <Combobox.List>
              {(item: string) => (
                <Combobox.Item key={item} value={item}>
                  {item}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}

test("renders the closed input, the trigger and the hidden input without touching the DOM", () => {
  const html = renderToString(<Tree />)
  expect(html).toMatch(/^<input id="[^"]+" autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="none" role="combobox" aria-expanded="false" aria-haspopup="listbox" aria-autocomplete="list" value placeholder="Pick one"\/>/)
  // an input that comes first tells the trigger it is not the combobox, so the server markup is already right
  expect(html).toContain('<button data-placeholder type="button" tabindex="-1" aria-expanded="false" aria-haspopup="listbox" aria-label="Toggle"></button>')
  expect(html).toContain('<input aria-hidden="true" tabindex="-1" id="')
  expect(html).not.toContain('role="listbox"')
  expect(html).not.toContain("Clear")
})

test("shows the selection in the input, the hidden input and the clear button", () => {
  const html = renderToString(<Tree root={{ defaultValue: "Remix", name: "framework" }} />)
  expect(html).toContain('value="Remix"')
  expect(html).toMatch(/<input aria-hidden="true" tabindex="-1" name="framework" [^>]*value="Remix"/)
  expect(html).toContain('aria-label="Clear"')
  expect(html).not.toContain("data-placeholder")
})

test("a popup that is open on the server leaves its portal out of the markup", () => {
  const html = renderToString(<Tree root={{ defaultOpen: true }} />)
  expect(html).toContain('aria-expanded="true"')
  expect(html).toContain("data-popup-open")
  expect(html).not.toContain('role="listbox"')
})

test("a trigger that comes before the input is the combobox until the input says otherwise", () => {
  const html = renderToString(
    <Combobox.Root items={items}>
      <Combobox.Trigger>
        <Combobox.Value placeholder="Pick one" />
      </Combobox.Trigger>
    </Combobox.Root>
  )
  expect(html).toContain('role="combobox"')
  expect(html).toContain('aria-haspopup="dialog"')
  expect(html).toContain("Pick one")
})

test("renders every part with a selection of several values", () => {
  const html = renderToString(
    <Combobox.Root multiple items={items} defaultValue={["Remix", "Astro"]} name="frameworks">
      <Combobox.Chips>
        <Combobox.Value>
          {(values: string[]) =>
            values.map((value) => (
              <Combobox.Chip key={value}>
                {value}
                <Combobox.ChipRemove aria-label={`Remove ${value}`} />
              </Combobox.Chip>
            ))
          }
        </Combobox.Value>
        <Combobox.Input />
      </Combobox.Chips>
    </Combobox.Root>
  )
  expect(html).toContain('role="toolbar"')
  expect(html).toContain('aria-label="Remove Remix"')
  expect(html).toContain('<input type="hidden" name="frameworks" value="Remix"/>')
  expect(html).toContain('<input type="hidden" name="frameworks" value="Astro"/>')
})
