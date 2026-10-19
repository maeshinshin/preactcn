// Derived from shadcn/ui (@shadcn/react) 0.3.1, Copyright (c) 2023 shadcn, MIT License (https://opensource.org/license/mit)
import type { ComponentChildren, ComponentProps } from "preact"
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks"
import { useComposedRefs } from "../radix/internal/compose-refs"
import { createStrictContext } from "../radix/internal/create-context"
import { forwardRef } from "../radix/internal/forward-ref"
import { joinClass } from "../radix/internal/merge-props"
import { mergeProps, useRender, type UseRenderComponentProps } from "./internal/shadcn-react-use-render"

// @shadcn/react 0.3.1 message-scroller on Preact hooks: same scroll behavior, data attributes, roles and render prop.
// The scroll controller is one closure per provider instead of upstream's hooks over a bag of refs; its functions are upstream's.
// shortcut: no dev-only warnings or StrictMode handling (upstream has no warnings here either); `suppressHydrationWarning` does not exist on Preact.

const DEFAULT_SCROLL_EDGE_THRESHOLD = 8
const DEFAULT_SCROLL_PREVIOUS_ITEM_PEEK = 64
const DEFAULT_SCROLL_MARGIN = 0
// Two fractional scrollTop values this close are equal: absorbs zoom and HiDPI rounding
const SCROLL_POSITION_EPSILON = 0.5
// How long (ms) data-autoscrolling stays set after a programmatic smooth scroll
const AUTOSCROLLING_CLEAR_DELAY = 180
const USER_SCROLL_KEYS = new Set(["ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp", " "])

type Mode =
  | "following-bottom" // autoScroll on, pinned to the latest message
  | "free-scrolling" // reader scrolled away; position left alone (prepends still preserved)
  | "anchored-to-message" // holding a turn at the reading line while it streams
  | "settling-jump" // a programmatic jump is animating; intent detection suppressed until it settles

type DefaultScrollPosition = "start" | "end" | "last-anchor"
type ScrollAlign = "start" | "center" | "end" | "nearest"
type ScrollOptions = { align?: ScrollAlign; behavior?: ScrollBehavior; scrollMargin?: number }
type Scrollable = { start: boolean; end: boolean }
type VisibilityState = { currentAnchorId: string | null; visibleMessageIds: string[] }
type ProviderProps = {
  children?: ComponentChildren
  autoScroll?: boolean
  defaultScrollPosition?: DefaultScrollPosition
  scrollEdgeThreshold?: number
  scrollPreviousItemPeek?: number
  scrollMargin?: number
}
type ViewportProps = ComponentProps<"div"> & { preserveScrollOnPrepend?: boolean }
type ContentProps = ComponentProps<"div"> & { spacerClassName?: string }
type ItemProps = ComponentProps<"div"> & { messageId?: string; scrollAnchor?: boolean }
type ButtonState = { active: boolean; direction: "start" | "end" }
type ButtonProps = UseRenderComponentProps<"button", ButtonState> & {
  behavior?: ScrollBehavior
  direction?: "start" | "end"
}

const EMPTY_SCROLLABLE: Scrollable = { start: false, end: false }
const EMPTY_VISIBLE_IDS: string[] = []
const EMPTY_VISIBILITY: VisibilityState = { currentAnchorId: null, visibleMessageIds: EMPTY_VISIBLE_IDS }

// ---- geometry ----

function getMessageScrollerItems(content: HTMLElement, spacer: HTMLElement | null) {
  return Array.from(content.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child !== spacer)
}

function readCssPixel(value: string | undefined) {
  const number = Number.parseFloat(value ?? "")
  return Number.isFinite(number) ? number : 0
}

function getBlockPadding(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  return {
    end: readCssPixel(style.paddingBlockEnd || style.paddingBottom),
    start: readCssPixel(style.paddingBlockStart || style.paddingTop),
  }
}

function getFlexGap(element: HTMLElement | null) {
  if (!element) return 0
  const style = window.getComputedStyle(element)
  return readCssPixel(style.rowGap === "normal" ? style.gap : style.rowGap)
}

function getElementTop(element: HTMLElement, viewport: HTMLElement) {
  return element.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop
}

function getElementViewportTop(element: HTMLElement, viewport: HTMLElement) {
  return element.getBoundingClientRect().top - viewport.getBoundingClientRect().top
}

function getContentBottom(content: HTMLElement, spacer: HTMLElement | null, viewport: HTMLElement) {
  const padding = getBlockPadding(content)
  const viewportRect = viewport.getBoundingClientRect()
  let contentBottom = padding.start + padding.end
  for (const item of getMessageScrollerItems(content, spacer)) {
    contentBottom = Math.max(contentBottom, item.getBoundingClientRect().bottom - viewportRect.top + viewport.scrollTop + padding.end)
  }
  return contentBottom
}

function getScrollable(content: HTMLElement | null, spacer: HTMLElement | null, viewport: HTMLElement | null, threshold: number): Scrollable {
  if (!viewport || !content) return EMPTY_SCROLLABLE
  const contentBottom = getContentBottom(content, spacer, viewport)
  return {
    start: viewport.scrollTop > threshold,
    end: contentBottom - viewport.scrollTop - viewport.clientHeight > threshold,
  }
}

function getVisibilityState(
  content: HTMLElement | null,
  spacer: HTMLElement | null,
  viewport: HTMLElement | null,
  scrollMargin: number,
  scrollPreviousItemPeek: number,
  visibleMessageIds: Set<string>
): VisibilityState {
  if (!content || !viewport) return EMPTY_VISIBILITY
  const viewportRect = viewport.getBoundingClientRect()
  // Anchored turns land at this reading line with the previous turn peeking above it. A row only peeking in that band has not been
  // read down to yet, so it is neither visible nor current.
  const lineTop = viewportRect.top + scrollMargin + scrollPreviousItemPeek
  const trackByLayout = typeof IntersectionObserver === "undefined"
  const visible: string[] = []
  let currentAnchorId: string | null = null

  for (const item of getMessageScrollerItems(content, spacer)) {
    const messageId = item.dataset.messageId
    if (!messageId) continue
    const isAnchor = item.dataset.scrollAnchor === "true"
    const rect = isAnchor || trackByLayout ? item.getBoundingClientRect() : null
    const isVisible = trackByLayout && rect ? rect.bottom > lineTop && rect.top < viewportRect.bottom : visibleMessageIds.has(messageId)
    if (isVisible) visible.push(messageId)
    // The last anchor to have reached the reading line stays current even after its header scrolls above the viewport
    if (isAnchor && rect && rect.top <= lineTop + SCROLL_POSITION_EPSILON) currentAnchorId = messageId
  }

  if (visible.length === 0 && currentAnchorId === null) return EMPTY_VISIBILITY
  return { currentAnchorId, visibleMessageIds: visible }
}

const isAnchorItem = (item: HTMLElement | undefined) => item?.dataset.scrollAnchor === "true"

function getNewScrollAnchor(items: HTMLElement[], previousItemCount: number) {
  for (let index = previousItemCount; index < items.length; index++) if (isAnchorItem(items[index])) return items[index]!
  return null
}

function hasMultipleNewScrollAnchors(items: HTMLElement[], previousItemCount: number) {
  return items.slice(previousItemCount).filter(isAnchorItem).length > 1
}

function getFirstVisibleMessageItem(content: HTMLElement, spacer: HTMLElement | null, viewport: HTMLElement) {
  const viewportRect = viewport.getBoundingClientRect()
  for (const item of getMessageScrollerItems(content, spacer)) {
    if (!item.dataset.messageId) continue
    const rect = item.getBoundingClientRect()
    if (rect.bottom > viewportRect.top && rect.top < viewportRect.bottom) return item
  }
  return null
}

function getElementScrollTop(align: ScrollAlign, element: HTMLElement, scrollMargin: number, spacer: HTMLElement | null, viewport: HTMLElement) {
  const elementTop = getElementTop(element, viewport)
  const elementHeight = element.getBoundingClientRect().height
  const contentElement = spacer?.parentElement
  const padding = contentElement ? getBlockPadding(contentElement) : { end: 0, start: 0 }

  if (align === "center") {
    const insetHeight = Math.max(0, viewport.clientHeight - padding.start - padding.end)
    return elementTop - padding.start - (insetHeight - elementHeight) / 2 - scrollMargin
  }
  if (align === "end") return elementTop - viewport.clientHeight + elementHeight + padding.end + scrollMargin
  if (align === "nearest") {
    const elementBottom = elementTop + elementHeight
    const viewportTop = viewport.scrollTop + padding.start
    const viewportBottom = viewport.scrollTop + viewport.clientHeight - padding.end
    if (elementTop >= viewportTop && elementBottom <= viewportBottom) return viewport.scrollTop
    if (elementTop < viewportTop) return elementTop - padding.start - scrollMargin
    return elementBottom - viewport.clientHeight + padding.end + scrollMargin
  }
  return elementTop - padding.start - scrollMargin
}

// ---- stores ----

// A stable snapshot (the same object while isEqual holds, so subscribers only re-render on real transitions); the visibility store also
// reports its first and last subscriber so tracking stays lazy
function createStore<T>(initial: T, isEqual: (a: T, b: T) => boolean) {
  let snapshot = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    hasListeners: () => listeners.size > 0,
    setSnapshot(next: T) {
      if (isEqual(snapshot, next)) return
      snapshot = next
      listeners.forEach((listener) => listener())
    },
    subscribe(listener: () => void, onFirst?: () => void, onLast?: () => void) {
      const wasEmpty = listeners.size === 0
      listeners.add(listener)
      if (wasEmpty) onFirst?.()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) onLast?.()
      }
    },
  }
}

const sameScrollable = (a: Scrollable, b: Scrollable) => a.start === b.start && a.end === b.end
const sameVisibility = (a: VisibilityState, b: VisibilityState) =>
  a.currentAnchorId === b.currentAnchorId &&
  a.visibleMessageIds.length === b.visibleMessageIds.length &&
  a.visibleMessageIds.every((id, index) => id === b.visibleMessageIds[index])

// Preact has no useSyncExternalStore: re-render when the value read from the store changes
function useExternalStore<T>(subscribe: (listener: () => void) => () => void, getSnapshot: () => T): T {
  const [, setTick] = useState(0)
  const value = getSnapshot()
  const latest = useRef({ value, getSnapshot })
  latest.current = { value, getSnapshot }
  useLayoutEffect(() => {
    const check = () => Object.is(latest.current.getSnapshot(), latest.current.value) || setTick((tick) => tick + 1)
    const unsubscribe = subscribe(check)
    // the store may have changed between this render and the subscription
    check()
    return unsubscribe
  }, [subscribe])
  return value
}

// ---- controller ----

type Options = Required<Omit<ProviderProps, "children">>

function createController(initial: Options) {
  let options = initial
  let mode: Mode = options.autoScroll ? "following-bottom" : "free-scrolling"
  let root: HTMLElement | null = null
  let viewport: HTMLElement | null = null
  let content: HTMLElement | null = null
  let spacer: HTMLElement | null = null
  let autoscrolling = false
  let autoscrollingTimeout: number | null = null
  // The turn held at the reading line so a reply streaming in below it can re-pin it instead of letting scrollTop clamp it loose
  let streamingTurn: HTMLElement | null = null
  let defaultScrollPositionApplied = false
  let itemCount = 0
  let firstItem: HTMLElement | null = null
  // The scrollTop of the previous state commit, so follow-release can tell a reader scrolling up from content growing past the live edge
  let lastScrollTop = 0
  const messageElements = new Map<string, HTMLElement>()
  let pendingScrollFrame: number | null = null
  let pendingScrollToMessage: { messageId: string; options?: ScrollOptions } | null = null
  // The row to hold steady on the next prepend: the first visible row, or a jump target seeded by scrollToElement
  let prependRestore: { element: HTMLElement; viewportTop: number } | null = null
  let preserveScrollOnPrepend = true
  let spacerGap = 0
  let spacerHeight = 0
  let stateFrame: number | null = null
  let visibilityFrame: number | null = null
  let visibilityObserver: IntersectionObserver | null = null
  const visibleMessageIds = new Set<string>()
  const handledScrollAnchors = new WeakSet<HTMLElement>()

  const pendingDefaultScrollStore = createStore(options.defaultScrollPosition === "end" || options.defaultScrollPosition === "last-anchor", Object.is)
  const stateStore = createStore(EMPTY_SCROLLABLE, sameScrollable)
  const visibilityStore = createStore(EMPTY_VISIBILITY, sameVisibility)

  const markDefaultScrollPositionApplied = () => {
    defaultScrollPositionApplied = true
    pendingDefaultScrollStore.setSnapshot(false)
  }

  function writeStateAttributes(state: Scrollable) {
    const scrollable = [state.start && "start", state.end && "end"].filter(Boolean).join(" ")
    for (const element of [root, viewport]) {
      if (!element) continue
      if (scrollable) element.setAttribute("data-scrollable", scrollable)
      else element.removeAttribute("data-scrollable")
      element.toggleAttribute("data-autoscrolling", autoscrolling)
    }
  }

  // Owns the one follow-bottom transition: arm at the bottom, release on any scroll away (including a scrollbar drag), suppressed during
  // a programmatic scroll so the auto-scroll animation cannot release itself. Arming skips the anchored hold: the tail spacer makes a
  // freshly anchored turn read as "at the end", and re-arming there would let the first streamed chunk yank the reader off the anchor.
  // The hold hands back to following in handleResize, once the reply consumes the tail spacer.
  function reconcileFollowMode(scrollable: Scrollable) {
    const scrollTop = viewport?.scrollTop ?? 0
    // Content growing past the live edge also reads as "not at the end", but only a scrollbar drag moves scrollTop up. Growth must not
    // release follow-output: the resize handler runs on a frame, so a state commit can see the grown content before follow catches up.
    const scrolledUp = scrollTop < lastScrollTop - SCROLL_POSITION_EPSILON
    lastScrollTop = scrollTop
    if (options.autoScroll && !scrollable.end && mode !== "settling-jump" && mode !== "anchored-to-message") {
      mode = "following-bottom"
    } else if (mode === "following-bottom" && scrollable.end && scrolledUp && !autoscrolling) {
      mode = "free-scrolling"
    }
  }

  function commitScrollState() {
    const next = getScrollable(content, spacer, viewport, options.scrollEdgeThreshold)
    reconcileFollowMode(next)
    // While follow-output is engaged the scroller is already closing any gap a streamed chunk just opened; publishing it would strobe
    // the scroll button once per chunk. Reconcile ran on the raw geometry first, so a commit that releases follow still publishes the gap.
    const published = mode === "following-bottom" ? { ...next, end: false } : next
    writeStateAttributes(published)
    stateStore.setSnapshot(published)
  }

  function scheduleStateCommit() {
    if (stateFrame !== null) return
    stateFrame = window.requestAnimationFrame(() => {
      stateFrame = null
      commitScrollState()
    })
  }

  function scheduleVisibilitySync() {
    if (!visibilityStore.hasListeners() || visibilityFrame !== null) return
    visibilityFrame = window.requestAnimationFrame(() => {
      visibilityFrame = null
      // A frame can outlive the last unsubscribe; recomputing would overwrite the EMPTY snapshot teardown just wrote
      if (!visibilityStore.hasListeners()) return
      visibilityStore.setSnapshot(
        getVisibilityState(content, spacer, viewport, options.scrollMargin, options.scrollPreviousItemPeek, visibleMessageIds)
      )
    })
  }

  function setAutoScrolling(next: boolean) {
    if (autoscrollingTimeout !== null) {
      window.clearTimeout(autoscrollingTimeout)
      autoscrollingTimeout = null
    }
    if (autoscrolling !== next) {
      autoscrolling = next
      commitScrollState()
    }
    if (next) {
      autoscrollingTimeout = window.setTimeout(() => {
        autoscrollingTimeout = null
        autoscrolling = false
        commitScrollState()
      }, AUTOSCROLLING_CLEAR_DELAY)
    }
  }

  function setTailSpacerHeight(height: number) {
    if (!spacer) return
    const next = Math.max(0, Math.ceil(height))
    if (spacerHeight === next) return
    spacerHeight = next
    spacer.hidden = next === 0
    spacer.style.height = `${next}px`
    spacer.style.marginTop = next > 0 ? `${-spacerGap}px` : ""
  }

  function scrollToPosition(scrollTop: number, { behavior = "auto", autoscrolling: auto = false }: { behavior?: ScrollBehavior; autoscrolling?: boolean } = {}) {
    if (!viewport) return
    const next = Math.max(0, scrollTop)
    if (Math.abs(viewport.scrollTop - next) <= SCROLL_POSITION_EPSILON) {
      viewport.scrollTop = next
      commitScrollState()
      return
    }
    if (auto) setAutoScrolling(true)
    viewport.scrollTo({ top: next, behavior })
    scheduleStateCommit()
  }

  function scrollToStart({ behavior = "auto" }: ScrollOptions = {}) {
    if (!viewport) return false
    setTailSpacerHeight(0)
    streamingTurn = null
    mode = "free-scrolling"
    scrollToPosition(0, { behavior })
    scheduleVisibilitySync()
    return true
  }

  function scrollToEnd({ behavior = "auto" }: ScrollOptions = {}) {
    if (!viewport) return false
    setTailSpacerHeight(0)
    streamingTurn = null
    mode = options.autoScroll ? "following-bottom" : "free-scrolling"
    scrollToPosition(Math.max(0, viewport.scrollHeight - viewport.clientHeight), { autoscrolling: true, behavior })
    scheduleVisibilitySync()
    return true
  }

  function scrollToElement(
    element: HTMLElement,
    { align = "start", behavior = "auto", scrollMargin = options.scrollMargin }: ScrollOptions = {},
    { keepPreviousPeek = false } = {}
  ) {
    if (!content || !viewport || !content.contains(element)) return false
    const scrollTop = getElementScrollTop(align, element, keepPreviousPeek ? scrollMargin + options.scrollPreviousItemPeek : scrollMargin, spacer, viewport)
    setTailSpacerHeight(scrollTop + viewport.clientHeight - getContentBottom(content, spacer, viewport))
    // Seed the prepend anchor with the jump target so a prepend that lands before this scroll settles still preserves the jumped-to row
    prependRestore = { element, viewportTop: getElementViewportTop(element, viewport) }
    mode = keepPreviousPeek ? "anchored-to-message" : "settling-jump"
    streamingTurn = keepPreviousPeek ? element : null
    scrollToPosition(scrollTop, { behavior })
    scheduleVisibilitySync()
    return true
  }

  function reanchorToAnchoredMessage() {
    if (!streamingTurn || !streamingTurn.isConnected || mode !== "anchored-to-message") return false
    // Re-run the placement so the tail spacer is recomputed for the new content height and the turn is held at the reading line
    return scrollToElement(streamingTurn, { align: "start" }, { keepPreviousPeek: true })
  }

  // The target row may not be mounted yet (an async-loaded transcript): the request is queued and flushed on registerMessage for that
  // id or on the next content change. An explicit jump also marks the mount default as applied so defaultScrollPosition does not override it.
  function scrollToMessage(messageId: string, scrollOptions?: ScrollOptions) {
    const element = messageElements.get(messageId)
    if (!element) {
      if (itemCount === 0) {
        pendingScrollToMessage = { messageId, options: scrollOptions }
        markDefaultScrollPositionApplied()
        return true
      }
      return false
    }
    markDefaultScrollPositionApplied()
    if (scrollToElement(element, scrollOptions)) {
      pendingScrollToMessage = null
      return true
    }
    pendingScrollToMessage = { messageId, options: scrollOptions }
    return true
  }

  function flushPendingScrollToMessage() {
    const pending = pendingScrollToMessage
    const element = pending && messageElements.get(pending.messageId)
    if (!pending || !element || !scrollToElement(element, pending.options)) return false
    pendingScrollToMessage = null
    markDefaultScrollPositionApplied()
    return true
  }

  function restorePrependedAnchor() {
    if (!prependRestore || !viewport || !prependRestore.element.isConnected) return false
    // Compare relative to the viewport, not to the content: native scroll anchoring leaves that position unchanged, so this is a no-op
    // where the browser already handled the prepend and only corrects where it did not (Safari), without trusting a capability flag
    const delta = getElementViewportTop(prependRestore.element, viewport) - prependRestore.viewportTop
    if (Math.abs(delta) <= SCROLL_POSITION_EPSILON) return false
    viewport.scrollTop += delta
    prependRestore.viewportTop = getElementViewportTop(prependRestore.element, viewport)
    scheduleStateCommit()
    scheduleVisibilitySync()
    return true
  }

  function capturePrependAnchor() {
    const anchor = content && viewport ? getFirstVisibleMessageItem(content, spacer, viewport) : null
    prependRestore = anchor && viewport ? { element: anchor, viewportTop: getElementViewportTop(anchor, viewport) } : null
  }

  function schedulePendingScrollToMessageFlush() {
    if (pendingScrollFrame !== null) return
    pendingScrollFrame = window.requestAnimationFrame(() => {
      pendingScrollFrame = null
      if (flushPendingScrollToMessage()) capturePrependAnchor()
    })
  }

  function applyDefaultScrollPosition() {
    const position = options.defaultScrollPosition
    if (!position || defaultScrollPositionApplied || itemCount === 0) return false
    let handled: boolean
    if (position === "last-anchor") {
      const anchor = content && viewport ? getMessageScrollerItems(content, spacer).reverse().find(isAnchorItem) : undefined
      if (!content || !viewport || !anchor) {
        handled = scrollToEnd({ behavior: "auto" })
      } else {
        // A short last turn already fits below the anchor, so opening at the end shows it whole without a blank gap beneath
        const lastTurnFits = getContentBottom(content, spacer, viewport) - getElementTop(anchor, viewport) <= viewport.clientHeight
        handled = lastTurnFits ? scrollToEnd({ behavior: "auto" }) : scrollToElement(anchor, { align: "start" }, { keepPreviousPeek: true })
      }
    } else {
      handled = position === "end" ? scrollToEnd({ behavior: "auto" }) : scrollToStart({ behavior: "auto" })
    }
    if (handled) markDefaultScrollPositionApplied()
    return handled
  }

  function handleContentChange() {
    if (!content) return
    const items = getMessageScrollerItems(content, spacer)
    const previousItemCount = itemCount
    const previousFirstItem = firstItem
    itemCount = items.length
    firstItem = items[0] ?? null

    // Reconcile the scroll position with the new content; every path re-captures the prepend anchor afterwards.
    // Branch order is load-bearing: first content, prepended, appended, updated.
    const reconcileScrollPosition = () => {
      if (flushPendingScrollToMessage()) return

      if (previousItemCount === 0) {
        if (applyDefaultScrollPosition()) return
        if (items.length > 0 && options.autoScroll && scrollToEnd({ behavior: "auto" })) return
        commitScrollState()
        scheduleVisibilitySync()
        return
      }

      const previousFirstItemIndex = previousFirstItem ? items.indexOf(previousFirstItem) : -1
      if (preserveScrollOnPrepend && previousFirstItemIndex > 0) {
        // Prepended rows are not new appends: restore the prior position (a no-op where native scroll anchoring already did)
        restorePrependedAnchor()
        return
      }

      if (items.length > previousItemCount) {
        const anchor = getNewScrollAnchor(items, previousItemCount)
        if (anchor) {
          // While following the live end, several anchored turns arriving at once keep following the end instead of anchoring the first
          if (options.autoScroll && mode === "following-bottom" && hasMultipleNewScrollAnchors(items, previousItemCount)) {
            scrollToEnd({ behavior: "auto" })
            return
          }
          scrollToElement(anchor, { align: "start" }, { keepPreviousPeek: true })
          handledScrollAnchors.add(anchor)
          return
        }
      }

      if (items.length === previousItemCount) {
        const anchor = items.find((item) => isAnchorItem(item) && !handledScrollAnchors.has(item))
        if (anchor) {
          scrollToElement(anchor, { align: "start" }, { keepPreviousPeek: true })
          handledScrollAnchors.add(anchor)
          return
        }
      }

      // Appends with no new anchor and content-only updates: keep following the end if we still are, otherwise just recommit state
      if (mode === "following-bottom" && options.autoScroll) {
        scrollToEnd({ behavior: "auto" })
      } else {
        commitScrollState()
        scheduleVisibilitySync()
      }
    }

    reconcileScrollPosition()
    capturePrependAnchor()
  }

  function handleResize() {
    if (mode === "following-bottom" && options.autoScroll) {
      scrollToEnd({ behavior: "auto" })
      return
    }
    // Hold the anchored turn in place as content below it resizes (a reply streaming in, or a transient marker collapsing); otherwise
    // the shrinking content lets the browser clamp scrollTop and the turn drops
    const previousSpacerHeight = spacerHeight
    if (reanchorToAnchoredMessage()) {
      // The streaming reply consumes the tail spacer as it grows. Once the last of it is gone the reply has filled the viewport and the
      // reader is at the live edge, so autoScroll hands off from the anchor hold to following. Requiring the >0 to 0 transition keeps a
      // turn taller than the viewport (placed with no spacer) held instead of yanked to the end.
      if (options.autoScroll && previousSpacerHeight > 0 && spacerHeight === 0) scrollToEnd({ behavior: "auto" })
      return
    }
    scheduleStateCommit()
    scheduleVisibilitySync()
  }

  function observeVisibility() {
    if (!viewport || !visibilityStore.hasListeners()) return
    if (typeof IntersectionObserver === "undefined") {
      scheduleVisibilitySync()
      return
    }
    visibilityObserver ??= new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const messageId = (entry.target as HTMLElement).dataset.messageId
          if (!messageId) continue
          if (entry.isIntersecting) visibleMessageIds.add(messageId)
          else visibleMessageIds.delete(messageId)
        }
        scheduleVisibilitySync()
      },
      {
        root: viewport,
        // Shrink the root's top edge to the reading line so a previous turn peeking in the margin + peek band is not reported as visible,
        // keeping visibleMessageIds consistent with currentAnchorId. Read at observe time; a prop change rebuilds it on resubscribe.
        rootMargin: `${-(options.scrollMargin + options.scrollPreviousItemPeek)}px 0px 0px 0px`,
        threshold: [0, 0.01, 0.5, 1],
      }
    )
    messageElements.forEach((element) => visibilityObserver?.observe(element))
    scheduleVisibilitySync()
  }

  function unobserveVisibility() {
    if (visibilityFrame !== null) {
      window.cancelAnimationFrame(visibilityFrame)
      visibilityFrame = null
    }
    visibilityObserver?.disconnect()
    visibilityObserver = null
    visibleMessageIds.clear()
    visibilityStore.setSnapshot(EMPTY_VISIBILITY)
  }

  function registerMessage(messageId: string, element: HTMLElement | null, removedElement?: HTMLElement | null) {
    if (element) {
      messageElements.set(messageId, element)
      visibilityObserver?.observe(element)
      scheduleVisibilitySync()
      if (pendingScrollToMessage?.messageId === messageId) schedulePendingScrollToMessageFlush()
      return
    }
    if (removedElement && messageElements.get(messageId) === removedElement) {
      messageElements.delete(messageId)
      visibleMessageIds.delete(messageId)
      visibilityObserver?.unobserve(removedElement)
      scheduleVisibilitySync()
    }
  }

  const mirrorStateAttributes = () => writeStateAttributes(stateStore.getSnapshot())

  return {
    pendingDefaultScrollStore,
    stateStore,
    visibilityStore,
    registerMessage,
    observeVisibility,
    unobserveVisibility,
    handleContentChange,
    handleResize,
    // Scroll commands, stable for the life of the provider
    api: { scrollToEnd, scrollToMessage, scrollToStart },
    set preserveScrollOnPrepend(value: boolean) {
      preserveScrollOnPrepend = value
    },
    get viewport() {
      return viewport
    },
    setRootElement(element: HTMLElement | null) {
      root = element
      if (element) mirrorStateAttributes()
    },
    setViewportElement(element: HTMLElement | null) {
      viewport = element
      if (element) mirrorStateAttributes()
    },
    setContentElement(element: HTMLElement | null) {
      content = element
    },
    setSpacerElement(element: HTMLElement | null) {
      spacer = element
      spacerGap = getFlexGap(element?.parentElement ?? null)
    },
    // A deliberate gesture releases auto-follow, turn anchoring and an in-flight programmatic jump, so re-pinning never fights the reader
    userScrollIntent() {
      if (mode === "following-bottom" || mode === "anchored-to-message" || mode === "settling-jump") {
        streamingTurn = null
        mode = "free-scrolling"
      }
    },
    syncAfterScroll() {
      commitScrollState()
      scheduleVisibilitySync()
      capturePrependAnchor()
    },
    // Called by the provider on every render
    update(next: Options) {
      if (next.defaultScrollPosition !== options.defaultScrollPosition) {
        // The pending-scroll hold is mount-only: a live change re-applies the opening position in layout without hiding the viewport again
        defaultScrollPositionApplied = false
      }
      options = next
    },
    applyDefaultScroll() {
      if (applyDefaultScrollPosition()) return
      if (itemCount === 0) pendingDefaultScrollStore.setSnapshot(false)
    },
    followOrCommit() {
      if (options.autoScroll && mode === "following-bottom" && itemCount > 0) {
        scrollToEnd({ behavior: "auto" })
        return
      }
      commitScrollState()
    },
    destroy() {
      for (const frame of [stateFrame, visibilityFrame, pendingScrollFrame]) if (frame !== null) window.cancelAnimationFrame(frame)
      stateFrame = visibilityFrame = pendingScrollFrame = null
      if (autoscrollingTimeout !== null) window.clearTimeout(autoscrollingTimeout)
      autoscrollingTimeout = null
      visibilityObserver?.disconnect()
      visibilityObserver = null
    },
  }
}

type Controller = ReturnType<typeof createController>

// ---- components ----

const [ControllerProvider, useController] = createStrictContext<Controller>("MessageScroller.Provider")

function useMessageScroller() {
  return useController("useMessageScroller").api
}

function useMessageScrollerScrollable() {
  const { stateStore } = useController("useMessageScrollerScrollable")
  return useExternalStore(stateStore.subscribe, stateStore.getSnapshot)
}

function useMessageScrollerVisibility() {
  const { observeVisibility, unobserveVisibility, visibilityStore } = useController("useMessageScrollerVisibility")
  const subscribe = useCallback(
    (listener: () => void) => visibilityStore.subscribe(listener, observeVisibility, unobserveVisibility),
    [observeVisibility, unobserveVisibility, visibilityStore]
  )
  return useExternalStore(subscribe, visibilityStore.getSnapshot)
}

function usePendingDefaultScroll(controller: Controller) {
  return useExternalStore(controller.pendingDefaultScrollStore.subscribe, controller.pendingDefaultScrollStore.getSnapshot)
}

function Provider({
  autoScroll = false,
  children,
  defaultScrollPosition = "end",
  scrollEdgeThreshold = DEFAULT_SCROLL_EDGE_THRESHOLD,
  scrollPreviousItemPeek = DEFAULT_SCROLL_PREVIOUS_ITEM_PEEK,
  scrollMargin = DEFAULT_SCROLL_MARGIN,
}: ProviderProps) {
  const options = { autoScroll, defaultScrollPosition, scrollEdgeThreshold, scrollMargin, scrollPreviousItemPeek }
  const ref = useRef<Controller | null>(null)
  const controller = (ref.current ??= createController(options))
  controller.update(options)

  useLayoutEffect(() => controller.applyDefaultScroll(), [controller, defaultScrollPosition])
  useLayoutEffect(() => controller.followOrCommit(), [controller, autoScroll])
  useEffect(() => () => controller.destroy(), [controller])

  return <ControllerProvider value={controller}>{children}</ControllerProvider>
}

// `class` and `className` are one: a wrapper that adds its own className must not lose the caller's `class`
const Root = forwardRef<ComponentProps<"div">>(({ children, class: classProp, className, ...props }, ref) => {
  const controller = useController("MessageScroller.Root")
  const pendingDefaultScroll = usePendingDefaultScroll(controller)
  const setRef = useComposedRefs<HTMLDivElement>(controller.setRootElement, ref)

  return (
    <div ref={setRef} {...props} className={joinClass(classProp, className)} {...(pendingDefaultScroll ? { "data-pending-scroll": "" } : null)}>
      {children}
    </div>
  )
})

const Viewport = forwardRef<ViewportProps>(
  ({ "aria-label": ariaLabel, children, class: classProp, className, onKeyDown, onScroll, onTouchMove, onWheel, preserveScrollOnPrepend = true, role, tabIndex, ...props }, ref) => {
    const controller = useController("MessageScroller.Viewport")
    const pendingDefaultScroll = usePendingDefaultScroll(controller)
    const setRef = useComposedRefs<HTMLDivElement>(controller.setViewportElement, ref)
    const latest = useRef({ onTouchMove, onWheel })
    latest.current = { onTouchMove, onWheel }
    controller.preserveScrollOnPrepend = preserveScrollOnPrepend

    const handleKeyDown: ComponentProps<"div">["onKeyDown"] = (event) => {
      if (USER_SCROLL_KEYS.has(event.key)) controller.userScrollIntent()
      onKeyDown?.(event)
    }
    const handleScroll: ComponentProps<"div">["onScroll"] = (event) => {
      controller.syncAfterScroll()
      onScroll?.(event)
    }

    // Passive like React's root listeners: a gesture handler that cannot block scrolling keeps touch and wheel scrolling off the main thread
    useLayoutEffect(() => {
      const viewport = controller.viewport
      if (!viewport) return
      const wheel = (event: Event) => {
        controller.userScrollIntent()
        ;(latest.current.onWheel as ((event: Event) => void) | undefined)?.(event)
      }
      const touchMove = (event: Event) => {
        controller.userScrollIntent()
        ;(latest.current.onTouchMove as ((event: Event) => void) | undefined)?.(event)
      }
      viewport.addEventListener("wheel", wheel, { passive: true })
      viewport.addEventListener("touchmove", touchMove, { passive: true })
      return () => {
        viewport.removeEventListener("wheel", wheel)
        viewport.removeEventListener("touchmove", touchMove)
      }
    }, [controller])

    useEffect(() => {
      const viewport = controller.viewport
      if (!viewport || typeof ResizeObserver === "undefined") return
      // Coalesced into a frame: handleResize mutates the spacer inside the observed content, and resizing an observed element during
      // delivery fires "ResizeObserver loop completed with undelivered notifications"
      let frame = 0
      const observer = new ResizeObserver(() => {
        window.cancelAnimationFrame(frame)
        frame = window.requestAnimationFrame(controller.handleResize)
      })
      observer.observe(viewport)
      return () => {
        window.cancelAnimationFrame(frame)
        observer.disconnect()
      }
    }, [controller])

    return (
      <div
        ref={setRef}
        role={role ?? "region"}
        aria-label={ariaLabel ?? "Messages"}
        tabIndex={tabIndex ?? 0}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        {...props}
        className={joinClass(classProp, className)}
        {...(pendingDefaultScroll ? { "data-pending-scroll": "" } : null)}
      >
        {children}
      </div>
    )
  }
)

const Content = forwardRef<ContentProps>(({ "aria-relevant": ariaRelevant, children, class: classProp, className, role, spacerClassName, ...props }, ref) => {
  const controller = useController("MessageScroller.Content")
  const contentRef = useRef<HTMLDivElement | null>(null)
  const setRef = useComposedRefs<HTMLDivElement>(contentRef, controller.setContentElement, ref)

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) return
    controller.handleContentChange()
    if (typeof MutationObserver === "undefined") return
    const observer = new MutationObserver(controller.handleContentChange)
    observer.observe(content, { childList: true })
    return () => observer.disconnect()
  }, [controller])

  useEffect(() => {
    const content = contentRef.current
    if (!content || typeof ResizeObserver === "undefined") return
    let frame = 0
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(controller.handleResize)
    })
    observer.observe(content)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [controller])

  return (
    <div ref={setRef} role={role ?? "log"} aria-relevant={ariaRelevant ?? "additions"} {...props} className={joinClass(classProp, className)}>
      {children}
      <div ref={controller.setSpacerElement} aria-hidden="true" data-message-scroller-spacer="" hidden className={spacerClassName} />
    </div>
  )
})

const Item = forwardRef<ItemProps>(({ class: classProp, className, messageId, scrollAnchor = false, ...props }, ref) => {
  const { registerMessage } = useController("MessageScroller.Item")
  const elementRef = useRef<HTMLDivElement | null>(null)
  const setRef = useCallback(
    (element: HTMLDivElement | null) => {
      const previous = elementRef.current
      elementRef.current = element
      if (messageId) registerMessage(messageId, element, previous)
      if (typeof ref === "function") ref(element)
      else if (ref) ref.current = element
    },
    [messageId, ref, registerMessage]
  )

  return <div ref={setRef} data-message-id={messageId} data-scroll-anchor={scrollAnchor ? "true" : "false"} {...props} className={joinClass(classProp, className)} />
})

const Button = forwardRef<ButtonProps>(
  ({ behavior = "smooth", children, direction = "end", onClick, render, tabIndex, type = "button", ...props }, ref) => {
    const { api, stateStore } = useController("MessageScroller.Button")
    const subscribe = useCallback((listener: () => void) => stateStore.subscribe(listener), [stateStore])
    const isActive = useExternalStore(subscribe, () => stateStore.getSnapshot()[direction])
    const onClickRef = useRef(onClick)
    onClickRef.current = onClick

    function handleClick(event: Event & { currentTarget: HTMLButtonElement }) {
      if (!isActive) return
      ;(onClickRef.current as ((event: Event) => void) | undefined)?.(event)
      if (!event.defaultPrevented) {
        event.currentTarget.blur()
        if (direction === "start") api.scrollToStart({ behavior })
        else api.scrollToEnd({ behavior })
      }
    }

    return useRender({
      defaultTagName: "button",
      props: mergeProps(
        { type, inert: !isActive, tabIndex: isActive ? tabIndex : -1, children: children ?? <span>Scroll to {direction}</span>, onClick: handleClick, ref },
        props
      ),
      render,
      state: { active: isActive, direction } as ButtonState,
      stateAttributesMapping: { active: (value) => ({ "data-active": value ? "true" : "false" }) },
    })
  }
)

const MessageScroller = { Provider, Root, Viewport, Content, Item, Button }

export { MessageScroller, useMessageScroller, useMessageScrollerScrollable, useMessageScrollerVisibility }
export type { DefaultScrollPosition, ScrollAlign, ScrollOptions, Scrollable, VisibilityState }
