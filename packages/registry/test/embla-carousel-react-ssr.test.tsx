// @vitest-environment node
import { renderToString } from "preact-render-to-string"
import { expect, test } from "vitest"
import useEmblaCarousel from "../src/shims/embla-carousel-react"

// No window here: the hook may only touch the DOM from an effect, which never runs on the server
test("renders on the server without creating a carousel", () => {
  function Carousel() {
    const [ref, api] = useEmblaCarousel({ loop: true })
    return <div ref={ref}>{api ? "api" : "no api"}</div>
  }
  expect(renderToString(<Carousel />)).toBe("<div>no api</div>")
})
