// The surface of react, react-dom, react-is, react-redux and use-sync-external-store that recharts reaches, on preact and preact/hooks only.
// The converter points those imports here and throws on a name this file does not export.
import { setAutoFreeze } from "immer"
import {
  Component,
  Fragment,
  cloneElement as preactCloneElement,
  createContext,
  createElement as preactCreateElement,
  isValidElement,
  options,
  render,
  toChildArray,
  type AriaAttributes as PreactAriaAttributes,
  type ComponentChildren,
  type ComponentType,
  type Context as PreactContext,
  type CSSProperties as PreactCSSProperties,
  type FunctionComponent,
  type HTMLAttributes as PreactHTMLAttributes,
  type JSX,
  type SVGAttributes as PreactSVGAttributes,
  type TargetedEvent,
  type VNode,
} from "preact"
import { useCallback, useContext, useId, useImperativeHandle, useLayoutEffect, useMemo, useReducer, useRef, useState } from "preact/hooks"
import { fixProps } from "./fix-props"

export { Component, createContext, isValidElement, useCallback, useContext, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState }

export const createElement: typeof preactCreateElement = (type: any, props: any, ...children: any[]) =>
  (preactCreateElement as any)(type, typeof type === "string" && props ? fixProps(props) : props, ...children)
export const cloneElement: typeof preactCloneElement = (vnode: any, props: any, ...children: any[]) =>
  (preactCloneElement as any)(vnode, typeof vnode.type === "string" && props ? fixProps(props) : props, ...children)

// recharts measures in an effect and expects the layout it triggers to be in place before paint, which React guarantees for effects of
// synchronous updates; Preact runs useEffect after the next frame and the chart would flash its unmeasured first layout.
export const useEffect = useLayoutEffect

// ---- types ----
// React's types as recharts reads them. Preact's attribute types also admit signals and string styles and want an EventTarget as the
// element type, and recharts reads plain values from the props it types with these.
type Unsignal<V> = V extends { peek(): infer P; subscribe(...args: any[]): unknown } ? P : V
type Plain<A> = { [K in keyof A]: Unsignal<A[K]> }
type Target<T> = T extends EventTarget ? T : EventTarget
type Attributes<A> = Omit<Plain<A>, "style"> & { style?: PreactCSSProperties }
type Callback<T> = { bivarianceHack(instance: T | null): void | (() => void) }["bivarianceHack"]

export type ReactNode = ComponentChildren
export type ReactElement<P = any> = VNode<P>
export type { ComponentType, FunctionComponent, JSX }
export type FC<P = {}> = FunctionComponent<P>
export type Key = string | number | bigint | null | undefined
export type Context<T> = PreactContext<T>
export type RefObject<T> = { current: T | null }
export type MutableRefObject<T> = { current: T }
export type Ref<T> = Callback<T> | RefObject<T> | null
export type AriaAttributes = PreactAriaAttributes
export type CSSProperties = PreactCSSProperties
export type HTMLAttributes<T> = Attributes<PreactHTMLAttributes<Target<T>>>
export type SVGAttributes<T> = Attributes<PreactSVGAttributes<Target<T>>> & { name?: string }
export type SVGProps<T> = SVGAttributes<T> & { ref?: Ref<T> }
export type PropsWithoutRef<P> = Omit<P, "ref">
export type ComponentProps<T> = T extends ComponentType<infer P> ? P : T extends keyof JSX.IntrinsicElements ? JSX.IntrinsicElements[T] : never
export type DetailedReactHTMLElement<P, T> = VNode<P> & { ref?: Ref<T> }
export type Touch = globalThis.Touch
type Event_<T, E extends Event> = TargetedEvent<Target<T>, E>
export type SyntheticEvent<T = Element, E extends Event = Event> = Event_<T, E>
export type AnimationEvent<T = Element, E extends Event = globalThis.AnimationEvent> = Event_<T, E>
export type ClipboardEvent<T = Element, E extends Event = globalThis.ClipboardEvent> = Event_<T, E>
export type CompositionEvent<T = Element, E extends Event = globalThis.CompositionEvent> = Event_<T, E>
export type DragEvent<T = Element, E extends Event = globalThis.DragEvent> = Event_<T, E>
export type FocusEvent<T = Element, E extends Event = globalThis.FocusEvent> = Event_<T, E>
export type FormEvent<T = Element, E extends Event = Event> = Event_<T, E>
export type KeyboardEvent<T = Element, E extends Event = globalThis.KeyboardEvent> = Event_<T, E>
export type MouseEvent<T = Element, E extends Event = globalThis.MouseEvent> = Event_<T, E>
export type PointerEvent<T = Element, E extends Event = globalThis.PointerEvent> = Event_<T, E>
export type TouchEvent<T = Element, E extends Event = globalThis.TouchEvent> = Event_<T, E>
export type TransitionEvent<T = Element, E extends Event = globalThis.TransitionEvent> = Event_<T, E>
export type UIEvent<T = Element, E extends Event = globalThis.UIEvent> = Event_<T, E>
export type WheelEvent<T = Element, E extends Event = globalThis.WheelEvent> = Event_<T, E>

// ---- forwardRef: `ref` is a prop ----
// Preact 10 takes `ref` off a function component's props; Preact 11 keeps it there. Put it back (same hook as the registry shims).
const previousVnode = options.vnode
options.vnode = (vnode) => {
  const { type } = vnode as { type: unknown }
  if (typeof type === "function" && vnode.ref && !(type as any).prototype?.render) {
    ;(vnode.props as any).ref = vnode.ref
    ;(vnode as any).ref = null
  }
  previousVnode?.(vnode)
}
export function forwardRef<T, P = {}>(renderFn: (props: P, ref: Ref<T>) => ComponentChildren): FunctionComponent<P & { ref?: Ref<T> }> {
  return (props: any) => {
    const { ref, ...rest } = props
    return renderFn(rest, ref)
  }
}

// ---- memo and PureComponent ----
// `__source` is the dev-only location the jsx transform adds; it differs on every call site and says nothing about the props.
function differs(a: any, b: any) {
  for (const key in a) if (key !== "__source" && !(key in b)) return true
  for (const key in b) if (key !== "__source" && a[key] !== b[key]) return true
  return false
}
export function memo<P>(Inner: FunctionComponent<P>, areEqual?: (a: P, b: P) => boolean): FunctionComponent<P> {
  class Memo extends Component<any> {
    override shouldComponentUpdate(next: any) {
      return areEqual ? !areEqual(this.props, next) : differs(this.props, next)
    }
    override render() {
      return createElement(Inner as any, this.props)
    }
  }
  ;(Memo as any).displayName = "Memo(" + ((Inner as any).displayName || Inner.name) + ")"
  return Memo as any
}
export abstract class PureComponent<P = {}, S = {}> extends Component<P, S> {
  shouldComponentUpdate(next: any, nextState: any) {
    return differs(this.props, next) || differs(this.state, nextState)
  }
}

// ---- Children and react-is ----
export const Children = {
  forEach(children: ComponentChildren, fn: (child: any, index: number) => void) {
    toChildArray(children).forEach(fn)
  },
  count(children: ComponentChildren) {
    return toChildArray(children).length
  },
  only(children: ComponentChildren) {
    const all = toChildArray(children)
    if (all.length !== 1) throw new Error("Children.only expects one child")
    return all[0]
  },
}
export const isFragment = (node: unknown) => isValidElement(node) && node.type === Fragment

// ---- createPortal: a second render root whose DOM host forwards into the container (Preact core has no portals) ----
class ContextProvider extends Component<{ context: object; children?: ComponentChildren }> {
  override getChildContext() {
    return this.props.context
  }
  override render() {
    return this.props.children
  }
}
class Portal extends Component<{ container: Element; children?: ComponentChildren }> {
  host: any
  override componentDidMount() {
    this.draw()
  }
  override componentDidUpdate() {
    this.draw()
  }
  override componentWillUnmount() {
    render(null, this.host)
  }
  draw() {
    const container = this.props.container
    this.host ||= {
      nodeType: 1,
      namespaceURI: container.namespaceURI,
      childNodes: [],
      contains: () => true,
      insertBefore: (node: Node, before: Node | null) => container.insertBefore(node, before),
      removeChild: (node: Node) => container.removeChild(node),
    }
    render(createElement(ContextProvider as any, { context: (this as any).context }, this.props.children), this.host)
  }
  override render() {
    return null
  }
}
// shortcut: a portal's content appears after the first commit (componentDidMount) and `container` is read once, so it is empty in
// server output and follows no later container change; upgrade when recharts portals into a container that changes.
export function createPortal(children: ComponentChildren, container: Element): VNode {
  return createElement(Portal as any, { container }, children) as VNode
}

// ---- react-redux: Provider and shallowEqual ----
export function shallowEqual(a: any, b: any): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  return keysA.length === keysB.length && keysA.every((key) => Object.prototype.hasOwnProperty.call(b, key) && Object.is(a[key], b[key]))
}
export type Subscription = { addNestedSub: (listener: () => void) => () => void }
export type CheckFrequency = "never" | "once" | "always"

// immer freezes everything recharts keeps in its store, vnodes included (Legend content, labels), and Preact writes to a vnode while it
// renders it ("__" is read-only). Auto-freeze is off only while a recharts action is reduced. The immer import must be the copy
// @reduxjs/toolkit uses, which is why the package's immer range admits 11.
// shortcut: setAutoFreeze(true) afterwards assumes the default, so an app that disabled auto-freeze itself gets it back on; upgrade
// when immer exposes the current setting.
function withoutFreeze<S extends { dispatch: (action: any) => any }>(store: S): S {
  if ((store as any).__noFreeze) return store
  const dispatch = store.dispatch
  store.dispatch = (action: unknown) => {
    setAutoFreeze(false)
    try {
      return dispatch(action)
    } finally {
      setAutoFreeze(true)
    }
  }
  ;(store as any).__noFreeze = true
  return store
}
export function Provider({ context, store, children }: { context: PreactContext<any>; store: any; children?: ComponentChildren }) {
  const value = useMemo(() => ({ store: withoutFreeze(store), subscription: { addNestedSub: (listener: () => void) => store.subscribe(listener) } }), [store])
  return createElement(context.Provider as any, { value }, children)
}

// ---- use-sync-external-store/shim/with-selector ----
export function useSyncExternalStoreWithSelector<Snapshot, Selection>(
  subscribe: (onChange: () => void) => () => void,
  getSnapshot: () => Snapshot,
  _getServerSnapshot: undefined | (() => Snapshot),
  selector: (snapshot: Snapshot) => Selection,
  isEqual?: (a: Selection, b: Selection) => boolean
): Selection {
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const memoized = useRef<{ snapshot: Snapshot; selection: Selection; selector: typeof selector } | null>(null)
  const snapshot = getSnapshot()
  let current = memoized.current
  if (!current || current.snapshot !== snapshot || current.selector !== selector) {
    const next = selector(snapshot)
    const selection = current && isEqual && isEqual(current.selection, next) ? current.selection : next
    memoized.current = current = { snapshot, selection, selector }
  }
  const latest = useRef({ getSnapshot, selector, isEqual })
  latest.current = { getSnapshot, selector, isEqual }
  useLayoutEffect(() => {
    const check = () => {
      const held = memoized.current!
      const { getSnapshot, selector, isEqual } = latest.current
      const snapshot = getSnapshot()
      if (snapshot === held.snapshot && selector === held.selector) return
      const next = selector(snapshot)
      if (!(isEqual ? isEqual(held.selection, next) : Object.is(held.selection, next))) rerender(0 as any)
    }
    const unsubscribe = subscribe(check)
    check()
    return unsubscribe
  }, [subscribe])
  return current.selection
}
