// Derived from vaul 1.1.2, Copyright (c) 2023 Emil Kowalski, MIT License (https://opensource.org/license/mit)
import type { ComponentChildren, TargetedPointerEvent } from "preact"
import { useEffect, useRef } from "preact/hooks"
import * as DialogPrimitive from "../radix/dialog"
import { useComposedRefs } from "../radix/internal/compose-refs"
import { createStrictContext } from "../radix/internal/create-context"
import { forwardRef } from "../radix/internal/forward-ref"
import type { PrimitiveProps } from "../radix/internal/primitive"
import { useControllableState } from "../radix/internal/use-controllable-state"
import { vaulStyles } from "./internal/vaul-styles"

// vaul 1.1.2 on the Preact dialog shim: same markup, data attributes, injected styles and drag behavior.
// shortcut: only the parts and props upstream's ui/drawer.tsx uses. No snap points, background scaling, nested drawers, Handle, handleOnly,
// `container`, onDrag/onRelease/onClose/onAnimationEnd and the options `fixed`, `noBodyStyles`, `disablePreventScroll`, `preventScrollRestoration`
// (`repositionInputs` is always on), and none of vaul's iOS Safari scroll prevention and body position: fixed (the dialog shim only sets
// overflow: hidden); port them from vaul when an app needs them.

if (typeof document !== "undefined") {
  const style = document.createElement("style")
  style.textContent = vaulStyles
  document.head.appendChild(style)
}

type Direction = "top" | "bottom" | "left" | "right"

const TRANSITION_EASE = "cubic-bezier(0.32,0.72,0,1)"
const VELOCITY_THRESHOLD = 0.4
const CLOSE_THRESHOLD = 0.25
const SCROLL_LOCK_TIMEOUT = 100
const WINDOW_TOP_OFFSET = 26
const DRAG_CLASS = "vaul-dragging"

type RootProps = {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?(open: boolean): void
  children?: ComponentChildren
  /** @default "bottom" */
  direction?: Direction
  /** When `false`, dragging, clicking outside, pressing Escape and Close do not close the drawer. */
  dismissible?: boolean
  /** When `false`, there is no overlay and the page behind stays usable. */
  modal?: boolean
  /** Fraction of the drawer's size a drag must cover to close it. @default 0.25 */
  closeThreshold?: number
  /** Milliseconds after scrolling the content during which a drag does not start. @default 100 */
  scrollLockTimeout?: number
  /** Move focus into the drawer when it opens; vaul leaves it where it was. In a browser the modal layer's `inert` on the trigger's subtree blurs it, so focus rests on body and the next Tab enters the drawer, where vaul's Tab walks the hidden page. */
  autoFocus?: boolean
}

type PointerLike = Pick<PointerEvent, "target" | "pageX" | "pageY">

const [DrawerProvider, useDrawerContext] = createStrictContext<{
  drawerRef: { current: HTMLDivElement | null }
  overlayRef: { current: HTMLDivElement | null }
  onPress(event: TargetedPointerEvent<HTMLDivElement>): void
  onRelease(event: PointerLike | null): void
  onDrag(event: TargetedPointerEvent<HTMLDivElement>): void
  keyboardIsOpen: { current: boolean }
  shouldAnimate: { current: boolean }
  isOpen: boolean
  modal: boolean
  direction: Direction
  autoFocus: boolean
}>("Drawer")

const isVertical = (direction: Direction) => direction === "top" || direction === "bottom"
const set = (element: HTMLElement | null, styles: Partial<CSSStyleDeclaration>) => element && Object.assign(element.style, styles)
// Pulled upwards the drawer resists more and more
const dampenValue = (distance: number) => 8 * (Math.log(distance + 1) - 2)
const isMobileFirefox = () => (/Firefox/.test(navigator.userAgent) && /Mobile/.test(navigator.userAgent)) || /FxiOS/.test(navigator.userAgent)
// iPadOS 13 reports a Mac, but has a touch screen
const isIOS = () => /^iP(hone|ad)/.test(navigator.platform) || (/^Mac/.test(navigator.platform) && navigator.maxTouchPoints > 1)

const NON_TEXT_INPUT_TYPES = ["checkbox", "radio", "range", "color", "file", "image", "button", "submit", "reset"]
const isInput = (target: Element) =>
  (target instanceof HTMLInputElement && !NON_TEXT_INPUT_TYPES.includes(target.type)) ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable)

// The translation along the drawer's axis, read from the computed matrix so it includes a running transition
function getTranslate(element: HTMLElement, direction: Direction) {
  const { transform } = getComputedStyle(element)
  const matrix3d = transform.match(/^matrix3d\((.+)\)$/)
  if (matrix3d) return parseFloat(matrix3d[1]!.split(", ")[isVertical(direction) ? 13 : 12]!)
  const matrix = transform.match(/^matrix\((.+)\)$/)
  return matrix ? parseFloat(matrix[1]!.split(", ")[isVertical(direction) ? 5 : 4]!) : null
}

const translate = (direction: Direction, value: number) =>
  isVertical(direction) ? `translate3d(0, ${value}px, 0)` : `translate3d(${value}px, 0, 0)`

function Root({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
  direction = "bottom",
  dismissible = true,
  modal = true,
  closeThreshold = CLOSE_THRESHOLD,
  scrollLockTimeout = SCROLL_LOCK_TIMEOUT,
  autoFocus = false,
}: RootProps) {
  const [isOpen, setIsOpen] = useControllableState({ prop: openProp, defaultProp: defaultOpen, onChange: onOpenChange })
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const drawerRef = useRef<HTMLDivElement | null>(null)
  const openTime = useRef<number | null>(null)
  const dragStartTime = useRef<number | null>(null)
  const lastTimeDragPrevented = useRef<number | null>(null)
  const isDragging = useRef(false)
  const isAllowedToDrag = useRef(false)
  const pointerStart = useRef(0)
  const keyboardIsOpen = useRef(false)
  // A drawer that starts open skips its entry animation
  const shouldAnimate = useRef(!defaultOpen)
  const previousDiffFromInitial = useRef(0)
  const drawerHeight = useRef(0)
  const drawerWidth = useRef(0)
  const initialDrawerHeight = useRef(0)

  function shouldDrag(target: EventTarget | null, isDraggingInDirection: boolean) {
    let element = target as HTMLElement
    const highlightedText = window.getSelection()?.toString()
    const swipeAmount = drawerRef.current ? getTranslate(drawerRef.current, direction) : null
    const now = Date.now()

    // A select opens its own popup on a drag (vaul issue 483)
    if (element.tagName === "SELECT") return false
    if (element.hasAttribute("data-vaul-no-drag") || element.closest("[data-vaul-no-drag]")) return false
    if (direction === "right" || direction === "left") return true
    // Allow scrolling while the drawer is sliding in
    if (openTime.current && now - openTime.current < 500) return false
    if (swipeAmount !== null && (direction === "bottom" ? swipeAmount > 0 : swipeAmount < 0)) return true
    if (highlightedText && highlightedText.length > 0) return false
    // Disallow dragging if the drawer was scrolled within `scrollLockTimeout`
    if (lastTimeDragPrevented.current && now - lastTimeDragPrevented.current < scrollLockTimeout && swipeAmount === 0) {
      lastTimeDragPrevented.current = now
      return false
    }
    if (isDraggingInDirection) {
      lastTimeDragPrevented.current = now
      // Moving into the page: the gesture is a scroll
      return false
    }
    // Climb the tree: a scrolled ancestor keeps the gesture for itself, the drawer takes it from an unscrolled one
    while (element) {
      if (element.scrollHeight > element.clientHeight) {
        if (element.scrollTop !== 0) {
          lastTimeDragPrevented.current = Date.now()
          return false
        }
        if (element.getAttribute("role") === "dialog") return true
      }
      element = element.parentNode as HTMLElement
    }
    return true
  }

  function onPress(event: TargetedPointerEvent<HTMLDivElement>) {
    if (!dismissible) return
    const drawer = drawerRef.current
    if (drawer && !drawer.contains(event.target as Node)) return

    drawerHeight.current = drawer?.getBoundingClientRect().height || 0
    drawerWidth.current = drawer?.getBoundingClientRect().width || 0
    isDragging.current = true
    dragStartTime.current = Date.now()

    // iOS doesn't fire pointerup after scrolling, so touchend is what ends the allowance to drag
    if (isIOS()) window.addEventListener("touchend", () => (isAllowedToDrag.current = false), { once: true })
    // Keep the pointer, even when it leaves the drawer
    ;(event.target as HTMLElement).setPointerCapture(event.pointerId)

    pointerStart.current = isVertical(direction) ? event.pageY : event.pageX
  }

  function onDrag(event: TargetedPointerEvent<HTMLDivElement>) {
    const drawer = drawerRef.current
    if (!drawer || !isDragging.current) return

    const directionMultiplier = direction === "bottom" || direction === "right" ? 1 : -1
    const draggedDistance = (pointerStart.current - (isVertical(direction) ? event.pageY : event.pageX)) * directionMultiplier
    const isDraggingInDirection = draggedDistance > 0
    const absDraggedDistance = Math.abs(draggedDistance)
    // 1 is the closed position
    const percentageDragged = absDraggedDistance / (isVertical(direction) ? drawerHeight.current : drawerWidth.current)

    if (!isAllowedToDrag.current && !shouldDrag(event.target, isDraggingInDirection)) return
    drawer.classList.add(DRAG_CLASS)
    // Once a drag was allowed it stays allowed until the pointer is released
    isAllowedToDrag.current = true
    set(drawer, { transition: "none" })
    set(overlayRef.current, { transition: "none" })

    if (isDraggingInDirection) {
      set(drawer, { transform: translate(direction, Math.min(dampenValue(draggedDistance) * -1, 0) * directionMultiplier) })
      return
    }

    set(overlayRef.current, { opacity: `${1 - percentageDragged}`, transition: "none" })
    set(drawer, { transform: translate(direction, absDraggedDistance * directionMultiplier) })
  }

  function resetDrawer() {
    set(drawerRef.current, { transform: "translate3d(0, 0, 0)", transition: `transform 0.5s ${TRANSITION_EASE}` })
    set(overlayRef.current, { transition: `opacity 0.5s ${TRANSITION_EASE}`, opacity: "1" })
  }

  function endDrag() {
    drawerRef.current?.classList.remove(DRAG_CLASS)
    isAllowedToDrag.current = false
    isDragging.current = false
  }

  function handleOpenChange(open: boolean) {
    if (!dismissible && !open) return
    if (!open) endDrag()
    setIsOpen(open)
  }

  function onRelease(event: PointerLike | null) {
    const drawer = drawerRef.current
    if (!isDragging.current || !drawer) return

    endDrag()
    const swipeAmount = getTranslate(drawer, direction)
    if (!event || !shouldDrag(event.target, false) || !swipeAmount || dragStartTime.current === null) return

    const timeTaken = Date.now() - dragStartTime.current
    const distMoved = pointerStart.current - (isVertical(direction) ? event.pageY : event.pageX)
    const velocity = Math.abs(distMoved) / timeTaken

    // Moved away from the edge it closes towards: nothing to close
    if (direction === "bottom" || direction === "right" ? distMoved > 0 : distMoved < 0) return resetDrawer()
    if (velocity > VELOCITY_THRESHOLD) return handleOpenChange(false)

    const rect = drawer.getBoundingClientRect()
    const visibleSize = isVertical(direction) ? Math.min(rect.height, window.innerHeight) : Math.min(rect.width, window.innerWidth)
    if (Math.abs(swipeAmount) >= visibleSize * closeThreshold) return handleOpenChange(false)
    resetDrawer()
  }

  useEffect(() => {
    window.requestAnimationFrame(() => (shouldAnimate.current = true))
  }, [])

  useEffect(() => {
    // Keep the drawer above the on-screen keyboard
    function onVisualViewportChange() {
      const drawer = drawerRef.current
      if (!drawer) return
      if (!isInput(document.activeElement!) && !keyboardIsOpen.current) return

      const visualViewportHeight = window.visualViewport?.height || 0
      const totalHeight = window.innerHeight
      // The height of the keyboard
      const diffFromInitial = totalHeight - visualViewportHeight
      const { height, top } = drawer.getBoundingClientRect()
      const isTallEnough = height > totalHeight * 0.8

      if (!initialDrawerHeight.current) initialDrawerHeight.current = height

      // The visual viewport also changes for subtle reasons: only 60px or more is the keyboard opening or closing
      if (Math.abs(previousDiffFromInitial.current - diffFromInitial) > 60) keyboardIsOpen.current = !keyboardIsOpen.current
      previousDiffFromInitial.current = diffFromInitial

      if (height > visualViewportHeight || keyboardIsOpen.current) {
        const newHeight = height > visualViewportHeight ? visualViewportHeight - (isTallEnough ? top : WINDOW_TOP_OFFSET) : height
        drawer.style.height = `${Math.max(newHeight, visualViewportHeight - top)}px`
      } else if (!isMobileFirefox()) {
        drawer.style.height = `${initialDrawerHeight.current}px`
      }
      // A negative bottom never makes sense
      drawer.style.bottom = `${Math.max(diffFromInitial, 0)}px`
    }

    window.visualViewport?.addEventListener("resize", onVisualViewportChange)
    return () => window.visualViewport?.removeEventListener("resize", onVisualViewportChange)
  }, [])

  useEffect(() => {
    if (!isOpen) return
    const root = document.documentElement
    const scrollBehavior = root.style.scrollBehavior
    root.style.scrollBehavior = "auto"
    openTime.current = Date.now()
    return () => void (root.style.scrollBehavior = scrollBehavior)
  }, [isOpen])

  return (
    <DialogPrimitive.Root open={isOpen} modal={modal} onOpenChange={handleOpenChange}>
      <DrawerProvider
        value={{ drawerRef, overlayRef, onPress, onRelease, onDrag, keyboardIsOpen, shouldAnimate, isOpen, modal, direction, autoFocus }}
      >
        {children}
      </DrawerProvider>
    </DialogPrimitive.Root>
  )
}

const Overlay = forwardRef<PrimitiveProps<"div">>((props, ref) => {
  const { overlayRef, onRelease, shouldAnimate, isOpen } = useDrawerContext("DrawerOverlay")
  const composedRef = useComposedRefs(ref, overlayRef)
  return (
    <DialogPrimitive.Overlay
      onMouseUp={(event) => onRelease(event)}
      ref={composedRef}
      data-vaul-overlay=""
      data-vaul-snap-points="false"
      data-vaul-snap-points-overlay={isOpen ? "true" : "false"}
      data-vaul-animate={shouldAnimate.current ? "true" : "false"}
      {...props}
    />
  )
})

type ContentProps = DialogPrimitive.DialogContentProps

const Content = forwardRef<ContentProps>(({ onPointerDownOutside, onOpenAutoFocus, ...rest }, ref) => {
  const { drawerRef, onPress, onRelease, onDrag, keyboardIsOpen, shouldAnimate, modal, direction, autoFocus } = useDrawerContext("DrawerContent")
  const composedRef = useComposedRefs(ref, drawerRef)
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
  const lastKnownPointerEventRef = useRef<TargetedPointerEvent<HTMLDivElement> | null>(null)
  const wasBeyondThePointRef = useRef(false)

  // Within `threshold` along the axis a move counts only when it is more along the axis than across it; past that it always counts, and keeps counting until release
  function isDeltaInDirection(delta: { x: number; y: number }, threshold: number) {
    if (wasBeyondThePointRef.current) return true

    const deltaY = Math.abs(delta.y)
    const deltaX = Math.abs(delta.x)
    const isDeltaX = deltaX > deltaY
    const dFactor = direction === "bottom" || direction === "right" ? 1 : -1

    if (direction === "left" || direction === "right") {
      if (delta.x * dFactor >= 0 && deltaX <= threshold) return isDeltaX
    } else if (delta.y * dFactor >= 0 && deltaY <= threshold) return !isDeltaX

    wasBeyondThePointRef.current = true
    return true
  }

  function handleOnPointerUp(event: PointerLike | null) {
    pointerStartRef.current = null
    wasBeyondThePointRef.current = false
    onRelease(event)
  }

  return (
    <DialogPrimitive.Content
      data-vaul-drawer-direction={direction}
      data-vaul-drawer=""
      data-vaul-delayed-snap-points="false"
      data-vaul-snap-points="false"
      data-vaul-custom-container="false"
      data-vaul-animate={shouldAnimate.current ? "true" : "false"}
      {...rest}
      ref={composedRef}
      onPointerDown={(event) => {
        rest.onPointerDown?.(event)
        pointerStartRef.current = { x: event.pageX, y: event.pageY }
        onPress(event)
      }}
      onOpenAutoFocus={(event) => {
        onOpenAutoFocus?.(event)
        if (!autoFocus) event.preventDefault()
      }}
      onPointerDownOutside={(event) => {
        onPointerDownOutside?.(event)
        // Without a modal the page behind stays usable, so a pointer outside never dismisses
        if (!modal || event.defaultPrevented) {
          event.preventDefault()
          return
        }
        keyboardIsOpen.current = false
      }}
      onFocusOutside={(event) => {
        if (!modal) event.preventDefault()
      }}
      onPointerMove={(event) => {
        lastKnownPointerEventRef.current = event
        rest.onPointerMove?.(event)
        if (!pointerStartRef.current) return
        const delta = { x: event.pageX - pointerStartRef.current.x, y: event.pageY - pointerStartRef.current.y }
        const swipeStartThreshold = event.pointerType === "touch" ? 10 : 2

        if (isDeltaInDirection(delta, swipeStartThreshold)) onDrag(event)
        else if (Math.abs(delta.x) > swipeStartThreshold || Math.abs(delta.y) > swipeStartThreshold) pointerStartRef.current = null
      }}
      onPointerUp={(event) => {
        rest.onPointerUp?.(event)
        handleOnPointerUp(event)
      }}
      onPointerOut={(event) => {
        rest.onPointerOut?.(event)
        handleOnPointerUp(lastKnownPointerEventRef.current)
      }}
      onContextMenu={(event) => {
        rest.onContextMenu?.(event)
        if (lastKnownPointerEventRef.current) handleOnPointerUp(lastKnownPointerEventRef.current)
      }}
    />
  )
})

export const Drawer = {
  Root,
  Content,
  Overlay,
  Trigger: DialogPrimitive.Trigger,
  Portal: DialogPrimitive.Portal,
  Close: DialogPrimitive.Close,
  Title: DialogPrimitive.Title,
  Description: DialogPrimitive.Description,
}
