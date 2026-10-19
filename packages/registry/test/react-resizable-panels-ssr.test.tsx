// @vitest-environment node
import { renderToString } from "preact-render-to-string"
import { describe, expect, test } from "vitest"
import { Group, Panel, Separator } from "../src/shims/react-resizable-panels"

// No window or document here: any DOM access while rendering would throw
describe("server rendering", () => {
  const html = (orientation?: "vertical") =>
    renderToString(
      <Group orientation={orientation} className="g" data-slot="resizable-panel-group" id="group">
        <Panel id="left" defaultSize="25%" className="p" data-slot="resizable-panel">
          left
        </Panel>
        <Separator className="s" />
        <Panel id="right" defaultSize="75%">
          right
        </Panel>
      </Group>
    )

  test("the group is a flex container with the library's attributes", () => {
    const out = html()
    expect(out).toContain('data-group="true"')
    expect(out).toContain('id="group"')
    expect(out).toContain('data-testid="group"')
    expect(out).toContain('class="g"')
    expect(out).toContain('data-slot="resizable-panel-group"')
    expect(out).toContain("display:flex")
    expect(out).toContain("flex-direction:row")
    expect(out).toContain("touch-action:pan-y")
    expect(html("vertical")).toContain("flex-direction:column")
  })

  test("each panel carries its default size as the flex basis, so the layout is right before any script runs", () => {
    const [, left, right] = html().split('data-panel="true"')
    expect(left).toContain("flex-basis:25%")
    expect(right).toContain("flex-basis:75%")
    // The default flex-shrink of 1 applies, as the library leaves it unset
    const own = left!.split('<div class="p"')[0]
    expect(own).not.toContain("flex-grow")
    expect(own).not.toContain("flex-shrink")
    expect(left).toContain('id="left"')
    expect(html()).toContain('data-slot="resizable-panel" data-panel="true"')
    expect(left).toContain('<div class="p"')
    expect(left).toContain("left</div>")
  })

  test("a panel without a default size grows equally", () => {
    const out = renderToString(
      <Group>
        <Panel>a</Panel>
        <Separator />
        <Panel>b</Panel>
      </Group>
    )
    expect(out.match(/flex-grow:1;flex-shrink:1;flex-basis:0/g)).toHaveLength(2)
  })

  test("the separator is complete except for the values only a laid-out group knows", () => {
    const out = html()
    expect(out).toContain('role="separator"')
    expect(out).toContain('aria-orientation="vertical"')
    expect(out).toContain('tabindex="0"')
    expect(out).toContain('data-separator="inactive"')
    expect(out).toContain('class="s"')
    expect(out).toContain("flex-grow:0;flex-shrink:0")
    expect(out).not.toContain("aria-valuenow")
    expect(html("vertical")).toContain('aria-orientation="horizontal"')
  })
})
