// Derived from Radix UI Primitives, Copyright (c) 2022 WorkOS, MIT License (https://opensource.org/license/mit)
import type { ComponentChildren } from "preact"
import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks"
import type { Direction } from "./direction"
import { composeEventHandlers } from "./internal/compose-event-handlers"
import { createStrictContext } from "./internal/create-context"
import { forwardRef } from "./internal/forward-ref"
import * as MenuPrimitive from "./internal/menu"
import { Primitive, type PrimitiveWith } from "./internal/primitive"
import { mergeStyles } from "./internal/style"
import { useControllableState } from "./internal/use-controllable-state"

// How long a touch has to stay down before it counts as a right click
const LONG_PRESS_DELAY = 700

const [ContextMenuProvider, useContextMenuContext] = createStrictContext<{
  open: boolean
  onOpenChange(open: boolean): void
  modal: boolean
}>("ContextMenu")

const whenTouchOrPen =
  <E extends PointerEvent>(handler: (event: E) => void) =>
  (event: E) =>
    event.pointerType !== "mouse" ? handler(event) : undefined

function ContextMenu({
  open: openProp,
  onOpenChange,
  dir,
  modal = true,
  children,
}: {
  open?: boolean
  onOpenChange?(open: boolean): void
  dir?: Direction
  modal?: boolean
  children?: ComponentChildren
}) {
  const [open, setOpen] = useControllableState({ prop: openProp, defaultProp: false, onChange: onOpenChange })
  return (
    <ContextMenuProvider value={{ open, onOpenChange: setOpen, modal }}>
      <MenuPrimitive.Root name="context-menu" dir={dir} open={open} onOpenChange={setOpen} modal={modal}>
        {children}
      </MenuPrimitive.Root>
    </ContextMenuProvider>
  )
}

const ContextMenuTrigger = forwardRef<PrimitiveWith<"span", { disabled?: boolean }>>(({ disabled = false, ...triggerProps }, forwardedRef) => {
  const context = useContextMenuContext("ContextMenuTrigger")
  const [point, setPoint] = useState({ x: 0, y: 0 })
  // A new anchor per point, so a menu that is already open follows a second right click
  const virtualRef = useMemo(() => ({ current: { getBoundingClientRect: () => DOMRect.fromRect({ width: 0, height: 0, ...point }) } }), [point])
  const longPressTimerRef = useRef(0)
  const clearLongPress = useCallback(() => clearTimeout(longPressTimerRef.current), [])
  const handleOpen = (event: MouseEvent | PointerEvent) => {
    setPoint({ x: event.clientX, y: event.clientY })
    context.onOpenChange(true)
  }

  useEffect(() => clearLongPress, [clearLongPress])
  useEffect(() => {
    if (disabled) clearLongPress()
  }, [disabled, clearLongPress])

  return (
    <>
      <MenuPrimitive.Anchor virtualRef={virtualRef} />
      <Primitive.span
        data-state={context.open ? "open" : "closed"}
        data-disabled={disabled ? "" : undefined}
        {...triggerProps}
        ref={forwardedRef}
        // Keeps the iOS context menu from appearing
        style={mergeStyles({ "-webkit-touch-callout": "none" }, triggerProps.style)}
        // A disabled trigger leaves the native context menu alone
        onContextMenu={
          disabled
            ? triggerProps.onContextMenu
            : composeEventHandlers(triggerProps.onContextMenu, (event) => {
                // Some platforms fire contextmenu themselves on a long press
                clearLongPress()
                handleOpen(event)
                event.preventDefault()
              })
        }
        // Touch has no right click: a long press stands in for it
        onPointerDown={
          disabled
            ? triggerProps.onPointerDown
            : composeEventHandlers(
                triggerProps.onPointerDown,
                whenTouchOrPen((event) => {
                  clearLongPress()
                  if (context.open) context.onOpenChange(false)
                  longPressTimerRef.current = window.setTimeout(() => handleOpen(event), LONG_PRESS_DELAY)
                })
              )
        }
        onPointerMove={disabled ? triggerProps.onPointerMove : composeEventHandlers(triggerProps.onPointerMove, whenTouchOrPen(clearLongPress))}
        onPointerCancel={disabled ? triggerProps.onPointerCancel : composeEventHandlers(triggerProps.onPointerCancel, whenTouchOrPen(clearLongPress))}
        onPointerUp={disabled ? triggerProps.onPointerUp : composeEventHandlers(triggerProps.onPointerUp, whenTouchOrPen(clearLongPress))}
      />
    </>
  )
})

type ContextMenuContentProps = Omit<MenuPrimitive.MenuContentProps, "onEntryFocus">

const ContextMenuContent = forwardRef<ContextMenuContentProps>((props, forwardedRef) => {
  const context = useContextMenuContext("ContextMenuContent")
  const hasInteractedOutsideRef = useRef(false)
  return (
    <MenuPrimitive.Content
      side="right"
      sideOffset={2}
      align="start"
      {...props}
      ref={forwardedRef}
      onCloseAutoFocus={(event) => {
        props.onCloseAutoFocus?.(event)
        // Left alone, focus goes back to what had it before the menu opened
        if (!event.defaultPrevented && hasInteractedOutsideRef.current) event.preventDefault()
        hasInteractedOutsideRef.current = false
      }}
      onInteractOutside={(event) => {
        props.onInteractOutside?.(event)
        if (!event.defaultPrevented && !context.modal) hasInteractedOutsideRef.current = true
      }}
    />
  )
})

export { ContextMenu as Root, ContextMenuTrigger as Trigger, ContextMenuContent as Content }
export {
  Portal,
  Group,
  Label,
  Item,
  CheckboxItem,
  RadioGroup,
  RadioItem,
  ItemIndicator,
  Separator,
  Sub,
  SubTrigger,
  SubContent,
} from "./internal/menu"
export type { ContextMenuContentProps }
