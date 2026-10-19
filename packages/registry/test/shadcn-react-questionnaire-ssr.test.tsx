// @vitest-environment node
import { renderToString } from "preact-render-to-string"
import { expect, test } from "vitest"
import { Questionnaire } from "../src/shims/shadcn-react-questionnaire"

const items = [
  { choices: [{ value: "a" }, { disabled: true, value: "b" }, { value: "c" }], name: "scope", required: true },
  { choices: [{ value: "x" }], name: "detail" },
] as const

function Choice({ value }: { value: string }) {
  return (
    <Questionnaire.Choice value={value}>
      <Questionnaire.ChoiceInput />
      <Questionnaire.ChoiceLabel>{value}</Questionnaire.ChoiceLabel>
      <Questionnaire.ChoiceShortcut />
    </Questionnaire.Choice>
  )
}

function Tree({ defaultItem }: { defaultItem?: string }) {
  return (
    <Questionnaire.Root items={items} defaultItem={defaultItem} shortcuts="letters" className="root">
      <Questionnaire.Progress />
      <Questionnaire.Item name="scope" required>
        <Questionnaire.Title>Scope</Questionnaire.Title>
        <Questionnaire.Description id="why">Pick one</Questionnaire.Description>
        <Questionnaire.Choices>
          <Choice value="a" />
          <Choice value="b" />
          <Choice value="c" />
          <Questionnaire.Input aria-label="Other" />
        </Questionnaire.Choices>
        <Questionnaire.Error />
      </Questionnaire.Item>
      <Questionnaire.Item name="detail">
        <Questionnaire.Title>Detail</Questionnaire.Title>
        <Choice value="x" />
      </Questionnaire.Item>
      <Questionnaire.Previous />
      <Questionnaire.Skip />
      <Questionnaire.Next />
      <Questionnaire.Submit />
    </Questionnaire.Root>
  )
}

// No window or document here: any DOM access while rendering would throw
test("renders the form, progress and the active item without touching the DOM", () => {
  const html = renderToString(<Tree />)
  expect(html).toContain('<form data-current="1" data-first data-total="2" data-shortcuts="letters" novalidate class="root">')
  expect(html).toContain(
    '<div data-current="1" data-first data-total="2" aria-label="Questionnaire progress" aria-live="polite" aria-valuemax="2" aria-valuemin="1" aria-valuenow="1" aria-valuetext="Question 1 of 2" role="progressbar">Question 1 of 2</div>'
  )
  expect(html).toContain(
    '<fieldset data-active data-required data-status="unanswered" aria-keyshortcuts="Meta+Enter Control+Enter" tabindex="-1"><legend>Scope</legend><p id="why">Pick one</p>'
  )
  expect(html).toContain('<p hidden id="')
})

test("hides the inactive item and the actions that do not apply, shows next", () => {
  const html = renderToString(<Tree />)
  expect(html).toContain('<fieldset data-status="unanswered" hidden inert tabindex="-1"><legend>Detail</legend>')
  expect(html).toContain('<button data-status="unanswered" data-hidden aria-hidden="true" hidden inert tabindex="-1" type="button">Previous</button>')
  expect(html).toContain('<button data-status="unanswered" data-hidden aria-hidden="true" hidden inert tabindex="-1" type="button">Skip</button>')
  expect(html).toContain('<button data-shortcut="Enter" data-status="unanswered" data-visible aria-keyshortcuts="Enter" type="button">Next</button>')
  expect(html).toContain('<button data-status="unanswered" data-hidden aria-hidden="true" hidden inert tabindex="-1" type="submit">Submit</button>')
})

test("assigns letter shortcuts to the enabled choices in definition order", () => {
  const html = renderToString(<Tree />)
  expect(html).toContain('<span data-shortcut="A" aria-hidden="true">A</span>')
  expect(html).toContain('<span data-shortcut="B" aria-hidden="true">B</span>')
  expect(html).toContain('<span aria-hidden="true" hidden></span>')
  expect(html).toMatch(/<input data-unchecked data-shortcut="B" data-type="radio" aria-keyshortcuts="B" id="[^"]+" name="scope" required type="radio" value="c"\/>/)
  expect(html).toMatch(/<input data-unchecked data-type="radio" id="[^"]+" name="scope" required type="radio" value="b"\/>/)
})

test("an input that is not an answer yet is detached from the form", () => {
  expect(renderToString(<Tree />)).toMatch(/<input data-empty form id="[^"]+" type="text" aria-label="Other"\/>/)
})

test("renders the item requested by defaultItem as the active one", () => {
  const html = renderToString(<Tree defaultItem="detail" />)
  expect(html).toContain('data-current="2"')
  expect(html).toContain(">Question 2 of 2</div>")
  expect(html).toMatch(/<button [^>]*data-visible[^>]*type="submit">Submit<\/button>/)
})

test("a part outside its parent names itself", () => {
  expect(() => renderToString(<Questionnaire.Progress />)).toThrow("`Questionnaire.Progress` must be used within `Questionnaire.Root`")
  expect(() => renderToString(<Questionnaire.Root><Questionnaire.ChoiceInput /></Questionnaire.Root>)).toThrow(
    "`Questionnaire.ChoiceInput` must be used within `Questionnaire.Choice`"
  )
})
