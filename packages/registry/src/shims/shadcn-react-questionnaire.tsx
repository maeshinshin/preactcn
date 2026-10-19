// Derived from shadcn/ui (@shadcn/react) 0.3.1, Copyright (c) 2023 shadcn, MIT License (https://opensource.org/license/mit)
import type { ComponentChildren, ComponentProps, TargetedEvent } from "preact"
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks"
import { useComposedRefs } from "../radix/internal/compose-refs"
import { createStrictContext } from "../radix/internal/create-context"
import { forwardRef } from "../radix/internal/forward-ref"
import { mergeProps, useRender, type UseRenderComponentProps } from "./internal/shadcn-react-use-render"

// @shadcn/react 0.3.1 questionnaire on Preact hooks: same state machine, keyboard handling, markup and data attributes.
// Preact's onChange is the native one, which only fires on commit: the text input listens to `input` and calls `onChange` from there, as
// React's onChange does.
// shortcut: no dev-only definition/registration warnings (upstream's console.warn checks of Root.items against the rendered parts, behind
// process.env.NODE_ENV, which has no equivalent in every Vite and Fresh setup); port them from upstream's collection.ts if wanted.

type QuestionnaireItemStatus = "unanswered" | "answered" | "skipped"
type QuestionnaireShortcutMode = "letters" | "numbers"
type QuestionnaireChoiceDefinition = { disabled?: boolean; value: string }
type QuestionnaireItemDefinition = {
  choices?: readonly QuestionnaireChoiceDefinition[]
  disabled?: boolean
  name: string
  required?: boolean
}
type QuestionnaireInputType =
  | "date"
  | "datetime-local"
  | "email"
  | "month"
  | "number"
  | "password"
  | "search"
  | "tel"
  | "text"
  | "time"
  | "url"
  | "week"

type RootState = { current: number; first: boolean; last: boolean; total: number }
type ItemState = {
  active: boolean
  disabled: boolean
  invalid: boolean
  multiple: boolean
  required: boolean
  status: QuestionnaireItemStatus
}
type ChoiceState = { checked: boolean; disabled: boolean; invalid: boolean; shortcut: string | null; type: "checkbox" | "radio" }
type InputState = { disabled: boolean; filled: boolean; invalid: boolean }
type NavigationState = { disabled: boolean; shortcut: "Enter" | null; status: QuestionnaireItemStatus | null; visible: boolean }

// Handlers are methods so a wrapper may pass one that takes a narrower argument, like React's types allow
type RootProps = Omit<ComponentProps<"form">, "defaultValue" | "value"> & {
  defaultItem?: string
  item?: string
  items?: readonly QuestionnaireItemDefinition[]
  onItemChange?(item: string): void
  shortcuts?: QuestionnaireShortcutMode
}
// Props the parts read are plain values, not signals
type ItemProps = Omit<ComponentProps<"fieldset">, "name" | "value" | "disabled" | "aria-describedby" | "aria-keyshortcuts"> & {
  "aria-describedby"?: string
  "aria-keyshortcuts"?: string
  disabled?: boolean
  invalid?: boolean
  name: string
  multiple?: boolean
  onStatusChange?(status: QuestionnaireItemStatus): void
  required?: boolean
}
type ChoiceProps = Omit<UseRenderComponentProps<"label", ChoiceState>, "onChange"> & {
  checked?: boolean
  defaultChecked?: boolean
  disabled?: boolean
  onChange?(event: TargetedEvent<HTMLInputElement>): void
  value: string
}
type ChoiceInputProps = Omit<
  UseRenderComponentProps<"input", ChoiceState>,
  "checked" | "defaultChecked" | "disabled" | "name" | "onChange" | "required" | "type" | "value"
>
type InputProps = Omit<UseRenderComponentProps<"input", InputState>, "form" | "name" | "type" | "disabled" | "defaultValue" | "value"> & {
  defaultValue?: string | number
  disabled?: boolean
  type?: QuestionnaireInputType
  value?: string | number
}
type NavigationProps = Omit<UseRenderComponentProps<"button", NavigationState>, "disabled" | "tabIndex" | "type"> & {
  disabled?: boolean
  tabIndex?: number
  type?: "button" | "reset" | "submit"
}
type WithId<P> = Omit<P, "id"> & { id?: string }

type AnswerControl = { disabled: boolean; element: HTMLInputElement; id: string } & (
  | { ownDisabled: boolean; type: "choice"; value: string }
  | { type: "input" }
)

type ItemRegistration = {
  choices: readonly { disabled: boolean; value: string }[]
  disabled: boolean
  element: HTMLFieldSetElement
  focus(): void
  focusInvalid(): void
  getAnswerByElement(element: Element): AnswerControl | null
  getAnswerByShortcut(shortcut: string): AnswerControl | null
  moveAnswerFocus(element: Element, direction: "next" | "previous"): boolean
  name: string
  required: boolean
  reset(): void
  skip(): void
  status: QuestionnaireItemStatus
  validate(): boolean
}

type PendingFocus = { name: string; target: "invalid" | "item" }

type RootContext = RootState & {
  activeItemName: string | null
  activeItemRequired: boolean | null
  activeItemStatus: QuestionnaireItemStatus | null
  controlled: boolean
  domVersion: number
  goNext(): void
  goPrevious(): void
  nativeValidation: boolean
  pendingFocusRef: { current: PendingFocus | null }
  itemDefinitionByName: ReadonlyMap<string, QuestionnaireItemDefinition> | null
  registerItem(registration: ItemRegistration): () => void
  shortcuts: QuestionnaireShortcutMode | null
  skipCurrent(): void
}

type ItemContext = {
  disabled: boolean
  hasInputAnswer: boolean
  invalid: boolean
  multiple: boolean
  name: string
  registerAnswerControl(registration: AnswerControl): () => void
  registerAnswerSelection(answerId: string, defaultSelected: boolean): () => void
  registerDescription(descriptionId: string): () => void
  registerError(errorId: string): () => void
  required: boolean
  resetVersion: number
  selectedAnswerIds: string[]
  setAnswerDefault(answerId: string, defaultSelected: boolean): void
  setAnswerSelectionFromInteraction(answerId: string, selected: boolean): void
  shortcutByAnswerId: ReadonlyMap<string, string>
  shortcutByChoiceValue: ReadonlyMap<string, string> | null
  shortcuts: QuestionnaireShortcutMode | null
  status: QuestionnaireItemStatus
  syncControlledAnswerSelection(answerId: string, selected: boolean): void
}

type ChoiceContext = { inputProps: Record<string, any>; state: ChoiceState }

const [RootProvider, useRootContext] = createStrictContext<RootContext>("Questionnaire.Root")
const [ItemProvider, useItemContext] = createStrictContext<ItemContext>("Questionnaire.Item")
const [ChoiceProvider, useChoiceContext] = createStrictContext<ChoiceContext>("Questionnaire.Choice")

// ---- helpers ----

const hasInputValue = (value: unknown) =>
  Array.isArray(value) ? value.some((item) => String(item).trim().length > 0) : value !== undefined && value !== null && String(value).trim().length > 0

function getShortcutKeys(shortcuts: QuestionnaireShortcutMode | null) {
  if (shortcuts === "letters") return Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index))
  if (shortcuts === "numbers") return Array.from({ length: 9 }, (_, index) => String(index + 1))
  return []
}

function getShortcutFromKey(key: string, shortcuts: QuestionnaireShortcutMode) {
  const normalizedKey = shortcuts === "letters" ? key.toUpperCase() : key
  return getShortcutKeys(shortcuts).includes(normalizedKey) ? normalizedKey : null
}

const getAnswerKeyShortcuts = (shortcut: string | null, filled: boolean) => [shortcut, filled ? "Enter" : null].filter(Boolean).join(" ") || undefined

const isAnswerFilled = (answer: AnswerControl) =>
  answer.type === "choice" ? answer.element.checked : answer.element.hasAttribute("name") && hasInputValue(answer.element.value)

const isEmptyNavigableInput = (answer: AnswerControl | null) =>
  answer?.type === "input" &&
  ["email", "password", "search", "tel", "text", "url"].includes(answer.element.type) &&
  !hasInputValue(answer.element.value)

function isTextEntryTarget(element: Element) {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return true
  if (element instanceof HTMLInputElement) return !["button", "checkbox", "radio", "reset", "submit"].includes(element.type)
  return element instanceof HTMLElement && element.isContentEditable
}

const isRadioTarget = (element: Element) => element instanceof HTMLInputElement && element.type === "radio"

// Document order of two registered elements
function compareOrder(first: { element: Element }, second: { element: Element }) {
  if (first.element === second.element) return 0
  const position = first.element.compareDocumentPosition(second.element)
  if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1
  if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1
  return 0
}

function createCollection(items: readonly QuestionnaireItemDefinition[] | undefined) {
  if (items === undefined) return null
  return { enabledItems: items.filter((item) => !item.disabled), itemByName: new Map(items.map((item) => [item.name, item])), items }
}
type Collection = NonNullable<ReturnType<typeof createCollection>>

function getInitialItemName(collection: Collection | null, defaultItem: string | undefined) {
  if (!collection) return defaultItem ?? null
  const defaultDefinition = defaultItem ? collection.itemByName.get(defaultItem) : undefined
  if (defaultDefinition && !defaultDefinition.disabled) return defaultDefinition.name
  return collection.enabledItems[0]?.name ?? null
}

// Enabled choices take the shortcut keys in order
function getShortcutByChoiceValue(item: QuestionnaireItemDefinition | undefined, shortcuts: QuestionnaireShortcutMode | null) {
  const shortcutByChoiceValue = new Map<string, string>()
  if (!item || !shortcuts) return shortcutByChoiceValue
  const keys = getShortcutKeys(shortcuts)
  let shortcutIndex = 0
  for (const choice of item.choices ?? []) {
    if (choice.disabled) continue
    const shortcut = keys[shortcutIndex]
    if (!shortcut) break
    shortcutByChoiceValue.set(choice.value, shortcut)
    shortcutIndex += 1
  }
  return shortcutByChoiceValue
}

// ---- root ----

function useQuestionnaireRoot({
  defaultItem,
  item: controlledItem,
  items: itemDefinitions,
  noValidate,
  onItemChange,
  onReset,
  onSubmit,
  shortcuts: shortcutMode,
}: Pick<RootProps, "defaultItem" | "item" | "items" | "noValidate" | "onItemChange" | "onReset" | "onSubmit" | "shortcuts">) {
  const collection = useMemo(() => createCollection(itemDefinitions), [itemDefinitions])
  const [registrations, setRegistrations] = useState<ItemRegistration[]>([])
  const [uncontrolledItem, setUncontrolledItem] = useState<string | null>(() => getInitialItemName(collection, defaultItem))
  const [rootElement, setRootElement] = useState<HTMLFormElement | null>(null)
  const [domVersion, setDomVersion] = useState(0)
  const pendingFocusRef = useRef<PendingFocus | null>(null)
  const controlled = controlledItem !== undefined
  const activeItemName = controlled ? controlledItem : uncontrolledItem
  const nativeValidation = noValidate === false
  const shortcuts = shortcutMode ?? null

  useLayoutEffect(() => {
    if (!rootElement || typeof MutationObserver === "undefined") return
    const observer = new MutationObserver(() => setDomVersion((version) => version + 1))
    observer.observe(rootElement, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [rootElement])

  const runtimeItems = useMemo(
    () => registrations.filter((registration) => !registration.disabled).sort(compareOrder),
    // domVersion: the document order changes when the DOM does
    [domVersion, registrations]
  )
  const runtimeItemByName = useMemo(() => new Map(runtimeItems.map((runtimeItem) => [runtimeItem.name, runtimeItem])), [runtimeItems])
  const logicalItems: readonly { name: string }[] = collection?.enabledItems ?? runtimeItems
  const currentIndex = logicalItems.findIndex((logicalItem) => logicalItem.name === activeItemName)
  const activeItem = currentIndex < 0 || !activeItemName ? null : (runtimeItemByName.get(activeItemName) ?? null)
  const activeDefinition = activeItemName ? collection?.itemByName.get(activeItemName) : undefined
  const activeItemRequired = currentIndex < 0 ? null : activeDefinition ? Boolean(activeDefinition.required) : (activeItem?.required ?? false)
  const activeItemStatus = currentIndex < 0 ? null : (activeItem?.status ?? (activeItemName ? "unanswered" : null))
  const orderedRegistrations = useMemo(
    () =>
      collection
        ? collection.enabledItems.flatMap((definition) => {
            const registration = runtimeItemByName.get(definition.name)
            return registration ? [registration] : []
          })
        : runtimeItems,
    [collection, runtimeItemByName, runtimeItems]
  )
  const total = logicalItems.length
  const current = currentIndex < 0 ? 0 : currentIndex + 1
  const first = total > 0 && currentIndex === 0
  const last = total > 0 && currentIndex === total - 1

  const setItem = useCallback(
    (nextItem: string, focusTarget: PendingFocus["target"] = "item") => {
      if (nextItem === activeItemName) return
      pendingFocusRef.current = { name: nextItem, target: focusTarget }
      if (!controlled) setUncontrolledItem(nextItem)
      onItemChange?.(nextItem)
    },
    [activeItemName, controlled, onItemChange]
  )

  useLayoutEffect(() => {
    if (total === 0 || currentIndex >= 0) return
    if (!controlled && activeItemName === null) {
      setUncontrolledItem(logicalItems[0]!.name)
      return
    }
    setItem(logicalItems[0]!.name)
  }, [activeItemName, controlled, currentIndex, logicalItems, setItem, total])

  const registerItem = useCallback((registration: ItemRegistration) => {
    setRegistrations((currentRegistrations) => [
      ...currentRegistrations.filter((item) => item.element !== registration.element && item.name !== registration.name),
      registration,
    ])
    return () => setRegistrations((currentRegistrations) => currentRegistrations.filter((item) => item !== registration))
  }, [])

  const goPrevious = useCallback(() => {
    if (currentIndex <= 0) return
    setItem(logicalItems[currentIndex - 1]!.name)
  }, [currentIndex, logicalItems, setItem])

  const goNext = useCallback(() => {
    if (!activeItem || currentIndex >= total - 1) return
    if (!activeItem.validate()) {
      activeItem.focusInvalid()
      return
    }
    setItem(logicalItems[currentIndex + 1]!.name)
  }, [activeItem, currentIndex, logicalItems, setItem, total])

  const confirmCurrent = useCallback(() => {
    if (!activeItem) return
    if (!activeItem.validate()) {
      activeItem.focusInvalid()
      return
    }
    if (last) {
      rootElement?.requestSubmit()
      return
    }
    setItem(logicalItems[currentIndex + 1]!.name)
  }, [activeItem, currentIndex, last, logicalItems, rootElement, setItem])

  const [submitAfterSkip, setSubmitAfterSkip] = useState(false)
  const skipCurrent = useCallback(() => {
    if (!activeItem || activeItem.required) return
    activeItem.skip()
    if (!last) {
      setItem(logicalItems[currentIndex + 1]!.name)
      return
    }
    setSubmitAfterSkip(true)
  }, [activeItem, currentIndex, last, logicalItems, setItem])

  // Submit once the skip is registered, so the submit handler validates the skipped item rather than the state before the click
  useLayoutEffect(() => {
    if (!submitAfterSkip || activeItem?.status !== "skipped") return
    setSubmitAfterSkip(false)
    rootElement?.requestSubmit()
  })

  const handleReset: NonNullable<RootProps["onReset"]> = (event) => {
    onReset?.(event)
    if (event.defaultPrevented) return
    for (const registration of registrations) registration.reset()
    const resetItemName = collection
      ? getInitialItemName(collection, defaultItem)
      : (runtimeItems.find((registration) => registration.name === defaultItem)?.name ?? runtimeItems[0]?.name)
    if (resetItemName) setItem(resetItemName)
  }

  const handleSubmit: NonNullable<RootProps["onSubmit"]> = (event) => {
    const firstInvalidItem = orderedRegistrations.find((registration) => !registration.validate())
    if (firstInvalidItem) {
      event.preventDefault()
      setItem(firstInvalidItem.name, "invalid")
      if (firstInvalidItem.name === activeItemName) {
        firstInvalidItem.focusInvalid()
        pendingFocusRef.current = null
      }
      return
    }
    onSubmit?.(event)
  }

  const handleKeyDown: NonNullable<RootProps["onKeyDown"]> = (event) => {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || !activeItem || !(event.target instanceof Element)) return

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
      event.preventDefault()
      if (!event.repeat) confirmCurrent()
      return
    }

    if (event.metaKey || event.ctrlKey || event.altKey) return

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (activeItem.moveAnswerFocus(event.target, event.key === "ArrowDown" ? "next" : "previous")) {
        event.preventDefault()
        return
      }
    }

    if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && !isTextEntryTarget(event.target) && !isRadioTarget(event.target)) {
      event.preventDefault()
      if (event.repeat) return
      if (event.key === "ArrowLeft") goPrevious()
      else if (activeItem.status !== "unanswered") goNext()
      return
    }

    if (event.key === "Enter") {
      const answer = activeItem.getAnswerByElement(event.target)
      if (!answer) return
      event.preventDefault()
      if (!event.repeat && isAnswerFilled(answer)) confirmCurrent()
      return
    }

    if (!shortcuts || isTextEntryTarget(event.target)) return

    const shortcut = getShortcutFromKey(event.key, shortcuts)
    const answer = shortcut ? activeItem.getAnswerByShortcut(shortcut) : null
    if (!answer) return
    event.preventDefault()
    if (event.repeat) return
    answer.element.focus()
    if (answer.type === "choice") answer.element.click()
  }

  const state: RootState = { current, first, last, total }
  const context = useMemo<RootContext>(
    () => ({
      current,
      first,
      last,
      total,
      activeItemName,
      activeItemRequired,
      activeItemStatus,
      controlled,
      domVersion,
      goNext,
      goPrevious,
      itemDefinitionByName: collection?.itemByName ?? null,
      nativeValidation,
      pendingFocusRef,
      registerItem,
      shortcuts,
      skipCurrent,
    }),
    [
      activeItemName,
      activeItemRequired,
      activeItemStatus,
      collection,
      controlled,
      current,
      domVersion,
      first,
      goNext,
      goPrevious,
      last,
      nativeValidation,
      registerItem,
      shortcuts,
      skipCurrent,
      total,
    ]
  )

  return {
    context,
    setRootElement,
    rootProps: { "data-shortcuts": shortcuts ?? undefined, onKeyDown: handleKeyDown, onReset: handleReset, onSubmit: handleSubmit },
    state,
  }
}

// ---- item ----

function useQuestionnaireItem({
  "aria-describedby": ariaDescribedBy,
  "aria-keyshortcuts": ariaKeyShortcuts,
  disabled = false,
  invalid: externallyInvalid = false,
  multiple = false,
  name,
  onStatusChange,
  required = false,
}: Pick<ItemProps, "aria-describedby" | "aria-keyshortcuts" | "disabled" | "invalid" | "multiple" | "name" | "onStatusChange" | "required">) {
  const { activeItemName, controlled, domVersion, first, itemDefinitionByName, last, nativeValidation, pendingFocusRef, registerItem, shortcuts } =
    useRootContext("Questionnaire.Item")
  // The ref is there in the commit that mounts the item, so all items register in one batch (the root would otherwise see a partial list
  // and move to the first item that registered); the state re-registers the item if its element is replaced
  const elementRef = useRef<HTMLFieldSetElement | null>(null)
  const [element, setElement] = useState<HTMLFieldSetElement | null>(null)
  const [answerControlRegistrations, setAnswerControlRegistrations] = useState<AnswerControl[]>([])
  const [validationAttempted, setValidationAttempted] = useState(false)
  const [selectedAnswerIds, setSelectedAnswerIds] = useState<string[]>([])
  const [skipped, setSkipped] = useState(false)
  const [resetVersion, setResetVersion] = useState(0)
  const [descriptionIds, setDescriptionIds] = useState<string[]>([])
  const [errorIds, setErrorIds] = useState<string[]>([])
  const defaultSelectedAnswerIdsRef = useRef<string[]>([])
  const multipleRef = useRef(multiple)
  const previousMultipleRef = useRef(multiple)
  multipleRef.current = multiple
  const active = !disabled && activeItemName === name
  const answerControls = useMemo(
    () => [...answerControlRegistrations].sort(compareOrder),
    // domVersion: the document order changes when the DOM does
    [answerControlRegistrations, domVersion]
  )
  const answers = useMemo(() => answerControls.filter((registration) => !registration.disabled), [answerControls])
  const answered = answers.some((answer) => selectedAnswerIds.includes(answer.id))
  const status: QuestionnaireItemStatus = skipped ? "skipped" : answered ? "answered" : "unanswered"
  const intentionallySkipped = status === "skipped" && !required
  const valid = disabled || intentionallySkipped || (!externallyInvalid && status === "answered")
  const invalid = !disabled && !intentionallySkipped && (externallyInvalid || (validationAttempted && !valid))
  const hasInputAnswer = answers.some((answer) => answer.type === "input")
  const previousStatusRef = useRef(status)
  const itemDefinition = itemDefinitionByName?.get(name)
  const shortcutByChoiceValue = useMemo(
    () => (itemDefinitionByName ? getShortcutByChoiceValue(itemDefinition, shortcuts) : null),
    [itemDefinition, itemDefinitionByName, shortcuts]
  )
  const shortcutByAnswerId = useMemo(() => {
    if (shortcutByChoiceValue) return new Map<string, string>()
    const keys = getShortcutKeys(shortcuts)
    return new Map(
      answers
        .filter((answer) => answer.type === "choice")
        .slice(0, keys.length)
        .map((answer, index) => [answer.id, keys[index]!])
    )
  }, [answers, shortcutByChoiceValue, shortcuts])

  const registerAnswerControl = useCallback((registration: AnswerControl) => {
    setAnswerControlRegistrations((currentRegistrations) => [
      ...currentRegistrations.filter((item) => item.element !== registration.element && item.id !== registration.id),
      registration,
    ])
    return () => setAnswerControlRegistrations((currentRegistrations) => currentRegistrations.filter((item) => item !== registration))
  }, [])

  useLayoutEffect(() => {
    if (previousStatusRef.current === status) return
    previousStatusRef.current = status
    onStatusChange?.(status)
  }, [onStatusChange, status])

  const updateAnswerSelected = useCallback(
    (answerId: string, selected: boolean) => {
      setSelectedAnswerIds((currentAnswerIds) => {
        if (!selected) return currentAnswerIds.filter((currentAnswerId) => currentAnswerId !== answerId)
        if (!multiple) return [answerId]
        return currentAnswerIds.includes(answerId) ? currentAnswerIds : [...currentAnswerIds, answerId]
      })
    },
    [multiple]
  )
  const setAnswerSelectionFromInteraction = useCallback(
    (answerId: string, selected: boolean) => {
      setSkipped(false)
      updateAnswerSelected(answerId, selected)
    },
    [updateAnswerSelected]
  )
  const syncControlledAnswerSelection = useCallback(
    (answerId: string, selected: boolean) => {
      if (selected) setSkipped(false)
      updateAnswerSelected(answerId, selected)
    },
    [updateAnswerSelected]
  )

  const registerAnswerSelection = useCallback((answerId: string, defaultSelected: boolean) => {
    if (defaultSelected) {
      defaultSelectedAnswerIdsRef.current = [...defaultSelectedAnswerIdsRef.current.filter((id) => id !== answerId), answerId]
      setSelectedAnswerIds((currentAnswerIds) => {
        if (!multipleRef.current) return currentAnswerIds.length ? currentAnswerIds : [answerId]
        return currentAnswerIds.includes(answerId) ? currentAnswerIds : [...currentAnswerIds, answerId]
      })
    }
    return () => {
      defaultSelectedAnswerIdsRef.current = defaultSelectedAnswerIdsRef.current.filter((id) => id !== answerId)
      setSelectedAnswerIds((currentAnswerIds) => currentAnswerIds.filter((id) => id !== answerId))
    }
  }, [])
  const setAnswerDefault = useCallback((answerId: string, defaultSelected: boolean) => {
    if (defaultSelected) {
      if (!defaultSelectedAnswerIdsRef.current.includes(answerId)) defaultSelectedAnswerIdsRef.current = [...defaultSelectedAnswerIdsRef.current, answerId]
      return
    }
    defaultSelectedAnswerIdsRef.current = defaultSelectedAnswerIdsRef.current.filter((id) => id !== answerId)
  }, [])

  const registerDescription = useCallback((id: string) => {
    setDescriptionIds((ids) => (ids.includes(id) ? ids : [...ids, id]))
    return () => setDescriptionIds((ids) => ids.filter((currentId) => currentId !== id))
  }, [])
  const registerError = useCallback((id: string) => {
    setErrorIds((ids) => (ids.includes(id) ? ids : [...ids, id]))
    return () => setErrorIds((ids) => ids.filter((currentId) => currentId !== id))
  }, [])

  const validate = useCallback(() => {
    setValidationAttempted(true)
    if (!valid) return false
    if (!nativeValidation) return true
    const invalidAnswer = answers.find((answer) => isAnswerFilled(answer) && answer.element.willValidate && !answer.element.validity.valid)
    if (!invalidAnswer) return true
    invalidAnswer.element.focus()
    invalidAnswer.element.reportValidity()
    return false
  }, [answers, nativeValidation, valid])

  const focus = useCallback(() => elementRef.current?.focus(), [])

  const focusInvalid = useCallback(() => {
    const fieldset = elementRef.current
    const selectedInput = fieldset?.querySelector<HTMLInputElement>("input[data-filled][name]:not(:disabled)")
    const firstControl = fieldset?.querySelector<HTMLElement>("input:not([type=hidden]):not(:disabled), textarea:not(:disabled)")
    ;(selectedInput ?? firstControl ?? fieldset)?.focus()
  }, [])

  const reset = useCallback(() => {
    setValidationAttempted(false)
    setSkipped(false)
    setSelectedAnswerIds(multiple ? [...defaultSelectedAnswerIdsRef.current] : defaultSelectedAnswerIdsRef.current.slice(0, 1))
    setResetVersion((version) => version + 1)
  }, [multiple])

  const skip = useCallback(() => {
    if (required) return
    setSelectedAnswerIds([])
    setSkipped(true)
  }, [required])

  useLayoutEffect(() => {
    const wasMultiple = previousMultipleRef.current
    previousMultipleRef.current = multiple
    if (!wasMultiple || multiple) return
    setSelectedAnswerIds((currentAnswerIds) => {
      const selectedAnswer = answers.find((answer) => currentAnswerIds.includes(answer.id))
      return selectedAnswer ? [selectedAnswer.id] : []
    })
  }, [answers, multiple])

  const getAnswerByElement = useCallback((answerElement: Element) => answers.find((answer) => answer.element === answerElement) ?? null, [answers])
  const getAnswerByShortcut = useCallback(
    (shortcut: string) => {
      if (shortcutByChoiceValue) {
        const choiceValue = Array.from(shortcutByChoiceValue.entries()).find(([, choiceShortcut]) => choiceShortcut === shortcut)?.[0]
        return answers.find((answer) => answer.type === "choice" && answer.value === choiceValue) ?? null
      }
      const answerId = Array.from(shortcutByAnswerId.entries()).find(([, answerShortcut]) => answerShortcut === shortcut)?.[0]
      return answers.find((answer) => answer.id === answerId) ?? null
    },
    [answers, shortcutByAnswerId, shortcutByChoiceValue]
  )
  const moveAnswerFocus = useCallback(
    (currentElement: Element, direction: "next" | "previous") => {
      const currentIndex = answers.findIndex((answer) => answer.element === currentElement)
      const currentAnswer = currentIndex < 0 ? null : (answers[currentIndex] ?? null)

      if (
        !answers.length ||
        (isTextEntryTarget(currentElement) && !isEmptyNavigableInput(currentAnswer)) ||
        (currentIndex < 0 && currentElement !== elementRef.current)
      ) {
        return false
      }

      const nextAnswer =
        currentIndex < 0
          ? (answers.find(isAnswerFilled) ?? (direction === "next" ? answers[0] : answers[answers.length - 1]))
          : answers[(currentIndex + (direction === "next" ? 1 : -1) + answers.length) % answers.length]

      if (!nextAnswer || nextAnswer.element === currentElement) return false

      // Arrow keys already move between the radios of a group
      if (currentIndex >= 0 && isRadioTarget(currentElement) && isRadioTarget(nextAnswer.element)) return false

      nextAnswer.element.focus()
      if (nextAnswer.type === "choice" && isRadioTarget(nextAnswer.element)) nextAnswer.element.click()
      return true
    },
    [answers]
  )

  // Move focus into the item that just became the active one (a layout effect of the root would run before the item shows)
  const wasActiveRef = useRef(active)
  useLayoutEffect(() => {
    const justActivated = active && !wasActiveRef.current
    wasActiveRef.current = active
    if (!active) return
    const pendingFocus = pendingFocusRef.current
    if (pendingFocus?.name === name) {
      pendingFocusRef.current = null
      if (pendingFocus.target === "invalid") focusInvalid()
      else focus()
    } else if (justActivated && controlled) {
      pendingFocusRef.current = null
      focus()
    }
  }, [active])

  useLayoutEffect(() => {
    const fieldset = elementRef.current
    if (!fieldset) return
    return registerItem({
      choices: answerControls.flatMap((answer) => (answer.type === "choice" ? [{ disabled: answer.ownDisabled, value: answer.value }] : [])),
      disabled,
      element: fieldset,
      focus,
      focusInvalid,
      getAnswerByElement,
      getAnswerByShortcut,
      moveAnswerFocus,
      name,
      required,
      reset,
      skip,
      status,
      validate,
    })
  }, [
    answerControls,
    disabled,
    element,
    focus,
    focusInvalid,
    getAnswerByElement,
    getAnswerByShortcut,
    moveAnswerFocus,
    name,
    registerItem,
    required,
    reset,
    skip,
    status,
    validate,
  ])

  const context = useMemo<ItemContext>(
    () => ({
      disabled,
      hasInputAnswer,
      invalid,
      multiple,
      name,
      registerAnswerControl,
      registerAnswerSelection,
      registerDescription,
      registerError,
      required,
      resetVersion,
      selectedAnswerIds,
      setAnswerDefault,
      setAnswerSelectionFromInteraction,
      shortcutByAnswerId,
      shortcutByChoiceValue,
      shortcuts,
      status,
      syncControlledAnswerSelection,
    }),
    [
      disabled,
      hasInputAnswer,
      invalid,
      multiple,
      name,
      registerAnswerControl,
      registerAnswerSelection,
      registerDescription,
      registerError,
      required,
      resetVersion,
      selectedAnswerIds,
      setAnswerDefault,
      setAnswerSelectionFromInteraction,
      shortcutByAnswerId,
      shortcutByChoiceValue,
      shortcuts,
      status,
      syncControlledAnswerSelection,
    ]
  )
  const describedBy = [...descriptionIds, ...(invalid ? errorIds : []), ariaDescribedBy].filter(Boolean).join(" ") || undefined
  const keyShortcuts =
    [
      ariaKeyShortcuts,
      active ? "Meta+Enter Control+Enter" : undefined,
      active && answers.length ? "ArrowUp ArrowDown" : undefined,
      active && !first ? "ArrowLeft" : undefined,
      active && !last && status !== "unanswered" ? "ArrowRight" : undefined,
    ]
      .filter(Boolean)
      .join(" ") || undefined
  const state: ItemState = { active, disabled, invalid, multiple, required, status }

  return {
    context,
    setElement,
    elementRef,
    itemProps: {
      "aria-describedby": describedBy,
      "aria-invalid": invalid || undefined,
      "aria-keyshortcuts": keyShortcuts,
      disabled,
      hidden: !active,
      inert: !active,
      tabIndex: -1,
    },
    state,
  }
}

// ---- choice and input ----

// Preact writes a removed `name` (a DOM property) as the empty string; React removes the attribute, and isAnswerFilled tells the answers
// that count by the attribute
function useRemoveEmptyName(ref: { current: HTMLInputElement | null }, name: string | undefined) {
  useLayoutEffect(() => {
    if (!name) ref.current?.removeAttribute("name")
  })
}

function useQuestionnaireChoice({
  checked: controlledChecked,
  defaultChecked = false,
  disabled: choiceDisabled = false,
  onChange,
  value,
}: Pick<ChoiceProps, "checked" | "defaultChecked" | "disabled" | "onChange" | "value">) {
  const {
    disabled: itemDisabled,
    hasInputAnswer,
    invalid,
    multiple,
    name: itemName,
    registerAnswerControl,
    registerAnswerSelection,
    required,
    resetVersion,
    selectedAnswerIds,
    setAnswerDefault,
    setAnswerSelectionFromInteraction,
    shortcutByAnswerId,
    shortcutByChoiceValue,
    status,
    syncControlledAnswerSelection,
  } = useItemContext("Questionnaire.Choice")
  const answerId = useId()
  const [inputElement, setInputElement] = useState<HTMLInputElement | null>(null)
  const initialDefaultCheckedRef = useRef(defaultChecked)
  const controlled = controlledChecked !== undefined
  const disabled = itemDisabled || choiceDisabled
  const selected = selectedAnswerIds.includes(answerId)
  const checked = controlled ? (status === "skipped" ? false : controlledChecked) : selected
  const type = multiple ? "checkbox" : "radio"
  const shortcut = shortcutByChoiceValue?.get(value) ?? shortcutByAnswerId.get(answerId) ?? null

  useLayoutEffect(() => registerAnswerSelection(answerId, initialDefaultCheckedRef.current), [answerId, registerAnswerSelection])
  useLayoutEffect(() => setAnswerDefault(answerId, defaultChecked), [answerId, defaultChecked, setAnswerDefault])

  useLayoutEffect(() => {
    if (!inputElement) return
    return registerAnswerControl({ disabled, element: inputElement, id: answerId, ownDisabled: choiceDisabled, type: "choice", value })
  }, [answerId, choiceDisabled, disabled, inputElement, registerAnswerControl, value])

  useLayoutEffect(() => {
    if (controlled) syncControlledAnswerSelection(answerId, controlledChecked)
  }, [answerId, controlled, controlledChecked, resetVersion, syncControlledAnswerSelection])

  useLayoutEffect(() => {
    if (!inputElement) return
    // Keep the native reset target aligned with Questionnaire's owned default, including controlled choices whose checked prop stays authoritative
    inputElement.defaultChecked = controlled ? controlledChecked : defaultChecked
    if (resetVersion > 0) inputElement.checked = checked
  }, [checked, controlled, controlledChecked, defaultChecked, inputElement, resetVersion])

  // A controlled input shows its prop, not the edit: React puts it back after the event, Preact does not re-render without a state change.
  // shortcut: a rejected change to a controlled radio does not re-check the radio the browser unchecked in its group
  const latestChecked = useRef(checked)
  latestChecked.current = checked

  function handleChange(event: TargetedEvent<HTMLInputElement>) {
    const input = event.currentTarget
    if (controlled) queueMicrotask(() => void (input.checked = latestChecked.current))
    onChange?.(event)
    if (event.defaultPrevented) return
    if (!controlled) {
      setAnswerSelectionFromInteraction(answerId, event.currentTarget.checked)
      return
    }
    if (status === "skipped" && controlledChecked === event.currentTarget.checked) setAnswerSelectionFromInteraction(answerId, controlledChecked)
  }

  const state: ChoiceState = { checked, disabled, invalid, shortcut, type }

  return {
    inputProps: {
      ref: setInputElement,
      "aria-invalid": invalid || undefined,
      "aria-keyshortcuts": getAnswerKeyShortcuts(shortcut, !disabled && checked),
      checked,
      disabled,
      id: answerId,
      name: status === "skipped" ? undefined : itemName,
      onChange: handleChange,
      required: required && !multiple && !hasInputAnswer,
      type,
      value,
    },
    state,
  }
}

function useQuestionnaireInput({
  defaultValue,
  disabled: inputDisabled = false,
  onChange,
  type = "text",
  value: controlledValue,
}: Pick<InputProps, "defaultValue" | "disabled" | "onChange" | "type" | "value">) {
  const {
    disabled: itemDisabled,
    invalid,
    name: itemName,
    registerAnswerControl,
    registerAnswerSelection,
    resetVersion,
    selectedAnswerIds,
    setAnswerDefault,
    setAnswerSelectionFromInteraction,
    syncControlledAnswerSelection,
  } = useItemContext("Questionnaire.Input")
  const answerId = useId()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const initialDefaultFilledRef = useRef(hasInputValue(defaultValue))
  const controlled = controlledValue !== undefined
  const defaultFilled = hasInputValue(defaultValue)
  const controlledFilled = hasInputValue(controlledValue)
  const [uncontrolledFilled, setUncontrolledFilled] = useState(defaultFilled)
  const disabled = itemDisabled || inputDisabled
  const filled = controlled ? controlledFilled : uncontrolledFilled
  const selected = selectedAnswerIds.includes(answerId)

  useLayoutEffect(() => registerAnswerSelection(answerId, initialDefaultFilledRef.current), [answerId, registerAnswerSelection])
  useLayoutEffect(() => setAnswerDefault(answerId, defaultFilled), [defaultFilled, answerId, setAnswerDefault])

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    return registerAnswerControl({ disabled, element: input, id: answerId, type: "input" })
  }, [disabled, answerId, registerAnswerControl])

  useLayoutEffect(() => {
    if (controlled) {
      syncControlledAnswerSelection(answerId, controlledFilled)
      return
    }
    if (resetVersion > 0) setUncontrolledFilled(defaultFilled)
  }, [controlled, controlledFilled, controlledValue, defaultFilled, answerId, resetVersion, syncControlledAnswerSelection])

  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input || !controlled) return
    input.defaultValue = String(controlledValue)
  }, [controlled, controlledValue])

  const latestValue = useRef(controlledValue)
  latestValue.current = controlledValue

  function handleInput(event: TargetedEvent<HTMLInputElement>) {
    const input = event.currentTarget
    // A controlled input shows its prop, not the edit (see the Choice)
    if (controlled) queueMicrotask(() => void (input.value = String(latestValue.current)))
    ;(onChange as ((event: TargetedEvent<HTMLInputElement>) => void) | undefined)?.(event)
    if (event.defaultPrevented) return
    const nextFilled = event.currentTarget.value.trim().length > 0
    if (controlled) return
    setUncontrolledFilled(nextFilled)
    setAnswerSelectionFromInteraction(answerId, nextFilled)
  }

  const state: InputState = { disabled, filled, invalid }

  return {
    inputRef,
    inputProps: {
      "aria-invalid": invalid || undefined,
      "aria-keyshortcuts": getAnswerKeyShortcuts(null, !disabled && filled && selected),
      defaultValue: controlled ? undefined : defaultValue,
      disabled,
      // An input that is not part of the answer is detached from the form so it is not submitted
      form: selected ? undefined : "",
      id: answerId,
      name: selected ? itemName : undefined,
      onInput: handleInput,
      type,
      value: controlled ? controlledValue : undefined,
    },
    state,
  }
}

// ---- components ----

const checkedAttributes = (isChecked: boolean) => ({ "data-checked": isChecked ? "" : undefined, "data-unchecked": isChecked ? undefined : "" })

const Root = forwardRef<RootProps>(({ defaultItem, item, items, noValidate = true, onItemChange, onReset, onSubmit, shortcuts, ...props }, ref) => {
  const { context, rootProps, setRootElement, state } = useQuestionnaireRoot({ defaultItem, item, items, noValidate, onItemChange, onReset, onSubmit, shortcuts })
  const setRef = useComposedRefs<HTMLFormElement>(setRootElement, ref)
  const element = useRender({
    defaultTagName: "form",
    props: mergeProps({ ...rootProps, noValidate, ref: setRef }, props),
    state,
  })

  return <RootProvider value={context}>{element}</RootProvider>
})

function Progress({ children, render, ...props }: UseRenderComponentProps<"div", RootState>) {
  const { current, first, last, total } = useRootContext("Questionnaire.Progress")
  const label = total ? `Question ${current} of ${total}` : undefined

  return useRender({
    defaultTagName: "div",
    props: mergeProps(
      {
        "aria-label": "Questionnaire progress",
        "aria-live": "polite",
        "aria-valuemax": total || undefined,
        "aria-valuemin": total ? 1 : undefined,
        "aria-valuenow": total ? current : undefined,
        "aria-valuetext": label,
        children: children ?? label,
        role: "progressbar",
      },
      props
    ),
    render,
    state: { current, first, last, total },
  })
}

const Item = forwardRef<ItemProps>(
  (
    {
      "aria-describedby": ariaDescribedBy,
      "aria-keyshortcuts": ariaKeyShortcuts,
      children,
      disabled = false,
      invalid = false,
      multiple = false,
      name,
      onStatusChange,
      required = false,
      ...props
    },
    ref
  ) => {
    const { context, elementRef, itemProps, setElement, state } = useQuestionnaireItem({
      "aria-describedby": ariaDescribedBy,
      "aria-keyshortcuts": ariaKeyShortcuts,
      disabled,
      invalid,
      multiple,
      name,
      onStatusChange,
      required,
    })
    const setRef = useComposedRefs<HTMLFieldSetElement>(elementRef, setElement, ref)
    const element = useRender({
      defaultTagName: "fieldset",
      props: mergeProps({ ...itemProps, children, ref: setRef }, props),
      state,
      stateAttributesMapping: { active: (isActive) => ({ "data-active": isActive ? "" : undefined }) },
    })

    return <ItemProvider value={context}>{element}</ItemProvider>
  }
)

function Title({ render, ...props }: UseRenderComponentProps<"legend">) {
  useItemContext("Questionnaire.Title")

  return useRender({ defaultTagName: "legend", props, render })
}

function Description({ id, render, ...props }: WithId<UseRenderComponentProps<"p">>) {
  const { registerDescription } = useItemContext("Questionnaire.Description")
  const generatedId = useId()
  const descriptionId = id ?? generatedId

  useLayoutEffect(() => registerDescription(descriptionId), [descriptionId, registerDescription])

  return useRender({ defaultTagName: "p", props: mergeProps({ id: descriptionId }, props), render })
}

function Choices({ render, ...props }: UseRenderComponentProps<"div", { shortcuts: QuestionnaireShortcutMode | null }>) {
  const { shortcuts } = useItemContext("Questionnaire.Choices")

  return useRender({ defaultTagName: "div", props, render, state: { shortcuts } })
}

function Choice({ checked, children, defaultChecked = false, disabled = false, onChange, render, value, ...props }: ChoiceProps) {
  const { inputProps, state } = useQuestionnaireChoice({ checked, defaultChecked, disabled, onChange, value })
  const element = useRender({
    defaultTagName: "label",
    props: mergeProps({ children }, props),
    render,
    state,
    stateAttributesMapping: { checked: checkedAttributes },
  })

  return <ChoiceProvider value={{ inputProps, state }}>{element}</ChoiceProvider>
}

function ChoiceInput({ render, ...props }: ChoiceInputProps) {
  const { inputProps, state } = useChoiceContext("Questionnaire.ChoiceInput")
  const ref = useRef<HTMLInputElement | null>(null)
  useRemoveEmptyName(ref, inputProps.name)

  return useRender({
    defaultTagName: "input",
    props: mergeProps(inputProps, props, { ref }),
    render,
    state,
    stateAttributesMapping: { checked: checkedAttributes },
  })
}

function ChoiceLabel({ render, ...props }: UseRenderComponentProps<"span">) {
  useChoiceContext("Questionnaire.ChoiceLabel")

  return useRender({ defaultTagName: "span", props, render })
}

function ChoiceShortcut({ children, render, ...props }: UseRenderComponentProps<"span", { shortcut: string | null }>) {
  const { state } = useChoiceContext("Questionnaire.ChoiceShortcut")

  return useRender({
    defaultTagName: "span",
    props: mergeProps({ "aria-hidden": true, children: children ?? state.shortcut, hidden: state.shortcut === null }, props),
    render,
    state: { shortcut: state.shortcut },
  })
}

const Input = forwardRef<InputProps>(({ defaultValue, disabled = false, onChange, render, type = "text", value, ...props }, ref) => {
  const { inputProps, inputRef, state } = useQuestionnaireInput({ defaultValue, disabled, onChange, type, value })
  const setRef = useComposedRefs<HTMLInputElement>(inputRef, ref)
  useRemoveEmptyName(inputRef, inputProps.name)

  return useRender({
    defaultTagName: "input",
    props: mergeProps({ ...inputProps, ref: setRef }, props),
    render,
    state,
    stateAttributesMapping: { filled: (isFilled) => ({ "data-empty": isFilled ? undefined : "", "data-filled": isFilled ? "" : undefined }) },
  })
})

function ErrorMessage({ children, id, render, ...props }: WithId<UseRenderComponentProps<"p", Pick<ItemState, "invalid">>>) {
  const { invalid, registerError, required } = useItemContext("Questionnaire.Error")
  const generatedId = useId()
  const errorId = id ?? generatedId

  useLayoutEffect(() => registerError(errorId), [errorId, registerError])

  return useRender({
    defaultTagName: "p",
    props: mergeProps(
      {
        children: children ?? (required ? "Choose an answer to continue." : "Choose an answer or skip this question."),
        hidden: !invalid,
        id: errorId,
        role: invalid ? "alert" : undefined,
      },
      props
    ),
    render,
    state: { invalid },
  })
}

function useRenderNavigationButton({
  children,
  disabled,
  onClick,
  props,
  render,
  shortcut,
  status,
  tabIndex,
  type,
  visible,
}: {
  children: ComponentChildren
  disabled: boolean
  onClick?: (event: Event) => void
  props: Record<string, any>
  render: NavigationProps["render"]
  shortcut?: "Enter"
  status: NavigationState["status"]
  tabIndex: number | undefined
  type: "button" | "reset" | "submit"
  visible: boolean
}) {
  const activeShortcut = visible && !disabled ? (shortcut ?? null) : null
  const state: NavigationState = { disabled, shortcut: activeShortcut, status, visible }

  return useRender({
    defaultTagName: "button",
    props: mergeProps(
      {
        "aria-hidden": !visible || undefined,
        "aria-keyshortcuts": activeShortcut ?? undefined,
        children,
        disabled,
        hidden: !visible,
        inert: !visible,
        onClick,
        tabIndex: visible ? tabIndex : -1,
        type,
      },
      props
    ),
    render,
    state,
    stateAttributesMapping: { visible: (isVisible) => ({ "data-hidden": isVisible ? undefined : "", "data-visible": isVisible ? "" : undefined }) },
  })
}

// Previous, Skip and Next run their action unless the click was prevented
function navigationButton(
  name: string,
  label: string,
  defaultType: "button" | "submit",
  isVisible: (context: RootContext) => boolean,
  action?: (context: RootContext) => void,
  shortcut?: "Enter"
) {
  return function NavigationButton({
    children,
    disabled = false,
    onClick,
    render,
    tabIndex,
    type = defaultType,
    ...props
  }: NavigationProps) {
    const context = useRootContext(name)

    return useRenderNavigationButton({
      children: children ?? label,
      disabled,
      onClick: action
        ? (event) => {
            ;(onClick as ((event: Event) => void) | undefined)?.(event)
            if (!event.defaultPrevented) action(context)
          }
        : (onClick as ((event: Event) => void) | undefined),
      props,
      render,
      shortcut,
      status: context.activeItemStatus,
      tabIndex,
      type,
      visible: isVisible(context),
    })
  }
}

const Previous = navigationButton("Questionnaire.Previous", "Previous", "button", (c) => c.total > 1 && !c.first, (c) => c.goPrevious())
const Skip = navigationButton("Questionnaire.Skip", "Skip", "button", (c) => c.activeItemRequired === false, (c) => c.skipCurrent())
const Next = navigationButton("Questionnaire.Next", "Next", "button", (c) => c.total > 1 && !c.last, (c) => c.goNext(), "Enter")
const Submit = navigationButton("Questionnaire.Submit", "Submit", "submit", (c) => c.total > 0 && c.last, undefined, "Enter")

const Questionnaire = { Root, Progress, Item, Title, Description, Choices, Choice, ChoiceInput, ChoiceLabel, ChoiceShortcut, Input, Error: ErrorMessage, Previous, Skip, Next, Submit }

export { Questionnaire }
export type { QuestionnaireChoiceDefinition, QuestionnaireInputType, QuestionnaireItemDefinition, QuestionnaireItemStatus, QuestionnaireShortcutMode }
