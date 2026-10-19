// Derived from Radix UI Primitives, Copyright (c) 2022 WorkOS, MIT License (https://opensource.org/license/mit)
import type { ImgHTMLAttributes, Ref } from "preact"
import { useLayoutEffect, useState } from "preact/hooks"
import { createStrictContext } from "./internal/create-context"
import { forwardRef } from "./internal/forward-ref"
import { Primitive, type PrimitiveProps } from "./internal/primitive"

type ImageLoadingStatus = "idle" | "loading" | "loaded" | "error"

const [AvatarProvider, useAvatarContext] = createStrictContext<{
  imageLoadingStatus: ImageLoadingStatus
  onImageLoadingStatusChange: (status: ImageLoadingStatus) => void
}>("Avatar")

const Avatar = forwardRef<PrimitiveProps<"span">>((props, ref) => {
  const [imageLoadingStatus, onImageLoadingStatusChange] = useState<ImageLoadingStatus>("idle")
  return (
    <AvatarProvider value={{ imageLoadingStatus, onImageLoadingStatusChange }}>
      <Primitive.span {...props} ref={ref} />
    </AvatarProvider>
  )
})

// PrimitiveProps<"img"> loses `alt` under Preact 11, whose img type is a union that Omit flattens to its shared keys
type AvatarImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "ref"> & { asChild?: boolean; ref?: Ref<any> }

const AvatarImage = forwardRef<AvatarImageProps>(({ src, ...imageProps }, ref) => {
  const { imageLoadingStatus, onImageLoadingStatusChange: setStatus } = useAvatarContext("AvatarImage")

  // The probe image is created in an effect so the server render and the first client render both start as "idle"
  useLayoutEffect(() => {
    if (!src) return setStatus("error")
    const image = new window.Image()
    const handleLoad = () => setStatus("loaded")
    const handleError = () => setStatus("error")
    image.addEventListener("load", handleLoad)
    image.addEventListener("error", handleError)
    image.src = src as string
    setStatus(image.complete && image.naturalWidth > 0 ? "loaded" : "loading")
    return () => {
      image.removeEventListener("load", handleLoad)
      image.removeEventListener("error", handleError)
    }
  }, [src, setStatus])

  return imageLoadingStatus === "loaded" ? <Primitive.img {...imageProps} ref={ref} src={src} /> : null
})

const AvatarFallback = forwardRef<PrimitiveProps<"span">>((props, ref) => {
  const { imageLoadingStatus } = useAvatarContext("AvatarFallback")
  return imageLoadingStatus === "loaded" ? null : <Primitive.span {...props} ref={ref} />
})

export { Avatar as Root, AvatarImage as Image, AvatarFallback as Fallback }
