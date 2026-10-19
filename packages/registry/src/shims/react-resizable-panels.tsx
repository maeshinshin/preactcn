// Derived from react-resizable-panels 4.14.4, Copyright (c) 2018 Brian Vaughn, MIT License (https://opensource.org/license/mit)
import { createContext, type ComponentChildren, type CSSProperties, type HTMLAttributes, type Ref } from "preact"
import { useContext, useId, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks"
import { useComposedRefs } from "../radix/internal/compose-refs"

// react-resizable-panels 4.14.4 on Preact: the same data-group, data-panel and data-separator markup, the same layout algorithm and the
// same document-level pointer handling (hit areas wider than the separator, resize cursors, nested groups dragged together).
// shortcut: only the surface upstream's ui/resizable.tsx and its example use: Group (orientation, onLayoutChange), Panel (defaultSize,
// minSize, maxSize, id), Separator, the Layout type, and elementRef on each. Not ported: collapsible panels (collapsedSize,
// collapsedThreshold, the Enter key), disabled, disableDoubleClick, disableCursor, groupResizeBehavior, defaultLayout and the storage hooks,
// groupRef/panelRef and their hooks, onLayoutChanged, onResize, resizePreviewMode with SeparatorOverlay, resizeTargetMinimumSize, Grid;
// the types reject them, port the one a caller needs from react-resizable-panels.
// shortcut: a pointer over any element of the group counts for its separators, where the library compares stacking order, so a modal over a
// separator is not told apart from the group's own content, and a group inside a shadow root never matches; the library's check is
// isViableHitTarget. Only Panels and Separators sit directly in a Group, and keyed panels moved without re-registering keep their old
// order (the library re-sorts when the DOM order changes).

export type Layout = { [id: string]: number }
type Orientation = "horizontal" | "vertical"
// A number is pixels, a string without a unit is a percentage
type Size = number | string

type Attributes = Omit<HTMLAttributes<HTMLDivElement>, "ref" | "class">
type With<Base, Own> = Omit<Base, keyof Own> & Own

export type GroupProps = With<
  Attributes,
  {
    children?: ComponentChildren
    className?: string
    elementRef?: Ref<HTMLDivElement>
    id?: string | number
    onLayoutChange?(layout: Layout): void
    orientation?: Orientation
    style?: CSSProperties
  }
>
export type PanelProps = With<
  Omit<Attributes, "onResize">,
  {
    children?: ComponentChildren
    // Applied to the div nested in the panel, which keeps the panel's own styles out of the flex layout
    className?: string
    defaultSize?: Size
    elementRef?: Ref<HTMLDivElement>
    id?: string | number
    maxSize?: Size
    minSize?: Size
    style?: CSSProperties
  }
>
export type SeparatorProps = With<
  Omit<Attributes, "role" | "tabIndex">,
  {
    children?: ComponentChildren
    className?: string
    elementRef?: Ref<HTMLDivElement>
    id?: string | number
    style?: CSSProperties
  }
>

type Item = { element: HTMLElement; id: string; defaultSize: Size | undefined; minSize: Size; maxSize: Size }
type Sep = { element: HTMLElement; id: string }
type Axis = {
  element: HTMLElement
  id: string
  orientation: Orientation
  items: Item[]
  separators: Sep[]
  // Requested layouts by panel ids, so a group that re-registers (a panel came or went) finds the sizes the user chose
  layouts: { [itemIds: string]: Layout }
}
// All sizes are percentages of the space the panels share
type Constraints = { itemId: string; defaultSize: number | undefined; minSize: number; maxSize: number }
type AxisState = {
  // The group had no size yet (hidden subtree): the layout is a guess and nobody is told about it
  deferred: boolean
  constraints: Constraints[]
  layout: Layout
  // What the user or the app asked for; `layout` is re-derived from it when the group size changes, so constraints only clamp temporarily
  requestedLayout: Layout
  separatorToItems: Map<Sep, [Item, Item]>
}

// ---- layout arithmetic ----

const format = (n: number) => parseFloat(n.toFixed(3))
const same = (a: number, b: number, tolerance = 0) => Math.abs(format(a) - format(b)) <= tolerance
const compare = (a: number, b: number) => (same(a, b) ? 0 : a > b ? 1 : -1)
const sum = (numbers: number[]) => numbers.reduce((total, n) => total + n, 0)
const layoutsEqual = (a: Layout, b: Layout) =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((id) => b[id] !== undefined && compare(a[id]!, b[id]!) === 0)
const toLayout = (constraints: Constraints[], sizes: number[]): Layout => Object.fromEntries(constraints.map((c, i) => [c.itemId, sizes[i]!]))

function clamp({ minSize, maxSize }: Constraints, size: number) {
  if (compare(size, minSize) < 0) size = minSize
  return format(Math.min(maxSize, size))
}

function parseSize(size: Size): [number, string] {
  if (typeof size === "number") return [size, "px"]
  return [parseFloat(size), /(%|px|rem|em|vh|vw)$/.exec(size)?.[1] ?? "%"]
}

function toPixels(axisSize: number, element: HTMLElement, size: Size) {
  const [n, unit] = parseSize(size)
  const view = element.ownerDocument.defaultView!
  switch (unit) {
    case "px":
      return n
    case "rem":
      return n * parseFloat(view.getComputedStyle(element.ownerDocument.documentElement).fontSize)
    case "em":
      return n * parseFloat(view.getComputedStyle(element).fontSize)
    case "vh":
      return (n / 100) * view.innerHeight
    case "vw":
      return (n / 100) * view.innerWidth
    default:
      return (n / 100) * axisSize
  }
}

// The space the panels share: separators and the group's own padding are not part of it
const availableSize = ({ items, orientation }: Axis) =>
  sum(items.map(({ element }) => (orientation === "horizontal" ? element.offsetWidth : element.offsetHeight)))

function calculateConstraints(axis: Axis): Constraints[] {
  const axisSize = availableSize(axis)
  return axis.items.map(({ id, element, defaultSize, minSize, maxSize }) => {
    // A group of size 0 (a hidden subtree) has no pixels to convert to percentages
    if (axisSize === 0) return { itemId: id, defaultSize: undefined, minSize: 0, maxSize: 100 }
    const percent = (size: Size) => format((toPixels(axisSize, element, size) / axisSize) * 100)
    return { itemId: id, defaultSize: defaultSize === undefined ? undefined : percent(defaultSize), minSize: percent(minSize), maxSize: percent(maxSize) }
  })
}

// Panels with a default size get it, the rest share what is left
function calculateDefaultLayout(constraints: Constraints[]): Layout {
  const layout: Layout = {}
  let total = 0
  for (const { itemId, defaultSize } of constraints) {
    if (defaultSize !== undefined) total += layout[itemId] = format(defaultSize)
  }
  const rest = format((100 - total) / constraints.filter((c) => c.defaultSize === undefined).length)
  for (const { itemId } of constraints) layout[itemId] ??= rest
  return layout
}

const defaultLayoutOf = (axis: Axis, constraints: Constraints[]) =>
  axis.layouts[axis.items.map(({ id }) => id).join(",")] ?? calculateDefaultLayout(constraints)

// Scales the layout to 100%, then moves what the constraints clip to the panels that can take it
function validateLayout(layout: Layout, constraints: Constraints[]): Layout {
  if (Object.keys(layout).length !== constraints.length)
    throw Error(`Invalid ${constraints.length} panel layout: ${Object.values(layout).map((size) => `${size}%`).join(", ")}`)
  let sizes = constraints.map((c) => layout[c.itemId]!)
  const total = sum(sizes)
  if (!same(total, 100) && sizes.length > 0) sizes = sizes.map((size) => (100 / total) * size)

  let remaining = 0
  sizes.forEach((size, i) => {
    const safe = clamp(constraints[i]!, size)
    if (size != safe) {
      remaining += size - safe
      sizes[i] = safe
    }
  })
  if (!same(remaining, 0)) {
    for (let i = 0; i < sizes.length; i++) {
      const size = sizes[i]!
      const safe = clamp(constraints[i]!, size + remaining)
      if (size !== safe) {
        remaining -= safe - size
        sizes[i] = safe
        if (same(remaining, 0)) break
      }
    }
  }
  return toLayout(constraints, sizes)
}

// Scales a layout to 100% without applying the panels' constraints
const normalizeLayout = (itemIds: string[], layout: Layout) =>
  validateLayout(layout, itemIds.map((itemId) => ({ itemId, defaultSize: undefined, minSize: 0, maxSize: 100 })))

// Moves the separator between the pivot panels by `delta` percent: the panels on the side it moves toward shrink one after the other
// down to their minimum, the panel on the other side grows by what they gave up. Returns `prevLayout` when nothing can move.
function adjustLayoutByDelta(delta: number, initialLayout: Layout, constraints: Constraints[], [first, second]: number[], prevLayout: Layout): Layout {
  if (same(delta, 0)) return initialLayout
  const count = constraints.length
  const initial = constraints.map((c) => initialLayout[c.itemId]!)
  const prev = constraints.map((c) => prevLayout[c.itemId]!)
  const next = [...initial]
  const growing = delta < 0 ? second! : first!
  const shrinking = delta < 0 ? first! : second!

  // The delta is bounded by how far the panels on the growing side can grow
  let available = 0
  for (let i = growing; i >= 0 && i < count; i += delta < 0 ? 1 : -1) available += clamp(constraints[i]!, 100) - initial[i]!
  const limit = Math.min(Math.abs(delta), Math.abs(available))
  delta = delta < 0 ? -limit : limit

  let applied = 0
  for (let i = shrinking; i >= 0 && i < count; i += delta < 0 ? -1 : 1) {
    const safe = clamp(constraints[i]!, initial[i]! - (Math.abs(delta) - Math.abs(applied)))
    if (!same(initial[i]!, safe)) {
      applied += initial[i]! - safe
      next[i] = safe
      if (compare(applied, Math.abs(delta)) >= 0) break
    }
  }

  // Nothing could move (a drag past a boundary)
  if (prev.every((size, i) => size === next[i])) return prevLayout

  const unsafe = initial[growing]! + applied
  const safe = clamp(constraints[growing]!, unsafe)
  next[growing] = safe
  // The growing panel hit its maximum: the rest goes to the panels beyond it
  if (!same(safe, unsafe)) {
    let remaining = unsafe - safe
    for (let i = growing; i >= 0 && i < count; i += delta > 0 ? -1 : 1) {
      const size = next[i]!
      const clamped = clamp(constraints[i]!, size + remaining)
      if (!same(size, clamped)) {
        remaining -= clamped - size
        next[i] = clamped
      }
      if (same(remaining, 0)) break
    }
  }

  // Rounding aside, a layout that is not 100% means the delta cannot be applied
  return same(sum(next), 100, 0.1) ? toLayout(constraints, next) : prevLayout
}

// aria-valuemin and -max of a separator are the smallest and largest size its primary panel can reach
function calculateAriaValues(layout: Layout, constraints: Constraints[], itemId: string, itemIndex: number) {
  const c = constraints.find((current) => current.itemId === itemId)
  const reach = (size: number | undefined) =>
    size === undefined
      ? undefined
      : validateLayout(adjustLayoutByDelta(size - layout[itemId]!, layout, constraints, [itemIndex, itemIndex + 1], layout), constraints)[itemId]
  return { controls: itemId, min: reach(c?.minSize), max: reach(c?.maxSize), now: layout[itemId] }
}

// ---- store: mounted groups and the one pointer interaction they share ----

const axes = new Map<Axis, AxisState>()
type AxisEvent = { axis: Axis; next: AxisState }
const axisListeners = new Set<(event: AxisEvent) => void>()

function updateAxis(axis: Axis, next: AxisState) {
  axes.set(axis, next)
  for (const listener of [...axisListeners]) listener({ axis, next })
}

function subscribeToAxis(axisId: string, listener: (event: AxisEvent) => void) {
  const filtered = (event: AxisEvent) => event.axis.id === axisId && listener(event)
  axisListeners.add(filtered)
  return () => void axisListeners.delete(filtered)
}

const axisStateById = (axisId: string) => [...axes].find(([axis]) => axis.id === axisId)?.[1]

type Rect = { left: number; top: number; right: number; bottom: number }
type Point = { x: number; y: number }
type HitRegion = { axis: Axis; axisSize: number; items: [Item, Item]; separator: Sep | undefined; rect: Rect }
type Inactive = { state: "inactive" }
type Hover = { state: "hover"; ownerDocument: Document; hitRegions: HitRegion[]; cursorFlags: number }
type Active = {
  state: "active"
  ownerDocument: Document
  hitRegions: HitRegion[]
  initialLayouts: Map<Axis, Layout>
  pointerDownAt: Point
  pointerId: number
  pointerType: string
  didPointerMove: boolean
  cursorFlags: number
}
type Interaction = Inactive | Hover | Active

// Set when the pointer is stopped by a panel's minimum or maximum, to show a one-sided resize cursor
const CURSOR_H_MIN = 0b0001
const CURSOR_H_MAX = 0b0010
const CURSOR_V_MIN = 0b0100
const CURSOR_V_MAX = 0b1000
const CURSOR_H = 0b0011
const CURSOR_V = 0b1100

let interaction: Interaction = { state: "inactive" }
const interactionListeners = new Set<(next: Interaction) => void>()

function setInteraction(next: Interaction) {
  const prev = interaction
  interaction = next
  // Keep click-to-focus, but release keyboard focus after a drag so the separator does not stay highlighted
  if (prev.state === "active" && next.state !== "active" && prev.didPointerMove) {
    for (const { separator } of prev.hitRegions) {
      if (separator && separator.element.ownerDocument.activeElement === separator.element) separator.element.blur()
    }
  }
  // The state is shared by every document with groups (a popup window), the cursor follows it in the old and the new one
  for (const document of new Set([prev, next].flatMap((state) => (state.state === "inactive" ? [] : [state.ownerDocument])))) updateCursor(document)
  for (const listener of [...interactionListeners]) listener(next)
}

function subscribeToInteraction(listener: (next: Interaction) => void) {
  interactionListeners.add(listener)
  return () => void interactionListeners.delete(listener)
}

function removeAxisFromInteraction(axis: Axis) {
  if (interaction.state === "inactive") return
  const hitRegions = interaction.hitRegions.filter((region) => region.axis !== axis)
  if (hitRegions.length === interaction.hitRegions.length) return
  if (hitRegions.length === 0) return setInteraction({ state: "inactive" })
  if (interaction.state === "hover") return setInteraction({ ...interaction, hitRegions })
  const initialLayouts = new Map(interaction.initialLayouts)
  initialLayouts.delete(axis)
  setInteraction({ ...interaction, cursorFlags: 0, hitRegions, initialLayouts })
}

// ---- cursor ----

let advancedCursors: boolean | undefined
// Chrome and Firefox know the two-way resize cursors (ew-resize); the others get col-resize and row-resize
const supportsAdvancedCursors = () =>
  (advancedCursors ??= typeof window !== "undefined" && (window.navigator.userAgent.includes("Chrome") || window.navigator.userAgent.includes("Firefox")))

function cursorFor(state: Hover | Active) {
  const horizontal = state.hitRegions.some(({ axis }) => axis.orientation === "horizontal")
  const vertical = state.hitRegions.some(({ axis }) => axis.orientation === "vertical")
  const advanced = supportsAdvancedCursors()
  if (state.state === "active" && state.cursorFlags && advanced) {
    const flags = state.cursorFlags
    const [vMin, vMax] = [flags & CURSOR_V_MIN, flags & CURSOR_V_MAX]
    if (flags & CURSOR_H_MIN) return vMin ? "se-resize" : vMax ? "ne-resize" : "e-resize"
    if (flags & CURSOR_H_MAX) return vMin ? "sw-resize" : vMax ? "nw-resize" : "w-resize"
    if (vMin) return "s-resize"
    if (vMax) return "n-resize"
  }
  if (advanced) return horizontal && vertical ? "move" : horizontal ? "ew-resize" : "ns-resize"
  return horizontal && vertical ? "grab" : horizontal ? "col-resize" : "row-resize"
}

const cursorSheets = new WeakMap<Document, { sheet: CSSStyleSheet; style: string }>()

function updateCursor(document: Document) {
  // Safari before 16.4 has no adoptedStyleSheets: the resize cursor is the only thing lost
  if (!document.defaultView || !document.adoptedStyleSheets) return
  let entry = cursorSheets.get(document)
  if (!entry) {
    entry = { sheet: new document.defaultView.CSSStyleSheet(), style: "" }
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, entry.sheet]
    cursorSheets.set(document, entry)
  }
  const style = interaction.state !== "inactive" && interaction.ownerDocument === document ? `*, *:hover {cursor: ${cursorFor(interaction)} !important; }` : ""
  if (style === entry.style) return
  entry.style = style
  entry.sheet.replaceSync(style)
}

// ---- hit areas ----

let coarsePointer: boolean | undefined
const isCoarsePointer = () => (coarsePointer ??= typeof matchMedia === "function" && matchMedia("(pointer:coarse)").matches)

// Grows a thin target to the minimum size a pointer can hit, evenly on both sides
function expand(rect: Rect): Rect {
  const min = isCoarsePointer() ? 20 : 10
  const dx = Math.max(0, min - (rect.right - rect.left)) / 2
  const dy = Math.max(0, min - (rect.bottom - rect.top)) / 2
  return { left: rect.left - dx, right: rect.right + dx, top: rect.top - dy, bottom: rect.bottom + dy }
}

function compareDocumentPosition(a: Node, b: Node) {
  return a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
}

// Visual order along the axis; elements with identical boxes (hidden, or no layout engine) keep their DOM order
function sortByOffset<T extends { element: HTMLElement }>(orientation: Orientation, list: T[]): T[] {
  const [offset, size] = orientation === "horizontal" ? (["offsetLeft", "offsetWidth"] as const) : (["offsetTop", "offsetHeight"] as const)
  return [...list].sort((a, b) => a.element[offset] - b.element[offset] || a.element[size] - b.element[size] || compareDocumentPosition(a.element, b.element))
}

// A hit area is a separator, or the gap between two panels where there is none
function calculateHitRegions(axis: Axis): HitRegion[] {
  const horizontal = axis.orientation === "horizontal"
  const regions: HitRegion[] = []
  const children = sortByOffset(axis.orientation, [
    ...axis.items.map((item) => ({ element: item.element, item })),
    ...axis.separators.map((separator) => ({ element: separator.element, separator })),
  ])
  let prev: Item | undefined
  let between: Sep[] = []
  let axisSize: number | undefined
  for (const child of children) {
    if (!("item" in child)) {
      between.push(child.separator)
      continue
    }
    if (prev) {
      const a = prev.element.getBoundingClientRect()
      const b = child.element.getBoundingClientRect()
      const gap: Rect = horizontal ? { left: a.right, right: b.left, top: b.top, bottom: b.bottom } : { left: b.left, right: b.right, top: a.bottom, bottom: b.top }
      axisSize ??= availableSize(axis)
      for (const separator of between.length ? between : [undefined]) {
        const { left, right, top, bottom } = separator ? separator.element.getBoundingClientRect() : gap
        regions.push({ axis, axisSize, items: [prev, child.item], separator, rect: expand({ left, right, top, bottom }) })
      }
    }
    prev = child.item
    between = []
  }
  return regions
}

function distance(point: Point, rect: Rect): Point {
  return {
    x: point.x >= rect.left && point.x <= rect.right ? 0 : Math.min(Math.abs(point.x - rect.left), Math.abs(point.x - rect.right)),
    y: point.y >= rect.top && point.y <= rect.bottom ? 0 : Math.min(Math.abs(point.y - rect.top), Math.abs(point.y - rect.bottom)),
  }
}

// Per group, the hit area under the pointer. Nested groups can match together: a pointer at a T junction drags both separators.
function findMatchingHitRegions(event: { clientX: number; clientY: number; target: EventTarget | null }, ownerDocument: Document): HitRegion[] {
  const point = { x: event.clientX, y: event.clientY }
  const matches: HitRegion[] = []
  for (const axis of axes.keys()) {
    // Coordinates only mean something in the document the event was dispatched to
    if (axis.element.ownerDocument !== ownerDocument) continue
    const horizontal = axis.orientation === "horizontal"
    let closest: { region: HitRegion; distance: Point } | undefined
    for (const region of calculateHitRegions(axis)) {
      const d = distance(point, region.rect)
      // The distance along the axis decides, the other one breaks ties
      const [primary, secondary] = horizontal ? ([d.x, d.y] as const) : ([d.y, d.x] as const)
      const best = closest && (horizontal ? ([closest.distance.x, closest.distance.y] as const) : ([closest.distance.y, closest.distance.x] as const))
      if (!best || primary < best[0] || (primary === best[0] && secondary <= best[1])) closest = { region, distance: d }
    }
    // Something else on top of the group (a menu, a dialog) keeps the pointer
    const target = event.target as Node | null
    if (closest && closest.distance.x <= 0 && closest.distance.y <= 0 && target && "nodeType" in target && (axis.element.contains(target) || target.contains(axis.element))) {
      matches.push(closest.region)
    }
  }
  return matches
}

// ---- pointer, keyboard ----

type Pointer = { pointerId?: number; pointerType?: string }

// There is one pen, but it may get a new pointer id each time it comes into range
const isSamePointer = (state: Active, pointer: Pointer) =>
  pointer.pointerId === state.pointerId || (pointer.pointerType === "pen" && state.pointerType === "pen")

// Events of another pointer or document do not touch a drag; events without a pointer id (window blur) match any
const isActivePointerEvent = (state: Active, ownerDocument: Document, pointer: Pointer = {}) =>
  state.ownerDocument === ownerDocument && (pointer.pointerId === undefined || isSamePointer(state, pointer))

function endDrag(ownerDocument: Document, pointer?: Pointer) {
  if (interaction.state !== "active" || !isActivePointerEvent(interaction, ownerDocument, pointer)) return false
  setInteraction({ state: "inactive" })
  return true
}

// pointerDownAt is missing when the pointer left the page: the drag goes all the way to that side
function dragTo(event: { clientX: number; clientY: number; movementX: number; movementY: number }, state: Active, pointerDownAt?: Point) {
  let flags = 0
  for (const region of state.hitRegions) {
    const { axis, axisSize } = region
    const horizontal = axis.orientation === "horizontal"
    const pointer = horizontal ? event.clientX : event.clientY
    const delta = pointerDownAt ? ((pointer - (horizontal ? pointerDownAt.x : pointerDownAt.y)) / axisSize) * 100 : pointer < 0 ? -100 : 100
    const initialLayout = state.initialLayouts.get(axis)
    const axisState = axes.get(axis)
    if (!initialLayout || !axisState) continue

    const layout = adjustLayoutByDelta(delta, initialLayout, axisState.constraints, region.items.map((item) => axis.items.indexOf(item)), axisState.layout)
    if (layoutsEqual(layout, axisState.layout)) {
      // Unchanged means the pointer is past the allowed bounds
      if (delta !== 0) flags |= horizontal ? (delta < 0 ? CURSOR_H_MIN : CURSOR_H_MAX) : delta < 0 ? CURSOR_V_MIN : CURSOR_V_MAX
    } else {
      updateAxis(axis, { ...axisState, layout, requestedLayout: layout })
    }
  }

  // No movement since the last event (Firefox rounds clientX) keeps the cursor flags of that direction
  const cursorFlags = (event.movementX === 0 ? state.cursorFlags & CURSOR_H : flags & CURSOR_H) | (event.movementY === 0 ? state.cursorFlags & CURSOR_V : flags & CURSOR_V)
  if (interaction.state !== "active") return
  const didPointerMove = event.clientX !== state.pointerDownAt.x || event.clientY !== state.pointerDownAt.y
  setInteraction({ ...interaction, cursorFlags, didPointerMove: interaction.didPointerMove || didPointerMove })
}

function onPointerDown(event: PointerEvent) {
  if (event.defaultPrevented || (event.pointerType === "mouse" && event.button > 0)) return
  const ownerDocument = event.currentTarget as Document
  if (interaction.state === "active") {
    // The same pointer cannot be pressed twice: its release was missed (it happened in another document). End that drag, but start no
    // new one, because committing it may move the separator from under the pointer. Another pointer's drag is left alone.
    if (isSamePointer(interaction, event)) endDrag(interaction.ownerDocument, interaction)
    return
  }

  const hitRegions = findMatchingHitRegions(event, ownerDocument)
  if (hitRegions.length === 0) return
  const initialLayouts = new Map<Axis, Layout>()
  for (const { axis } of hitRegions) {
    const axisState = axes.get(axis)
    if (axisState) initialLayouts.set(axis, axisState.layout)
  }
  // Not setPointerCapture: it would stop the click when the pointer is released without moving. The first move captures.
  hitRegions.find((region) => region.separator)?.separator?.element.focus({ focusVisible: false, preventScroll: true } as FocusOptions)
  setInteraction({
    state: "active",
    cursorFlags: 0,
    didPointerMove: false,
    hitRegions,
    initialLayouts,
    ownerDocument,
    pointerDownAt: { x: event.clientX, y: event.clientY },
    pointerId: event.pointerId,
    pointerType: event.pointerType,
  })
  event.preventDefault()
}

function onPointerMove(event: PointerEvent) {
  if (event.defaultPrevented) return
  const ownerDocument = event.currentTarget as Document
  const state = interaction
  if (state.state === "active") {
    if (!isActivePointerEvent(state, ownerDocument, event)) return
    // The button was released outside the page (an iframe of another origin ate the pointerup)
    if (event.buttons === 0) return void endDrag(ownerDocument, event)
    // Capturing keeps the move and up events coming over iframes
    for (const { separator } of state.hitRegions) {
      if (separator?.element.isConnected && !separator.element.hasPointerCapture?.(event.pointerId)) separator.element.setPointerCapture?.(event.pointerId)
    }
    return dragTo(event, state, state.pointerDownAt)
  }
  const hitRegions = findMatchingHitRegions(event, ownerDocument)
  if (hitRegions.length > 0) setInteraction({ state: "hover", cursorFlags: 0, hitRegions, ownerDocument })
  else if (state.state !== "inactive") setInteraction({ state: "inactive" })
}

function onPointerLeave(event: PointerEvent) {
  const state = interaction
  if (state.state === "active" && isActivePointerEvent(state, event.currentTarget as Document, event)) dragTo(event, state)
}

function onPointerUp(event: PointerEvent) {
  if (event.defaultPrevented || (event.pointerType === "mouse" && event.button > 0)) return
  if (endDrag(event.currentTarget as Document, event)) event.preventDefault()
}

// An iframe swallows pointerout: reset the hover state it would leave behind (data-separator stuck on "hover")
function onPointerOut(event: PointerEvent) {
  if (event.relatedTarget instanceof HTMLIFrameElement && interaction.state === "hover" && interaction.ownerDocument === event.currentTarget) {
    setInteraction({ state: "inactive" })
  }
}

// The pointer was lost without a pointerup: the browser took it over (a gesture), the capturing separator went away, the window blurred
function onLostPointerCapture(event: PointerEvent) {
  if (interaction.state !== "active") return
  // One element holds a pointer at a time: capturing for one separator releases it from another, which is no interruption
  const elements = interaction.hitRegions.flatMap(({ separator }) => (separator ? [separator.element] : []))
  if (!elements.includes(event.target as HTMLElement) || elements.some((element) => element.hasPointerCapture?.(event.pointerId))) return
  endDrag(event.currentTarget as Document, event)
}

const onPointerCancel = (event: PointerEvent) => void endDrag(event.currentTarget as Document, event)
// A context menu opened by the pointer ends the drag; its pointerId is unreliable, so only the document is compared
const onContextMenu = (event: MouseEvent) => void endDrag(event.currentTarget as Document)
const onWindowBlur = (event: FocusEvent) => void (event.target === event.currentTarget && endDrag((event.currentTarget as Window).document))
const onWindowPageHide = (event: PageTransitionEvent) => void endDrag((event.currentTarget as Window).document)

// Double-click on a separator puts the panel next to it back to its default size
function onDoubleClick(event: MouseEvent) {
  if (event.defaultPrevented) return
  for (const { axis, separator, items } of findMatchingHitRegions(event, event.currentTarget as Document)) {
    const item = separator && items.find((current) => current.defaultSize !== undefined)
    if (item) {
      resizeItem(axis, item, item.defaultSize!)
      event.preventDefault()
    }
  }
}

function resizeItem(axis: Axis, item: Item, size: Size) {
  const state = axes.get(axis)
  if (!state) return
  const axisSize = availableSize(axis)
  const nextSize = format((toPixels(axisSize, item.element, size) / axisSize) * 100)
  const prevSize = state.layout[item.id]!
  if (nextSize === prevSize) return
  const index = axis.items.indexOf(item)
  const last = index === axis.items.length - 1
  const layout = validateLayout(
    adjustLayoutByDelta(last ? prevSize - nextSize : nextSize - prevSize, state.layout, state.constraints, last ? [index - 1, index] : [index, index + 1], state.layout),
    state.constraints
  )
  if (!layoutsEqual(layout, state.layout)) updateAxis(axis, { ...state, layout, requestedLayout: layout })
}

function resizeBySeparator(axis: Axis, element: HTMLElement, delta: number) {
  const state = axes.get(axis)
  const items = state && !state.deferred && state.separatorToItems.get(axis.separators.find((separator) => separator.element === element)!)
  if (!state || !items) return
  const layout = validateLayout(
    adjustLayoutByDelta(delta, state.layout, state.constraints, items.map((item) => axis.items.indexOf(item)), state.layout),
    state.constraints
  )
  if (!layoutsEqual(layout, state.layout)) updateAxis(axis, { ...state, layout, requestedLayout: layout })
}

// The arrows resize along the group's axis only; Home and End move the separator all the way
const KEY_DELTAS: Record<string, [Orientation | undefined, number]> = {
  ArrowDown: ["vertical", 5],
  ArrowLeft: ["horizontal", -5],
  ArrowRight: ["horizontal", 5],
  ArrowUp: ["vertical", -5],
  End: [undefined, 100],
  Home: [undefined, -100],
}

function onKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  const element = event.currentTarget as HTMLElement
  const axis = [...axes.keys()].find((current) => current.separators.some((separator) => separator.element === element))
  if (!axis) return
  const key = KEY_DELTAS[event.key]
  if (key) {
    event.preventDefault()
    if (!key[0] || key[0] === axis.orientation) resizeBySeparator(axis, element, key[1])
  } else if (event.key === "F6") {
    // Cycles through the separators of the group
    event.preventDefault()
    const elements = axis.separators.map((separator) => separator.element)
    const index = elements.indexOf(element)
    elements[event.shiftKey ? (index > 0 ? index - 1 : elements.length - 1) : index + 1 < elements.length ? index + 1 : 0]!.focus({ preventScroll: true })
  }
}

// ---- mounting a group ----

const documentListeners: [string, (event: any) => void, boolean][] = [
  ["contextmenu", onContextMenu, true],
  ["dblclick", onDoubleClick, true],
  ["lostpointercapture", onLostPointerCapture, true],
  ["pointercancel", onPointerCancel, true],
  ["pointerdown", onPointerDown, true],
  ["pointerleave", onPointerLeave, false],
  ["pointermove", onPointerMove, false],
  ["pointerout", onPointerOut, false],
  ["pointerup", onPointerUp, true],
]
const windowListeners: [string, (event: any) => void][] = [
  ["blur", onWindowBlur],
  ["pagehide", onWindowPageHide],
]
// One set of document listeners serves every group of a document
const groupsPerDocument = new Map<Document, number>()

function mountAxis(axis: Axis) {
  let isMounted = true
  const ownerDocument = axis.element.ownerDocument
  const ownerWindow = ownerDocument.defaultView!

  // The group box resizing re-validates the layout: pixel and em constraints are other percentages now. A hidden group gets its first layout here.
  const resizeObserver = new ownerWindow.ResizeObserver((entries) => {
    const state = axes.get(axis)
    if (!isMounted || !state || !entries.some((entry) => entry.target === axis.element) || availableSize(axis) === 0) return
    const constraints = calculateConstraints(axis)
    // Validate from the requested layout, so constraints only clamp for as long as they apply (a window shrunk and grown again)
    const requestedLayout = state.deferred ? normalizeLayout(axis.items.map(({ id }) => id), defaultLayoutOf(axis, constraints)) : state.requestedLayout
    const layout = validateLayout(requestedLayout, constraints)
    const unchanged =
      layoutsEqual(state.layout, layout) &&
      state.constraints.length === constraints.length &&
      state.constraints.every((c, i) => c.itemId === constraints[i]!.itemId && c.defaultSize === constraints[i]!.defaultSize && c.minSize === constraints[i]!.minSize && c.maxSize === constraints[i]!.maxSize)
    if (state.deferred || !unchanged) updateAxis(axis, { deferred: false, constraints, layout, requestedLayout, separatorToItems: state.separatorToItems })
  })
  resizeObserver.observe(axis.element)

  for (const [kind, list] of [["Panel", axis.items], ["Separator", axis.separators]] as const) {
    const ids = new Set<string>()
    for (const { id } of list) {
      if (ids.has(id)) throw Error(`${kind} ids must be unique; id "${id}" was used more than once`)
      ids.add(id)
    }
  }

  const constraints = calculateConstraints(axis)
  const defaultLayout = defaultLayoutOf(axis, constraints)
  const separatorToItems = new Map<Sep, [Item, Item]>()
  for (const { separator, items } of calculateHitRegions(axis)) if (separator) separatorToItems.set(separator, items)
  updateAxis(axis, {
    deferred: availableSize(axis) === 0,
    constraints,
    layout: validateLayout(defaultLayout, constraints),
    requestedLayout: normalizeLayout(axis.items.map(({ id }) => id), defaultLayout),
    separatorToItems,
  })

  for (const { element } of axis.separators) element.addEventListener("keydown", onKeyDown)
  groupsPerDocument.set(ownerDocument, (groupsPerDocument.get(ownerDocument) ?? 0) + 1)
  if (groupsPerDocument.get(ownerDocument) === 1) {
    for (const [type, listener, capture] of documentListeners) ownerDocument.addEventListener(type, listener, capture)
    for (const [type, listener] of windowListeners) ownerWindow.addEventListener(type, listener)
  }

  return () => {
    isMounted = false
    axes.delete(axis)
    removeAxisFromInteraction(axis)
    for (const { element } of axis.separators) element.removeEventListener("keydown", onKeyDown)
    resizeObserver.disconnect()
    const remaining = (groupsPerDocument.get(ownerDocument) ?? 1) - 1
    groupsPerDocument.set(ownerDocument, remaining)
    if (remaining === 0) {
      for (const [type, listener, capture] of documentListeners) ownerDocument.removeEventListener(type, listener, capture)
      for (const [type, listener] of windowListeners) ownerWindow.removeEventListener(type, listener)
    }
  }
}

// ---- components ----

type GroupContextValue = {
  id: string
  orientation: Orientation
  registerPanel(panel: Item): () => void
  registerSeparator(separator: Sep): () => void
}
const GroupContext = createContext<GroupContextValue | null>(null)

function useGroupContext() {
  const context = useContext(GroupContext)
  if (!context) throw Error("Panel and Separator must be rendered inside a Group")
  return context
}

// Preact has no useSyncExternalStore: re-render when the value read from the store changes
function useAxisValue<T>(axisId: string, read: () => T): T {
  const [, setTick] = useState(0)
  const value = read()
  const latest = useRef({ value, read })
  latest.current = { value, read }
  useLayoutEffect(
    () => subscribeToAxis(axisId, () => latest.current.read() !== latest.current.value && setTick((tick) => tick + 1)),
    [axisId]
  )
  return value
}

export function Group({ children, className, elementRef, id: idProp, onLayoutChange, orientation = "horizontal", style, ...rest }: GroupProps) {
  const generatedId = useId()
  const id = `${idProp ?? generatedId}`
  const ref = useRef<HTMLDivElement | null>(null)
  const mergedRef = useComposedRefs<HTMLDivElement>(ref, elementRef)
  const [registrations, setRegistrations] = useState({})
  const registered = useRef<{ panels: Item[]; separators: Sep[]; layouts: Axis["layouts"] }>({ panels: [], separators: [], layouts: {} })
  const onLayoutChangeRef = useRef(onLayoutChange)
  onLayoutChangeRef.current = onLayoutChange
  const notified = useRef<Layout>({})

  // Panels and separators register from their own effects; the group mounts again for each change, once the batch of them is in
  const context = useMemo<GroupContextValue>(() => {
    const track =
      <T extends { element: HTMLElement }>(read: () => T[], write: (list: T[]) => void) =>
      (entry: T) => {
        write(sortByOffset(orientation, [...read(), entry]))
        setRegistrations({})
        return () => {
          write(read().filter((current) => current !== entry))
          setRegistrations({})
        }
      }
    const values = registered.current
    return {
      id,
      orientation,
      registerPanel: track(() => values.panels, (list) => void (values.panels = list)),
      registerSeparator: track(() => values.separators, (list) => void (values.separators = list)),
    }
  }, [id, orientation])

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const values = registered.current
    values.panels = sortByOffset(orientation, values.panels)
    values.separators = sortByOffset(orientation, values.separators)
    const axis: Axis = { element, id, orientation, items: values.panels, separators: values.separators, layouts: values.layouts }
    const unmount = mountAxis(axis)

    // Not called for a layout equal to the last one, nor before the group has a size
    const notify = ({ deferred, constraints, layout }: AxisState) => {
      if (deferred || constraints.length === 0 || layoutsEqual(notified.current, layout)) return
      notified.current = layout
      onLayoutChangeRef.current?.(layout)
    }
    notify(axes.get(axis)!)
    const unsubscribe = subscribeToAxis(id, ({ next }) => {
      if (next.deferred || next.constraints.length === 0) return
      values.layouts[axis.items.map((item) => item.id).join(",")] = next.requestedLayout
      notify(next)
    })
    return () => {
      unmount()
      unsubscribe()
    }
  }, [id, orientation, registrations])

  return (
    <GroupContext.Provider value={context}>
      <div
        {...rest}
        className={className}
        // React writes a bare boolean attribute on a data- attribute as "true"
        data-group="true"
        data-testid={id}
        id={id}
        ref={mergedRef}
        style={{
          height: "100%",
          width: "100%",
          overflow: "hidden",
          ...style,
          display: "flex",
          flexDirection: orientation === "horizontal" ? "row" : "column",
          flexWrap: "nowrap",
          // The library handles touches along the axis; scrolling content across it stays with the browser
          touchAction: orientation === "horizontal" ? "pan-y" : "pan-x",
        }}
      >
        {children}
      </div>
    </GroupContext.Provider>
  )
}

export function Panel({ children, className, defaultSize, elementRef, id: idProp, maxSize = "100%", minSize = "0%", style, ...rest }: PanelProps) {
  const generatedId = useId()
  const id = `${idProp ?? generatedId}`
  const ref = useRef<HTMLDivElement | null>(null)
  const mergedRef = useComposedRefs<HTMLDivElement>(ref, elementRef)
  const { id: groupId, orientation, registerPanel } = useGroupContext()

  useLayoutEffect(() => {
    const element = ref.current
    if (element) return registerPanel({ element, id, defaultSize, minSize, maxSize })
  }, [defaultSize, id, maxSize, minSize, registerPanel])

  // Read from the store, not from state: the render that follows a layout change must not lag behind it
  const grow = useAxisValue(groupId, () => {
    const state = axisStateById(groupId)
    return state && `${state.layout[id] ?? 1}`
  })
  // Before the group has mounted (the server render, the first client render): the default size, as a basis
  const [number, unit] = defaultSize === undefined ? [0, ""] : parseSize(defaultSize)
  const sizing: CSSProperties =
    grow !== undefined
      ? { flexGrow: grow, flexShrink: "1", flexBasis: "0" }
      : defaultSize !== undefined
        ? { flexBasis: `${number}${unit}` }
        : { flexGrow: "1", flexShrink: "1", flexBasis: "0" }

  return (
    <div
      {...rest}
      data-panel="true"
      data-testid={id}
      id={id}
      ref={mergedRef}
      style={{
        minHeight: "0",
        maxHeight: "100%",
        height: "auto",
        minWidth: "0",
        maxWidth: "100%",
        width: "auto",
        border: "none",
        borderWidth: "0",
        padding: "0",
        margin: "0",
        display: "flex",
        overflow: "visible",
        ...sizing,
      }}
    >
      <div
        className={className}
        style={{
          maxHeight: "100%",
          maxWidth: "100%",
          flexGrow: "1",
          overflow: "auto",
          ...style,
          touchAction: orientation === "horizontal" ? "pan-y" : "pan-x",
        }}
      >
        {children}
      </div>
    </div>
  )
}

export function Separator({ children, className, elementRef, id: idProp, style, ...rest }: SeparatorProps) {
  const generatedId = useId()
  const id = `${idProp ?? generatedId}`
  const ref = useRef<HTMLDivElement | null>(null)
  const mergedRef = useComposedRefs<HTMLDivElement>(ref, elementRef)
  const { id: groupId, orientation: axisOrientation, registerSeparator } = useGroupContext()
  const [aria, setAria] = useState<Partial<ReturnType<typeof calculateAriaValues>>>({})
  const [dragState, setDragState] = useState<"inactive" | "hover" | "active">("inactive")
  const [isFocused, setIsFocused] = useState(false)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const separator: Sep = { element, id }
    const unregister = registerSeparator(separator)
    const unsubscribeFromInteraction = subscribeToInteraction((next) =>
      setDragState(next.state !== "inactive" && next.hitRegions.some((region) => region.separator === separator) ? next.state : "inactive")
    )
    // The panel before the separator is the one it controls
    const unsubscribeFromAxis = subscribeToAxis(groupId, ({ next: { constraints, layout, separatorToItems } }) => {
      const primary = separatorToItems.get(separator)?.[0]
      if (primary) setAria(calculateAriaValues(layout, constraints, primary.id, constraints.findIndex((c) => c.itemId === primary.id)))
    })
    return () => {
      unsubscribeFromInteraction()
      unsubscribeFromAxis()
      unregister()
    }
  }, [groupId, id, registerSeparator])

  return (
    <div
      {...rest}
      aria-controls={aria.controls}
      aria-orientation={axisOrientation === "horizontal" ? "vertical" : "horizontal"}
      aria-valuemax={aria.max}
      aria-valuemin={aria.min}
      aria-valuenow={aria.now}
      className={className}
      data-separator={dragState === "active" ? "active" : isFocused ? "focus" : dragState}
      data-testid={id}
      id={id}
      onBlur={() => setIsFocused(false)}
      onFocus={() => setIsFocused(true)}
      ref={mergedRef}
      role="separator"
      style={{
        flexBasis: "auto",
        ...style,
        flexGrow: "0",
        flexShrink: "0",
        touchAction: "none",
      }}
      tabIndex={0}
    >
      {children}
    </div>
  )
}
