// Derived from Radix UI Primitives, Copyright (c) 2022 WorkOS, MIT License (https://opensource.org/license/mit)
import type { ComponentChildren, RefObject } from "preact"
import { useCallback, useEffect, useId, useRef, useState } from "preact/hooks"
import { composeEventHandlers } from "./internal/compose-event-handlers"
import { useComposedRefs } from "./internal/compose-refs"
import { createStrictContext } from "./internal/create-context"
import { useDismissableLayer, type DismissableLayerProps } from "./internal/dismissable-layer"
import { useFocusScope } from "./internal/focus-scope"
import { forwardRef } from "./internal/forward-ref"
import { useNonModalLayer } from "./internal/non-modal-layer"
import * as PopperPrimitive from "./internal/popper"
import * as PortalPrimitive from "./internal/portal"
import { Presence } from "./internal/presence"
import { Primitive, type PrimitiveProps } from "./internal/primitive"
import { mergeStyles } from "./internal/style"
import { useControllableState } from "./internal/use-controllable-state"

const [PopoverProvider, usePopoverContext] = createStrictContext<{
  triggerRef: RefObject<HTMLButtonElement | null>
  contentId: string
  open: boolean
  onOpenChange(open: boolean): void
  onOpenToggle(): void
  hasCustomAnchor: boolean
  onCustomAnchorAdd(): void
  onCustomAnchorRemove(): void
}>("Popover")

const getState = (open: boolean) => (open ? "open" : "closed")

// shortcut: never modal (no `modal`, so no focus trap, scroll lock or hidden page), and no Portal `container` or `forceMount`;
// add them if a popover must block the page
function Popover({
  open: openProp,
  defaultOpen,
  onOpenChange,
  children,
}: {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?(open: boolean): void
  children?: ComponentChildren
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [hasCustomAnchor, setHasCustomAnchor] = useState(false)
  const [open, setOpen] = useControllableState({ prop: openProp, defaultProp: defaultOpen ?? false, onChange: onOpenChange })
  return (
    <PopperPrimitive.Root>
      <PopoverProvider
        value={{
          triggerRef,
          contentId: useId(),
          open,
          onOpenChange: setOpen,
          onOpenToggle: () => setOpen((prev) => !prev),
          hasCustomAnchor,
          onCustomAnchorAdd: useCallback(() => setHasCustomAnchor(true), []),
          onCustomAnchorRemove: useCallback(() => setHasCustomAnchor(false), []),
        }}
      >
        {children}
      </PopoverProvider>
    </PopperPrimitive.Root>
  )
}

const PopoverTrigger = forwardRef<PrimitiveProps<"button">>((props, forwardedRef) => {
  const context = usePopoverContext("PopoverTrigger")
  const ref = useComposedRefs(forwardedRef, context.triggerRef)
  const trigger = (
    <Primitive.button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={context.open}
      aria-controls={context.open ? context.contentId : undefined}
      data-state={getState(context.open)}
      {...props}
      ref={ref}
      onClick={composeEventHandlers(props.onClick, context.onOpenToggle)}
    />
  )
  return context.hasCustomAnchor ? trigger : <PopperPrimitive.Anchor asChild>{trigger}</PopperPrimitive.Anchor>
})

const PopoverAnchor = forwardRef<PrimitiveProps<"div">>((props, ref) => {
  const { onCustomAnchorAdd, onCustomAnchorRemove } = usePopoverContext("PopoverAnchor")
  useEffect(() => {
    onCustomAnchorAdd()
    return onCustomAnchorRemove
  }, [onCustomAnchorAdd, onCustomAnchorRemove])
  return <PopperPrimitive.Anchor {...props} ref={ref} />
})

function PopoverPortal({ children }: { children?: ComponentChildren }) {
  return <PortalPrimitive.Root>{children}</PortalPrimitive.Root>
}

type PopoverContentProps = PopperPrimitive.PopperContentProps &
  DismissableLayerProps & { onOpenAutoFocus?(event: Event): void; onCloseAutoFocus?(event: Event): void }

const PopoverContentImpl = forwardRef<PopoverContentProps>(
  ({ onOpenAutoFocus, onCloseAutoFocus, onEscapeKeyDown, onPointerDownOutside, onFocusOutside, onInteractOutside, style, ...contentProps }, forwardedRef) => {
    const context = usePopoverContext("PopoverContent")
    const [node, setNode] = useState<HTMLElement | null>(null)
    const ref = useComposedRefs(forwardedRef, setNode)
    const nonModal = useNonModalLayer(context.triggerRef, { onCloseAutoFocus, onInteractOutside })

    // Registered before the scope moves focus, so a layer below does not take that focus for one leaving it
    useDismissableLayer(node, {
      onEscapeKeyDown,
      onPointerDownOutside,
      onFocusOutside,
      onInteractOutside: nonModal.onInteractOutside,
      onDismiss: () => context.onOpenChange(false),
    })
    useFocusScope(node, { loop: true, onMountAutoFocus: onOpenAutoFocus, onUnmountAutoFocus: nonModal.onUnmountAutoFocus })

    return (
      <PopperPrimitive.Content
        data-state={getState(context.open)}
        role="dialog"
        id={context.contentId}
        tabIndex={-1}
        {...contentProps}
        ref={ref}
        style={mergeStyles(style, {
          "--radix-popover-content-transform-origin": "var(--radix-popper-transform-origin)",
          "--radix-popover-content-available-width": "var(--radix-popper-available-width)",
          "--radix-popover-content-available-height": "var(--radix-popper-available-height)",
          "--radix-popover-trigger-width": "var(--radix-popper-anchor-width)",
          "--radix-popover-trigger-height": "var(--radix-popper-anchor-height)",
        })}
      />
    )
  }
)

const PopoverContent = forwardRef<PopoverContentProps>((props, ref) => {
  const context = usePopoverContext("PopoverContent")
  return (
    <Presence present={context.open}>
      <PopoverContentImpl {...props} ref={ref} />
    </Presence>
  )
})

export { Popover as Root, PopoverTrigger as Trigger, PopoverAnchor as Anchor, PopoverPortal as Portal, PopoverContent as Content }
export type { PopoverContentProps }
