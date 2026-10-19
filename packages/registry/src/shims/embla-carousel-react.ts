// Derived from embla-carousel-react, Copyright (c) David Jerleke., MIT License (https://opensource.org/license/mit)
import EmblaCarousel, {
  type EmblaCarouselType,
  type EmblaOptionsType,
  type EmblaPluginType,
} from "embla-carousel"
import { areOptionsEqual, arePluginsEqual } from "embla-carousel-reactive-utils"
import { useCallback, useEffect, useRef, useState } from "preact/hooks"

export type EmblaViewportRefType = <ViewportElement extends HTMLElement>(
  instance: ViewportElement | null
) => void
export type UseEmblaCarouselType = [
  EmblaViewportRefType,
  EmblaCarouselType | undefined,
]

// embla-carousel-react's hook on Preact hooks. shortcut: no `useEmblaCarousel.globalOptions`; add it (assign to EmblaCarousel.globalOptions before each create) when an app needs it.
export default function useEmblaCarousel(
  options: EmblaOptionsType = {},
  plugins: EmblaPluginType[] = []
): UseEmblaCarouselType {
  const storedOptions = useRef(options)
  const storedPlugins = useRef(plugins)
  const [emblaApi, setEmblaApi] = useState<EmblaCarouselType>()
  const [viewport, setViewport] = useState<HTMLElement | null>()

  const reInit = useCallback(() => {
    if (emblaApi) emblaApi.reInit(storedOptions.current, storedPlugins.current)
  }, [emblaApi])

  // callers pass a fresh options object on every render, so compare by value
  useEffect(() => {
    if (areOptionsEqual(storedOptions.current, options)) return
    storedOptions.current = options
    reInit()
  }, [options, reInit])

  useEffect(() => {
    if (arePluginsEqual(storedPlugins.current, plugins)) return
    storedPlugins.current = plugins
    reInit()
  }, [plugins, reInit])

  useEffect(() => {
    if (!viewport) {
      setEmblaApi(undefined)
      return
    }
    const api = EmblaCarousel(viewport, storedOptions.current, storedPlugins.current)
    setEmblaApi(api)
    return () => api.destroy()
  }, [viewport])

  return [setViewport as EmblaViewportRefType, emblaApi]
}
