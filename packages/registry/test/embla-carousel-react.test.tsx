import { act, render } from "@testing-library/preact"
import type { EmblaCarouselType, EmblaPluginType } from "embla-carousel"
import { afterEach, describe, expect, test, vi } from "vitest"
import useEmblaCarousel, { type UseEmblaCarouselType } from "../src/shims/embla-carousel-react"

type Options = Parameters<typeof useEmblaCarousel>[0]

// The way upstream carousel.tsx calls the hook: a fresh options object on every render
function Carousel({ opts, orientation = "horizontal", plugins, id, onApi }: {
  opts?: Options
  orientation?: "horizontal" | "vertical"
  plugins?: EmblaPluginType[]
  id?: string
  onApi?: (api: UseEmblaCarouselType[1]) => void
}) {
  const [ref, api] = useEmblaCarousel({ ...opts, axis: orientation === "horizontal" ? "x" : "y" }, plugins)
  onApi?.(api)
  return (
    <div ref={ref} key={id} data-testid="viewport">
      <div>
        <div>1</div>
        <div>2</div>
        <div>3</div>
      </div>
    </div>
  )
}

function mount(props: Parameters<typeof Carousel>[0] = {}) {
  let api: EmblaCarouselType | undefined
  const onApi = (value: UseEmblaCarouselType[1]) => void (api = value)
  const view = render(<Carousel {...props} onApi={onApi} />)
  return {
    api: () => api!,
    rerender: (next: Parameters<typeof Carousel>[0]) => view.rerender(<Carousel {...next} onApi={onApi} />),
    unmount: view.unmount,
  }
}

const plugin = (options: Record<string, unknown> = {}) =>
  ({ name: "probe", options, init: vi.fn(), destroy: vi.fn() }) as unknown as EmblaPluginType & {
    init: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
  }

afterEach(() => vi.restoreAllMocks())

describe("useEmblaCarousel", () => {
  test("returns the api once the viewport is attached, built from its container and slides", () => {
    const view = mount()
    const api = view.api()
    expect(api).toBeDefined()
    expect(api.rootNode().dataset.testid).toBe("viewport")
    expect(api.containerNode()).toBe(api.rootNode().firstElementChild)
    expect(api.slideNodes().map((node) => node.textContent)).toEqual(["1", "2", "3"])
  })

  test("applies the options it is given", () => {
    const view = mount({ opts: { loop: true, align: "start" }, orientation: "vertical" })
    const options = view.api().internalEngine().options
    expect(options).toMatchObject({ loop: true, align: "start", axis: "y" })
  })

  test("keeps the api when a render passes equal options", () => {
    const view = mount({ opts: { align: "start" } })
    const api = view.api()
    const reInit = vi.spyOn(api, "reInit")
    view.rerender({ opts: { align: "start" } })
    expect(view.api()).toBe(api)
    expect(reInit).not.toHaveBeenCalled()
  })

  test("reinitializes the same api with changed options and emits reInit", () => {
    const view = mount()
    const api = view.api()
    const reInit = vi.spyOn(api, "reInit")
    const onReInit = vi.fn()
    api.on("reInit", onReInit)
    view.rerender({ orientation: "vertical" })
    expect(view.api()).toBe(api)
    expect(reInit).toHaveBeenCalledTimes(1)
    expect(reInit.mock.calls[0]![0]).toMatchObject({ axis: "y" })
    expect(api.internalEngine().options.axis).toBe("y")
    expect(onReInit).toHaveBeenCalledTimes(1)
  })

  test("passes plugins to embla and reinitializes when a plugin's options change", () => {
    const first = plugin({ delay: 1 })
    const view = mount({ plugins: [first] })
    const api = view.api()
    expect(first.init).toHaveBeenCalledTimes(1)
    expect(api.plugins().probe).toBe(first)

    view.rerender({ plugins: [plugin({ delay: 1 })] })
    expect(first.destroy).not.toHaveBeenCalled()

    const second = plugin({ delay: 2 })
    view.rerender({ plugins: [second] })
    expect(view.api()).toBe(api)
    expect(second.init).toHaveBeenCalledTimes(1)
    expect(api.plugins().probe).toBe(second)
  })

  test("destroys the api on unmount", async () => {
    const view = mount()
    const destroy = vi.spyOn(view.api(), "destroy")
    await act(() => void view.unmount())
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  test("creates a new api for a new viewport element and destroys the old one", () => {
    const view = mount({ id: "a" })
    const first = view.api()
    const destroy = vi.spyOn(first, "destroy")
    view.rerender({ id: "b" })
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(view.api()).not.toBe(first)
    expect(view.api().slideNodes()).toHaveLength(3)
  })

  test("drives scrolling through the api", async () => {
    // happy-dom has no layout: a flex container as wide as the viewport (100px) whose three 100px slides overflow it
    const isSlide = (node: HTMLElement) => node.parentElement?.parentElement?.dataset.testid === "viewport"
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100)
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
      return isSlide(this) ? [...this.parentElement!.children].indexOf(this) * 100 : 0
    })
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(100)
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ getPropertyValue: () => "0px" } as unknown as CSSStyleDeclaration)
    const view = mount()
    const api = view.api()
    const onSelect = vi.fn()
    api.on("select", onSelect)
    await act(() => api.scrollTo(2, true))
    expect(api.selectedScrollSnap()).toBe(2)
    expect(onSelect).toHaveBeenCalled()
  })
})
