// stand-in for the docs app's message-parts: only the render props the examples type against
export type MessagePartRenderProps<TPart = unknown, TMessage = unknown> = {
  part: TPart
  message: TMessage
}
