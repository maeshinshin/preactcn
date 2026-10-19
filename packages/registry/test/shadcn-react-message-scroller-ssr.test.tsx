// @vitest-environment node
import { renderToString } from "preact-render-to-string"
import { expect, test } from "vitest"
import { MessageScroller, useMessageScroller } from "../src/shims/shadcn-react-message-scroller"

// No window or document here: importing the module and rendering may not touch them
function Tree({ defaultScrollPosition, scrollAnchor = false }: { defaultScrollPosition?: "start" | "end" | "last-anchor"; scrollAnchor?: boolean }) {
  return (
    <MessageScroller.Provider defaultScrollPosition={defaultScrollPosition}>
      <MessageScroller.Root class="root">
        <MessageScroller.Viewport className="viewport">
          <MessageScroller.Content spacerClassName="spacer">
            <MessageScroller.Item messageId="m1" scrollAnchor={scrollAnchor}>
              One
            </MessageScroller.Item>
            <MessageScroller.Item>Two</MessageScroller.Item>
          </MessageScroller.Content>
        </MessageScroller.Viewport>
        <MessageScroller.Button className="jump" />
      </MessageScroller.Root>
    </MessageScroller.Provider>
  )
}

test("renders the transcript with its roles, labels and data attributes", () => {
  const html = renderToString(<Tree scrollAnchor />)
  expect(html).toContain('<div class="root" data-pending-scroll>')
  expect(html).toContain('<div role="region" aria-label="Messages" tabindex="0" class="viewport" data-pending-scroll>')
  expect(html).toContain('<div role="log" aria-relevant="additions">')
  expect(html).toContain('<div data-message-id="m1" data-scroll-anchor="true">One</div>')
  expect(html).toContain('<div data-scroll-anchor="false">Two</div>')
  expect(html).toContain('<div aria-hidden="true" data-message-scroller-spacer hidden class="spacer"></div>')
})

test("renders the scroll button inactive: inert, out of the tab order, state in data attributes", () => {
  const html = renderToString(<Tree />)
  expect(html).toContain('<button data-active="false" data-direction="end" type="button" inert tabindex="-1" class="jump">')
  expect(html).toContain("<span>Scroll to end</span>")
})

test.each([
  ["end", true],
  ["last-anchor", true],
  ["start", false],
] as const)("data-pending-scroll for defaultScrollPosition %s is %s", (position, pending) => {
  expect(renderToString(<Tree defaultScrollPosition={position} />).includes("data-pending-scroll")).toBe(pending)
})

test("a hook outside a provider names itself", () => {
  function Probe() {
    useMessageScroller()
    return null
  }
  expect(() => renderToString(<Probe />)).toThrow("`useMessageScroller` must be used within `MessageScroller.Provider`")
})
