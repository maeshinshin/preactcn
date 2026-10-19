// @vitest-environment node
import { renderToString } from "preact-render-to-string"
import { describe, expect, test } from "vitest"
import * as NavigationMenu from "../src/radix/navigation-menu"

function Example({ defaultValue, viewport = false }: { defaultValue?: string; viewport?: boolean }) {
  return (
    <NavigationMenu.Root defaultValue={defaultValue}>
      <NavigationMenu.List>
        <NavigationMenu.Item value="one">
          <NavigationMenu.Trigger>One</NavigationMenu.Trigger>
          <NavigationMenu.Content>
            <NavigationMenu.Link href="/one">content of one</NavigationMenu.Link>
          </NavigationMenu.Content>
        </NavigationMenu.Item>
        <NavigationMenu.Item>
          <NavigationMenu.Link href="/docs" active>
            Docs
          </NavigationMenu.Link>
        </NavigationMenu.Item>
      </NavigationMenu.List>
      <NavigationMenu.Indicator />
      {viewport && <NavigationMenu.Viewport />}
    </NavigationMenu.Root>
  )
}

// No document or window here: any DOM access while rendering would throw
describe("navigation menu server rendering", () => {
  test("renders the landmark with its triggers and links, closed", () => {
    const html = renderToString(<Example />)
    expect(html).toContain('<nav aria-label="Main"')
    expect(html).toContain('data-orientation="horizontal"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('data-state="closed"')
    expect(html).toContain('aria-current="page"')
    expect(html).not.toContain("content of one")
  })

  test("an item open at mount renders its content in place and a focus proxy after its trigger", () => {
    const html = renderToString(<Example defaultValue="one" />)
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain("content of one")
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*tabindex="0"/)
    expect(html).not.toContain("aria-owns")
  })

  test("with a Viewport the server renders an empty one: content moves into it once it is mounted in the browser", () => {
    const html = renderToString(<Example defaultValue="one" viewport />)
    expect(html).toContain("content of one")
    expect(html.match(/content of one/g)).toHaveLength(1)
    expect(html).toMatch(/<div[^>]*data-state="open"[^>]*data-orientation="horizontal"[^>]*><\/div>/)
  })

  test("an Indicator renders nothing on the server", () => {
    expect(renderToString(<Example defaultValue="one" />)).not.toContain("position: absolute")
  })
})
