// Derived from Radix UI Primitives, Copyright (c) 2022 WorkOS, MIT License (https://opensource.org/license/mit)
import type { ComponentChildren } from "preact"
import { useCallback, useEffect, useRef, useState } from "preact/hooks"
import { composeEventHandlers } from "./internal/compose-event-handlers"
import { useComposedRefs } from "./internal/compose-refs"
import { createStrictContext } from "./internal/create-context"
import { useDismissableLayer, type DismissableLayerProps } from "./internal/dismissable-layer"
import { getTabbableCandidates } from "./internal/focus-scope"
import { forwardRef } from "./internal/forward-ref"
import * as PopperPrimitive from "./internal/popper"
import * as PortalPrimitive from "./internal/portal"
import { Presence } from "./internal/presence"
import { Primitive, type PrimitiveProps } from "./internal/primitive"
import { mergeStyles } from "./internal/style"
import { useControllableState } from "./internal/use-controllable-state"

const [HoverCardProvider, useHoverCardContext] = createStrictContext<{
  open: boolean
  onOpen(): void
  onClose(): void
  onDismiss(): void
}>("HoverCard")

const getState = (open: boolean) => (open ? "open" : "closed")

// Touch has no hover: the pointer events that follow a tap must not open or close the card
const excludeTouch = (handler: () => void) => (event: PointerEvent) => (event.pointerType === "touch" ? undefined : handler())

// shortcut: no text-selection protection (moving the pointer out while selecting text inside the card closes it) and no Portal
// `container` or `forceMount`; add Radix's selection refs if cards hold text people select
function HoverCard({
  open: openProp,
  defaultOpen,
  onOpenChange,
  openDelay = 700,
  closeDelay = 300,
  children,
}: {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?(open: boolean): void
  openDelay?: number
  closeDelay?: number
  children?: ComponentChildren
}) {
  const openTimerRef = useRef(0)
  const closeTimerRef = useRef(0)
  const [open, setOpen] = useControllableState({ prop: openProp, defaultProp: defaultOpen ?? false, onChange: onOpenChange })
  const onOpen = useCallback(() => {
    clearTimeout(closeTimerRef.current)
    openTimerRef.current = window.setTimeout(() => setOpen(true), openDelay)
  }, [openDelay, setOpen])
  const onClose = useCallback(() => {
    clearTimeout(openTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => setOpen(false), closeDelay)
  }, [closeDelay, setOpen])
  const onDismiss = useCallback(() => setOpen(false), [setOpen])
  useEffect(
    () => () => {
      clearTimeout(openTimerRef.current)
      clearTimeout(closeTimerRef.current)
    },
    []
  )

  return (
    <HoverCardProvider value={{ open, onOpen, onClose, onDismiss }}>
      <PopperPrimitive.Root>{children}</PopperPrimitive.Root>
    </HoverCardProvider>
  )
}

const HoverCardTrigger = forwardRef<PrimitiveProps<"a">>((props, ref) => {
  const context = useHoverCardContext("HoverCardTrigger")
  return (
    <PopperPrimitive.Anchor asChild>
      <Primitive.a
        data-state={getState(context.open)}
        {...props}
        ref={ref}
        onPointerEnter={composeEventHandlers(props.onPointerEnter, excludeTouch(context.onOpen))}
        onPointerLeave={composeEventHandlers(props.onPointerLeave, excludeTouch(context.onClose))}
        onFocus={composeEventHandlers(props.onFocus, context.onOpen)}
        onBlur={composeEventHandlers(props.onBlur, context.onClose)}
      />
    </PopperPrimitive.Anchor>
  )
})

function HoverCardPortal({ children }: { children?: ComponentChildren }) {
  return <PortalPrimitive.Root>{children}</PortalPrimitive.Root>
}

type HoverCardContentProps = PopperPrimitive.PopperContentProps & DismissableLayerProps

const HoverCardContentImpl = forwardRef<HoverCardContentProps>(
  ({ onEscapeKeyDown, onPointerDownOutside, onFocusOutside, onInteractOutside, onPointerEnter, onPointerLeave, style, ...contentProps }, forwardedRef) => {
    const context = useHoverCardContext("HoverCardContent")
    const [node, setNode] = useState<HTMLElement | null>(null)
    const ref = useComposedRefs(forwardedRef, setNode)

    useDismissableLayer(node, {
      onEscapeKeyDown,
      onPointerDownOutside,
      onFocusOutside: composeEventHandlers(onFocusOutside, (event) => event.preventDefault()),
      onInteractOutside,
      onDismiss: context.onDismiss,
    })
    // The card is for pointer users: nothing inside it joins the tab order
    useEffect(() => {
      if (node) for (const tabbable of getTabbableCandidates(node)) tabbable.setAttribute("tabindex", "-1")
    })

    return (
      <PopperPrimitive.Content
        data-state={getState(context.open)}
        {...contentProps}
        ref={ref}
        onPointerEnter={composeEventHandlers(onPointerEnter, excludeTouch(context.onOpen))}
        onPointerLeave={composeEventHandlers(onPointerLeave, excludeTouch(context.onClose))}
        style={mergeStyles(style, {
          "--radix-hover-card-content-transform-origin": "var(--radix-popper-transform-origin)",
          "--radix-hover-card-content-available-width": "var(--radix-popper-available-width)",
          "--radix-hover-card-content-available-height": "var(--radix-popper-available-height)",
          "--radix-hover-card-trigger-width": "var(--radix-popper-anchor-width)",
          "--radix-hover-card-trigger-height": "var(--radix-popper-anchor-height)",
        })}
      />
    )
  }
)

const HoverCardContent = forwardRef<HoverCardContentProps>((props, ref) => {
  const context = useHoverCardContext("HoverCardContent")
  return (
    <Presence present={context.open}>
      <HoverCardContentImpl {...props} ref={ref} />
    </Presence>
  )
})

export { HoverCard as Root, HoverCardTrigger as Trigger, HoverCardPortal as Portal, HoverCardContent as Content }
export type { HoverCardContentProps }
