"use client"

import type { ComponentProps } from "preact"
import * as AspectRatioPrimitive from "@/lib/radix/aspect-ratio"

function AspectRatio({
  ...props
}: ComponentProps<typeof AspectRatioPrimitive.Root>) {
  return <AspectRatioPrimitive.Root data-slot="aspect-ratio" {...props} />
}

export { AspectRatio }
