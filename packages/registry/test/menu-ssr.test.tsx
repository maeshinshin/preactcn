// @vitest-environment node
import { renderToString } from "preact-render-to-string"
import { describe, expect, test } from "vitest"
import * as ContextMenu from "../src/radix/context-menu"
import * as DropdownMenu from "../src/radix/dropdown-menu"
import * as Menubar from "../src/radix/menubar"
import * as Select from "../src/radix/select"

// No document or window here: any DOM access while rendering would throw
describe("server rendering of menus and select", () => {
  test("the lists are portaled, so only the triggers render, even when open", () => {
    const html = renderToString(
      <div>
        <DropdownMenu.Root defaultOpen>
          <DropdownMenu.Trigger>dropdown trigger</DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content>dropdown body</DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <ContextMenu.Root>
          <ContextMenu.Trigger>context trigger</ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content>context body</ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
        <Menubar.Root>
          <Menubar.Menu value="file">
            <Menubar.Trigger>menubar trigger</Menubar.Trigger>
            <Menubar.Portal>
              <Menubar.Content>menubar body</Menubar.Content>
            </Menubar.Portal>
          </Menubar.Menu>
        </Menubar.Root>
        <Select.Root defaultOpen defaultValue="a">
          <Select.Trigger>
            <Select.Value placeholder="select placeholder" />
          </Select.Trigger>
          <Select.Portal>
            <Select.Content>
              <Select.Viewport>
                <Select.Item value="a">
                  <Select.ItemText>select body</Select.ItemText>
                </Select.Item>
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>
    )
    for (const text of ["dropdown trigger", "context trigger", "menubar trigger"]) expect(html).toContain(text)
    expect(html).not.toMatch(/dropdown body|context body|menubar body|select body/)
    expect(html).toContain('aria-haspopup="menu"')
    expect(html).toContain('role="menubar"')
    expect(html).toContain('role="combobox"')
  })

  test("a select in a form renders its hidden native select so the form submits before hydration", () => {
    const html = renderToString(
      <form>
        <Select.Root name="fruit" defaultValue="apple" required>
          <Select.Trigger>
            <Select.Value />
          </Select.Trigger>
        </Select.Root>
      </form>
    )
    const select = html.match(/<select[^>]*>/)![0]
    expect(select).toContain('name="fruit"')
    expect(select).toContain("required")
    expect(select).toContain('aria-hidden="true"')
    expect(html).toContain('<option selected value="apple">')
  })
})
