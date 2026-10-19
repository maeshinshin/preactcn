import type { ComponentProps } from "react"

type ImageProps = ComponentProps<"img"> & {
  fill?: boolean
  priority?: boolean
}

export default function Image({ fill, priority, style, ...props }: ImageProps) {
  const fillStyle = { position: "absolute", inset: 0, width: "100%", height: "100%" } as const
  return <img {...props} style={fill ? fillStyle : style} />
}
