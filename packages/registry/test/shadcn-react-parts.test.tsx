import { createRef, type ComponentProps } from "preact"
import { act, render } from "@testing-library/preact"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { MessageScroller } from "../src/shims/shadcn-react-message-scroller"
import { Questionnaire } from "../src/shims/shadcn-react-questionnaire"

// What the Preact shims add around the ported upstream suites: refs as props, the render prop, class and className, event types

beforeEach(() => {
  // happy-dom has no layout: a viewport of 100 over two 250 high messages
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(500)
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100)
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const message = (this as HTMLElement).dataset.messageId !== undefined
    const top = message ? Array.from(this.parentElement!.children).indexOf(this) * 250 - (this.closest<HTMLElement>("[data-testid=viewport]")?.scrollTop ?? 0) : 0
    const height = message ? 250 : 0
    return { top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top, toJSON() {} } as DOMRect
  })
  vi.spyOn(HTMLElement.prototype, "scrollTo").mockImplementation(function (this: HTMLElement, options?: ScrollToOptions | number) {
    if (typeof options === "object") this.scrollTop = options.top ?? 0
  })
})
afterEach(() => vi.restoreAllMocks())

const flush = () => act(async () => void (await new Promise((resolve) => setTimeout(resolve, 50))))

function Scroller(props: { button?: ComponentProps<typeof MessageScroller.Button>; viewport?: ComponentProps<typeof MessageScroller.Viewport> }) {
  return (
    <MessageScroller.Provider defaultScrollPosition="start">
      <MessageScroller.Root data-testid="root" class="from-class" className="from-className">
        <MessageScroller.Viewport data-testid="viewport" {...props.viewport}>
          <MessageScroller.Content data-testid="content">
            <MessageScroller.Item messageId="a">a</MessageScroller.Item>
            <MessageScroller.Item messageId="b">b</MessageScroller.Item>
          </MessageScroller.Content>
        </MessageScroller.Viewport>
        <MessageScroller.Button data-testid="button" {...props.button} />
      </MessageScroller.Root>
    </MessageScroller.Provider>
  )
}

describe("MessageScroller on Preact", () => {
  test("every part takes a ref as a prop, and the root still works with one", async () => {
    const refs = { root: createRef<HTMLDivElement>(), viewport: createRef<HTMLDivElement>(), content: createRef<HTMLDivElement>(), item: createRef<HTMLDivElement>(), button: createRef<HTMLButtonElement>() }
    const { container } = render(
      <MessageScroller.Provider defaultScrollPosition="start">
        <MessageScroller.Root ref={refs.root}>
          <MessageScroller.Viewport ref={refs.viewport}>
            <MessageScroller.Content ref={refs.content}>
              <MessageScroller.Item ref={refs.item} messageId="a">
                a
              </MessageScroller.Item>
            </MessageScroller.Content>
          </MessageScroller.Viewport>
          <MessageScroller.Button ref={refs.button} />
        </MessageScroller.Root>
      </MessageScroller.Provider>
    )
    await flush()
    expect(refs.root.current).toBe(container.firstElementChild)
    expect(refs.viewport.current?.getAttribute("role")).toBe("region")
    expect(refs.content.current?.getAttribute("role")).toBe("log")
    expect(refs.item.current?.dataset.messageId).toBe("a")
    expect(refs.button.current?.type).toBe("button")
    // the scroller mirrors its state on the root through its own ref, next to the caller's
    expect(refs.root.current?.getAttribute("data-scrollable")).toBe("end")
    expect(refs.viewport.current?.getAttribute("data-scrollable")).toBe("end")
  })

  test("class and className both end up on the element", () => {
    const { getByTestId } = render(<Scroller />)
    expect(getByTestId("root").className).toBe("from-class from-className")
  })

  test("the button scrolls to the end on click, takes focus away and reports its state", async () => {
    const { getByTestId } = render(<Scroller button={{ behavior: "auto" }} />)
    await flush()
    const button = getByTestId("button") as HTMLButtonElement
    const viewport = getByTestId("viewport")
    expect(button.dataset.active).toBe("true")
    expect(button.dataset.direction).toBe("end")
    expect(button.hasAttribute("inert")).toBe(false)
    button.focus()
    await act(async () => button.click())
    expect(viewport.scrollTop).toBe(400)
    expect(document.activeElement).not.toBe(button)
    await flush()
    expect(button.dataset.active).toBe("false")
    expect(button.hasAttribute("inert") || button.getAttribute("inert") === "true").toBe(true)
    expect(button.tabIndex).toBe(-1)
  })

  test("a prevented click does not scroll, and the start button goes to the top", async () => {
    const onClick = vi.fn((event: Event) => event.preventDefault())
    const { getByTestId, rerender } = render(<Scroller button={{ onClick }} />)
    await flush()
    await act(async () => (getByTestId("button") as HTMLElement).click())
    expect(onClick).toHaveBeenCalledOnce()
    expect(getByTestId("viewport").scrollTop).toBe(0)

    rerender(<Scroller button={{ direction: "start" }} />)
    await flush()
    const viewport = getByTestId("viewport")
    viewport.scrollTop = 300
    await act(async () => void viewport.dispatchEvent(new Event("scroll")))
    const button = getByTestId("button") as HTMLButtonElement
    expect(button.dataset.direction).toBe("start")
    expect(button.dataset.active).toBe("true")
    await act(async () => button.click())
    expect(viewport.scrollTop).toBe(0)
  })

  test("render takes an element or a function, and merges what the button sets", async () => {
    const onClick = vi.fn()
    const { getByTestId, rerender } = render(<Scroller button={{ render: <a href="#end" class="mine" onClick={onClick} />, className: "theirs" }} />)
    await flush()
    const link = getByTestId("button")
    expect(link.tagName).toBe("A")
    expect(link.getAttribute("href")).toBe("#end")
    expect(link.className).toBe("theirs mine")
    expect(link.dataset.active).toBe("true")
    await act(async () => link.click())
    expect(onClick).toHaveBeenCalledOnce()

    const states: unknown[] = []
    rerender(
      <Scroller
        button={{
          render: (props, state) => {
            states.push(state)
            return <span {...props}>custom</span>
          },
        }}
      />
    )
    await flush()
    expect(getByTestId("button").tagName).toBe("SPAN")
    // the click above scrolled to the end, so the button has nothing left to do
    expect(states.at(-1)).toEqual({ active: false, direction: "end" })
  })

  test("a render element keeps its own ref next to the button's", async () => {
    const ref = createRef<HTMLAnchorElement>()
    const { getByTestId } = render(<Scroller button={{ render: <a ref={ref} /> }} />)
    await flush()
    expect(ref.current).toBe(getByTestId("button"))
  })

  test("wheel, touch and key gestures reach the caller's handlers; wheel and touch listeners are passive", async () => {
    const onWheel = vi.fn()
    const onTouchMove = vi.fn()
    const onKeyDown = vi.fn()
    const add = vi.spyOn(HTMLElement.prototype, "addEventListener")
    const { getByTestId } = render(<Scroller viewport={{ onWheel, onTouchMove, onKeyDown }} />)
    await flush()
    const viewport = getByTestId("viewport")
    await act(async () => {
      viewport.dispatchEvent(new Event("wheel", { bubbles: true }))
      viewport.dispatchEvent(new Event("touchmove", { bubbles: true }))
      viewport.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", bubbles: true }))
    })
    expect(onWheel).toHaveBeenCalledOnce()
    expect(onTouchMove).toHaveBeenCalledOnce()
    expect(onKeyDown).toHaveBeenCalledOnce()
    const passive = add.mock.calls.filter(([type]) => type === "wheel" || type === "touchmove").map(([, , options]) => options)
    expect(passive).toEqual([{ passive: true }, { passive: true }])
  })

  test("the viewport label and role can be overridden", () => {
    const { getByTestId } = render(<Scroller viewport={{ "aria-label": "Chat", role: "list", tabIndex: -1 }} />)
    const viewport = getByTestId("viewport")
    expect(viewport.getAttribute("aria-label")).toBe("Chat")
    expect(viewport.getAttribute("role")).toBe("list")
    expect(viewport.tabIndex).toBe(-1)
  })
})

function Question(props: { root?: ComponentProps<typeof Questionnaire.Root>; input?: ComponentProps<typeof Questionnaire.Input>; submit?: ComponentProps<typeof Questionnaire.Submit> }) {
  return (
    <Questionnaire.Root data-testid="form" {...props.root}>
      <Questionnaire.Item data-testid="item" name="answer">
        <Questionnaire.Title>Question</Questionnaire.Title>
        <Questionnaire.Input data-testid="input" aria-label="Answer" {...props.input} />
      </Questionnaire.Item>
      <Questionnaire.Submit data-testid="submit" {...props.submit} />
    </Questionnaire.Root>
  )
}

const type = (input: HTMLElement, value: string) =>
  act(async () => {
    ;(input as HTMLInputElement).value = value
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })

describe("Questionnaire on Preact", () => {
  test("Root, Item and Input take a ref as a prop", async () => {
    const root = createRef<HTMLFormElement>()
    const input = createRef<HTMLInputElement>()
    const item = createRef<HTMLFieldSetElement>()
    const { getByTestId } = render(
      <Questionnaire.Root ref={root}>
        <Questionnaire.Item ref={item} name="answer">
          <Questionnaire.Input ref={input} data-testid="input" aria-label="Answer" />
        </Questionnaire.Item>
        <Questionnaire.Submit data-testid="submit" />
      </Questionnaire.Root>
    )
    await flush()
    expect(root.current?.tagName).toBe("FORM")
    expect(item.current?.tagName).toBe("FIELDSET")
    expect(input.current).toBe(getByTestId("input"))
    // the questionnaire still found its parts through its own refs
    expect(item.current?.hasAttribute("data-active")).toBe(true)
    expect(getByTestId("submit").hasAttribute("data-visible")).toBe(true)
  })

  test("the other parts hand their ref to the element they render", async () => {
    const refs = Object.fromEntries(["progress", "title", "description", "choices", "choice", "choiceInput", "choiceLabel", "choiceShortcut", "error", "next"].map((name) => [name, createRef<any>()]))
    render(
      <Questionnaire.Root>
        <Questionnaire.Progress ref={refs.progress} />
        <Questionnaire.Item name="answer">
          <Questionnaire.Title ref={refs.title}>T</Questionnaire.Title>
          <Questionnaire.Description ref={refs.description}>D</Questionnaire.Description>
          <Questionnaire.Choices ref={refs.choices}>
            <Questionnaire.Choice ref={refs.choice} value="a">
              <Questionnaire.ChoiceInput ref={refs.choiceInput} />
              <Questionnaire.ChoiceLabel ref={refs.choiceLabel}>a</Questionnaire.ChoiceLabel>
              <Questionnaire.ChoiceShortcut ref={refs.choiceShortcut} />
            </Questionnaire.Choice>
          </Questionnaire.Choices>
          <Questionnaire.Error ref={refs.error} />
        </Questionnaire.Item>
        <Questionnaire.Next ref={refs.next} />
      </Questionnaire.Root>
    )
    await flush()
    const tags = Object.fromEntries(Object.entries(refs).map(([name, ref]) => [name, ref.current?.localName]))
    expect(tags).toEqual({
      progress: "div",
      title: "legend",
      description: "p",
      choices: "div",
      choice: "label",
      choiceInput: "input",
      choiceLabel: "span",
      choiceShortcut: "span",
      error: "p",
      next: "button",
    })
  })

  test("the text input calls onChange on every keystroke, like React", async () => {
    const onChange = vi.fn()
    const { getByTestId } = render(<Question input={{ onChange }} />)
    await flush()
    const input = getByTestId("input")
    await type(input, "a")
    await type(input, "ab")
    expect(onChange).toHaveBeenCalledTimes(2)
    // the native change event (on blur) is not a second call
    await act(async () => void input.dispatchEvent(new Event("change", { bubbles: true })))
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(getByTestId("item").dataset.status).toBe("answered")
  })

  test("a controlled input shows its value again after an edit nobody applied", async () => {
    const { getByTestId } = render(<Question input={{ value: "fixed", onChange: () => {} }} />)
    await flush()
    const input = getByTestId("input") as HTMLInputElement
    await type(input, "typed")
    await flush()
    expect(input.value).toBe("fixed")
  })

  test("the submit button passes its own onClick and class names through", async () => {
    const onClick = vi.fn()
    const { getByTestId } = render(<Question submit={{ onClick, class: "a", className: "b" }} />)
    await flush()
    const submit = getByTestId("submit") as HTMLButtonElement
    expect(submit.className).toBe("a b")
    expect(submit.type).toBe("submit")
    await act(async () => submit.click())
    expect(onClick).toHaveBeenCalledOnce()
  })

  test("a part renders any element through render and keeps the data attributes of its state", async () => {
    const { getByTestId } = render(
      <Questionnaire.Root>
        <Questionnaire.Progress data-testid="progress" render={(props, state) => <output {...props}>{`${state.current}/${state.total}`}</output>} />
        <Questionnaire.Item name="answer">
          <Questionnaire.Title data-testid="title" render={<h2 class="heading" />}>
            Question
          </Questionnaire.Title>
        </Questionnaire.Item>
      </Questionnaire.Root>
    )
    await flush()
    const progress = getByTestId("progress")
    expect(progress.tagName).toBe("OUTPUT")
    expect(progress.textContent).toBe("1/1")
    expect(progress.getAttribute("role")).toBe("progressbar")
    expect(progress.dataset.current).toBe("1")
    const title = getByTestId("title")
    expect(title.tagName).toBe("H2")
    expect(title.className).toBe("heading")
    expect(title.textContent).toBe("Question")
  })
})
