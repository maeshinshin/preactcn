import { Component, createContext as preactCreateContext, render, type ComponentChildren } from "preact"
import { act } from "preact/test-utils"
import { produce } from "immer"

const isFrozen = Object.isFrozen
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  Children,
  PureComponent,
  Provider,
  cloneElement,
  createContext,
  createElement,
  createPortal,
  forwardRef,
  isFragment,
  memo,
  shallowEqual,
  useContext,
  useEffect,
  useSyncExternalStoreWithSelector,
} from "../runtime/adapter"

const root = document.createElement("div")
document.body.append(root)
afterEach(() => act(() => render(null, root)))

describe("useEffect", () => {
  it("runs before paint, like a layout effect", () => {
    const seen: string[] = []
    const Probe = () => {
      useEffect(() => void seen.push("effect"), [])
      return null
    }
    render(<Probe />, root)
    expect(seen).toEqual(["effect"])
  })
})

describe("createElement and cloneElement", () => {
  it("write React-style props on host elements", () => {
    render(createElement("svg", null, createElement("text", { textAnchor: "end", tabIndex: 0 })), root)
    expect(root.querySelector("text")!.getAttribute("text-anchor")).toBe("end")
    expect(root.querySelector("text")!.getAttribute("tabindex")).toBe("0")
    render(cloneElement(createElement("svg", null, createElement("g", null)) as any, { strokeWidth: 3 }), root)
    expect(root.querySelector("svg")!.getAttribute("stroke-width")).toBe("3")
  })

  it("leave component props alone", () => {
    const Probe = vi.fn((_: Record<string, unknown>) => null)
    render(createElement(Probe as any, { tabIndex: 0 }), root)
    expect(Probe.mock.calls[0]![0]).toMatchObject({ tabIndex: 0 })
  })
})

describe("forwardRef", () => {
  const Field = forwardRef<HTMLInputElement, { id?: string }>((props, ref) => <input ref={ref} {...props} />)

  it("hands an object ref to the render function", () => {
    const ref: { current: HTMLInputElement | null } = { current: null }
    render(<Field ref={ref} id="a" />, root)
    expect(ref.current).toBe(root.querySelector("input"))
  })

  it("hands a callback ref to the render function", () => {
    const ref = vi.fn()
    render(<Field ref={ref} />, root)
    expect(ref).toHaveBeenCalledWith(root.querySelector("input"))
  })

  // Preact 11 hands class components their ref as a prop and never sets it to the instance
  it.skipIf(process.env.PREACT === "11")("leaves the ref of a class component on the instance", () => {
    class Box extends Component {
      render() {
        return <i />
      }
    }
    const ref: { current: Box | null } = { current: null }
    render(<Box ref={ref} />, root)
    expect(ref.current).toBeInstanceOf(Box)
  })
})

describe("memo", () => {
  const renders = vi.fn()
  const Count = memo(({ n, other }: { n: number; other?: number }) => (renders(n, other), <b>{n}</b>))

  it("skips a render when the props are shallow equal and renders when one changes", () => {
    renders.mockClear()
    render(<Count n={1} />, root)
    render(<Count n={1} />, root)
    expect(renders).toHaveBeenCalledTimes(1)
    render(<Count n={2} />, root)
    expect(renders).toHaveBeenCalledTimes(2)
    expect(root.textContent).toBe("2")
  })

  it("renders when a prop disappears", () => {
    renders.mockClear()
    render(<Count n={1} other={1} />, root)
    render(<Count n={1} />, root)
    expect(renders).toHaveBeenCalledTimes(2)
  })

  it("asks the comparator when there is one", () => {
    const Always = memo(({ n }: { n: number }) => <b>{n}</b>, () => true)
    render(<Always n={1} />, root)
    render(<Always n={2} />, root)
    expect(root.textContent).toBe("1")
  })

  it("names itself after the wrapped component", () => {
    function Inner() {
      return null
    }
    expect((memo(Inner) as any).displayName).toBe("Memo(Inner)")
  })
})

describe("PureComponent", () => {
  const renders = vi.fn()
  class Pure extends PureComponent<{ n: number }, { m: number }> {
    state = { m: 0 }
    render() {
      renders()
      return <button onClick={() => this.setState({ m: 0 })}>{this.props.n}</button>
    }
  }

  it("renders again only for other props or state", () => {
    renders.mockClear()
    render(<Pure n={1} />, root)
    render(<Pure n={1} />, root)
    expect(renders).toHaveBeenCalledTimes(1)
    act(() => root.querySelector("button")!.click())
    expect(renders).toHaveBeenCalledTimes(1)
    render(<Pure n={2} />, root)
    expect(renders).toHaveBeenCalledTimes(2)
  })
})

describe("Children and isFragment", () => {
  it("count and walk the flattened children, and only demands one", () => {
    const seen: unknown[] = []
    const children = [<i key="a" />, [<b key="b" />, null], <></>] as ComponentChildren
    Children.forEach(children, (child) => seen.push(child.type))
    expect(seen).toEqual(["i", "b", expect.anything()])
    expect(Children.count(children)).toBe(3)
    expect(Children.only(<i />)).toMatchObject({ type: "i" })
    expect(() => Children.only(children)).toThrow("one child")
  })

  it("recognises a fragment element", () => {
    expect(isFragment(<></>)).toBe(true)
    expect(isFragment(<i />)).toBe(false)
    expect(isFragment("text")).toBe(false)
  })
})

describe("createPortal", () => {
  const Theme = createContext("none")
  const Reader = () => <u>{useContext(Theme)}</u>

  it("renders into the container with the context of its place, updates, and removes its content", () => {
    const outside = document.createElement("section")
    document.body.append(outside)
    const App = ({ label }: { label: string }) => (
      <Theme.Provider value="dark">
        <p>{label}</p>
        {createPortal(<Reader />, outside)}
      </Theme.Provider>
    )
    act(() => render(<App label="a" />, root))
    expect(outside.innerHTML).toBe("<u>dark</u>")
    expect(root.innerHTML).toBe("<p>a</p>")
    act(() => render(<App label="b" />, root))
    expect(root.innerHTML).toBe("<p>b</p>")
    act(() => render(null, root))
    expect(outside.innerHTML).toBe("")
    outside.remove()
  })
})

describe("shallowEqual", () => {
  it("compares own keys with Object.is", () => {
    expect(shallowEqual({ a: 1, b: NaN }, { a: 1, b: NaN })).toBe(true)
    expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(shallowEqual({ a: {} }, { a: {} })).toBe(false)
    expect(shallowEqual(null, {})).toBe(false)
    expect(shallowEqual(1, 1)).toBe(true)
  })
})

// A store whose reducer runs through immer, as recharts' does through createSlice
function immerStore<S extends object>(initial: S, reduce: (draft: S, action: any) => void) {
  let state = initial
  const listeners = new Set<() => void>()
  return {
    getState: () => state,
    dispatch(action: unknown) {
      state = produce(state, (draft) => reduce(draft as S, action))
      listeners.forEach((l) => l())
      return action
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    listeners,
  }
}

describe("Provider", () => {
  const Context = preactCreateContext<any>(null)

  it("exposes the store and a subscription through the given context", () => {
    const store = immerStore({ n: 0 }, (draft) => void draft.n++)
    let seen: any
    const Probe = () => ((seen = useContext(Context)), null)
    render(<Provider context={Context} store={store}><Probe /></Provider>, root)
    expect(seen.store).toBe(store)
    const listener = vi.fn()
    const off = seen.subscription.addNestedSub(listener)
    store.dispatch({})
    off()
    store.dispatch({})
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it("keeps immer from freezing what a dispatched action stores, and from then on freezes again", () => {
    const store = immerStore<{ node: object | null }>({ node: null }, (draft, action) => void (draft.node = action.node))
    render(<Provider context={Context} store={store}>{null}</Provider>, root)
    store.dispatch({ node: { type: "div" } })
    expect(isFrozen(store.getState().node)).toBe(false)
    expect(isFrozen(produce({ node: { a: 1 } }, () => {}).node)).toBe(true)
  })

  it("turns freezing back on when the reducer throws, and wraps a store once", () => {
    const store = immerStore({ n: 0 }, () => {
      throw new Error("boom")
    })
    const view = <Provider context={Context} store={store}>{null}</Provider>
    render(view, root)
    render(<Provider context={Context} store={store}>{null}</Provider>, root)
    expect(() => store.dispatch({})).toThrow("boom")
    expect(isFrozen(produce({ node: { a: 1 } }, () => {}).node)).toBe(true)
  })
})

describe("useSyncExternalStoreWithSelector", () => {
  function counter() {
    let value = { count: 0, other: 0 }
    const listeners = new Set<() => void>()
    return {
      listeners,
      get: () => value,
      set: (next: Partial<typeof value>) => act(() => ((value = { ...value, ...next }), listeners.forEach((l) => l()))),
      subscribe: (l: () => void) => (listeners.add(l), () => void listeners.delete(l)),
    }
  }

  it("reads the selection, rerenders on a change of it only, and unsubscribes on unmount", () => {
    const store = counter()
    const renders = vi.fn()
    const Reader = () => {
      const count = useSyncExternalStoreWithSelector(store.subscribe, store.get, undefined, (s) => s.count)
      renders()
      return <b>{count}</b>
    }
    render(<Reader />, root)
    expect(root.textContent).toBe("0")
    store.set({ other: 1 })
    expect(renders).toHaveBeenCalledTimes(1)
    store.set({ count: 5 })
    expect(root.textContent).toBe("5")
    expect(renders).toHaveBeenCalledTimes(2)
    act(() => render(null, root))
    expect(store.listeners.size).toBe(0)
  })

  it("keeps the previous selection when the equality function says nothing changed", () => {
    const store = counter()
    const seen: object[] = []
    const Reader = () => {
      const picked = useSyncExternalStoreWithSelector(
        store.subscribe,
        store.get,
        undefined,
        (s) => ({ even: s.count % 2 === 0 }),
        (a, b) => a.even === b.even
      )
      seen.push(picked)
      return <b>{String(picked.even)}</b>
    }
    render(<Reader />, root)
    store.set({ count: 2 })
    store.set({ count: 3 })
    expect(root.textContent).toBe("false")
    expect(seen.at(-1)).not.toBe(seen[0])
    expect(new Set(seen).size).toBe(2)
  })

  it("picks up a change that happened between render and subscription", () => {
    const store = counter()
    const Reader = () => {
      const count = useSyncExternalStoreWithSelector(
        (listener) => {
          store.set({ count: 9 })
          return store.subscribe(listener)
        },
        store.get,
        undefined,
        (s) => s.count
      )
      return <b>{count}</b>
    }
    act(() => render(<Reader />, root))
    expect(root.textContent).toBe("9")
  })
})
