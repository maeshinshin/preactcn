// Derived from Radix UI Primitives, Copyright (c) 2022 WorkOS, MIT License (https://opensource.org/license/mit)
import { forwardRef } from "./internal/forward-ref"
import { Primitive, type PrimitiveProps } from "./internal/primitive"
import { mergeStyles } from "./internal/style"

type AspectRatioProps = PrimitiveProps<"div"> & { ratio?: number }

const AspectRatio = forwardRef<AspectRatioProps>(({ ratio = 1, style, ...props }, ref) => (
  <div style={{ position: "relative", width: "100%", paddingBottom: `${100 / ratio}%` }} data-radix-aspect-ratio-wrapper="">
    <Primitive.div
      {...props}
      ref={ref}
      style={mergeStyles(style, { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 })}
    />
  </div>
))

export { AspectRatio as Root }
