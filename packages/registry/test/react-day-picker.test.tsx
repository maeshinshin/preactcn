import { act, cleanup, fireEvent, render, screen } from "@testing-library/preact"
import { useState } from "preact/hooks"
import { describe, expect, test, vi } from "vitest"
import { DayPicker, getDefaultClassNames, useDayPicker, type DateRange, type DayPickerProps } from "../src/shims/react-day-picker"
import { es } from "../src/shims/react-day-picker-locale"

// Wednesday 14 October 2026: every test pins `today`, so the grid does not depend on the clock
const today = new Date(2026, 9, 14)
const settle = async () => {
  for (let i = 0; i < 3; i++) await act(async () => {})
}
const setup = async (props: DayPickerProps = {}) => {
  const view = render(<DayPicker today={today} {...props} />)
  await settle()
  return view
}
const cell = (iso: string) => document.querySelector<HTMLElement>(`[data-day="${iso}"]`)!
const day = (iso: string) => cell(iso).querySelector("button")!
const press = async (key: string, init: KeyboardEventInit = {}, target: Element = document.activeElement!) => {
  fireEvent.keyDown(target, { key, ...init })
  await settle()
}
const focus = async (element: HTMLElement) => {
  act(() => element.focus())
  await settle()
}
const click = async (element: Element) => {
  fireEvent.click(element)
  await settle()
}
const caption = () => document.querySelector('[role="status"]')!.textContent
const nextButton = () => screen.getByRole("button", { name: "Go to the Next Month" })
const previousButton = () => screen.getByRole("button", { name: "Go to the Previous Month" })

describe("markup", () => {
  test("renders a grid per month with the weekday headers, the day cells and a label per button", async () => {
    await setup()
    expect(document.querySelector(".rdp-root")).toHaveProperty("lang", "en-US")
    const grid = screen.getByRole("grid", { name: "October 2026" })
    expect(grid.getAttribute("aria-multiselectable")).toBe("false")
    expect(grid.querySelector("thead")?.getAttribute("aria-hidden")).toBe("true")
    expect([...grid.querySelectorAll("th")].map((th) => [th.textContent, th.getAttribute("aria-label"), th.getAttribute("scope")])).toEqual([
      ["Su", "Sunday", "col"],
      ["Mo", "Monday", "col"],
      ["Tu", "Tuesday", "col"],
      ["We", "Wednesday", "col"],
      ["Th", "Thursday", "col"],
      ["Fr", "Friday", "col"],
      ["Sa", "Saturday", "col"],
    ])
    expect(grid.querySelectorAll("tbody tr")).toHaveLength(5)
    expect(grid.querySelectorAll('[role="gridcell"]')).toHaveLength(35)
    expect(caption()).toBe("October 2026")
    expect(screen.getByRole("navigation", { name: "Navigation bar" })).toBeTruthy()
  })

  test("marks today, outside and hidden days with data attributes and the rdp class names", async () => {
    await setup({ mode: "single" })
    expect(cell("2026-10-14").className).toBe("rdp-day rdp-today")
    expect(cell("2026-10-14").dataset.today).toBe("true")
    expect(cell("2026-10-14").dataset.day).toBe("2026-10-14")
    expect(cell("2026-09-30").dataset).toMatchObject({ outside: "true", hidden: "true" })
    expect(cell("2026-09-30").textContent).toBe("")
    expect(day("2026-10-14").getAttribute("aria-label")).toBe("Today, Wednesday, October 14th, 2026")
    expect(day("2026-10-15").getAttribute("aria-label")).toBe("Thursday, October 15th, 2026")
  })

  test("shows the days of the neighbouring months only with showOutsideDays, marked outside", async () => {
    await setup({ mode: "single", showOutsideDays: true })
    const outside = document.querySelector<HTMLElement>('[data-day="2026-09-27"]')!
    expect(outside.dataset.outside).toBe("true")
    expect(outside.dataset.month).toBe("2026-09")
    expect(outside.className).toBe("rdp-day rdp-outside")
  })

  test("without a mode or onDayClick the days are labelled cells and not buttons", async () => {
    await setup()
    expect(document.querySelector("button[aria-label$='2026']")).toBeNull()
    expect(cell("2026-10-14").getAttribute("aria-label")).toBe("Today, Wednesday, October 14th, 2026")
    expect(cell("2026-10-14").textContent).toBe("14")
  })

  test("describes the picker on its root: mode, required, multiple months, week numbers, data-* pass-through, lang and ids", async () => {
    await setup({ mode: "range", required: true, selected: undefined, numberOfMonths: 2, showWeekNumber: true, id: "cal", lang: "fr", title: "Dates", "aria-label": "Trip", "data-extra": "1", dir: "rtl" } as DayPickerProps)
    const root = document.querySelector<HTMLElement>("#cal")!
    expect(root.dataset).toMatchObject({ mode: "range", required: "true", multipleMonths: "true", weekNumbers: "true", extra: "1" })
    expect([root.lang, root.title, root.getAttribute("aria-label"), root.dir]).toEqual(["fr", "Dates", "Trip", "rtl"])
    expect(screen.getAllByRole("grid")).toHaveLength(2)
    expect(screen.getAllByRole("grid")[0]!.getAttribute("aria-multiselectable")).toBe("true")
  })

  test("numbers the weeks in a row header with the locale's week rule", async () => {
    await setup({ showWeekNumber: true, weekStartsOn: 1, firstWeekContainsDate: 4 })
    const heads = [...document.querySelectorAll("tbody th")]
    expect(heads.map((th) => [th.textContent, th.getAttribute("aria-label"), th.getAttribute("role")])).toEqual([
      ["40", "Week 40", "rowheader"],
      ["41", "Week 41", "rowheader"],
      ["42", "Week 42", "rowheader"],
      ["43", "Week 43", "rowheader"],
      ["44", "Week 44", "rowheader"],
    ])
    expect(document.querySelector("thead th")?.getAttribute("aria-label")).toBe("Week Number")
  })

  test("fixedWeeks pads every month to six weeks", async () => {
    await setup({ fixedWeeks: true, showOutsideDays: true, defaultMonth: new Date(2026, 1, 1), numberOfMonths: 2 })
    expect([...document.querySelectorAll("tbody")].map((body) => body.querySelectorAll("tr").length)).toEqual([6, 6])
  })

  test("getDefaultClassNames lists the rdp- class of every part", () => {
    expect(getDefaultClassNames()).toMatchObject({ root: "rdp-root", button_next: "rdp-button_next", day_button: "rdp-day_button", range_middle: "rdp-range_middle", dropdown_root: "rdp-dropdown_root" })
  })
})

describe("modifiers", () => {
  test("disabled days are real disabled buttons, hidden days render nothing", async () => {
    await setup({ mode: "single", disabled: { dayOfWeek: 0 }, hidden: { before: new Date(2026, 9, 5) } })
    expect(day("2026-10-11").hasAttribute("disabled")).toBe(true)
    expect(cell("2026-10-11").dataset.disabled).toBe("true")
    expect(cell("2026-10-11").className).toBe("rdp-day rdp-disabled")
    expect(cell("2026-10-02").dataset.hidden).toBe("true")
    expect(cell("2026-10-02").textContent).toBe("")
    expect(day("2026-10-12").hasAttribute("disabled")).toBe(false)
  })

  test.each<[string, DayPickerProps["disabled"], string[]]>([
    ["a function", (date: Date) => date.getDate() === 3, ["2026-10-03"]],
    ["a date list", [new Date(2026, 9, 3), new Date(2026, 9, 4)], ["2026-10-03", "2026-10-04"]],
    ["before", { before: new Date(2026, 9, 3) }, ["2026-10-01", "2026-10-02"]],
    ["after", { after: new Date(2026, 9, 29) }, ["2026-10-30", "2026-10-31"]],
    ["a closed interval", { after: new Date(2026, 9, 1), before: new Date(2026, 9, 5) }, ["2026-10-02", "2026-10-03", "2026-10-04"]],
    ["an open interval", { before: new Date(2026, 9, 3), after: new Date(2026, 9, 29) }, ["2026-10-01", "2026-10-02", "2026-10-30", "2026-10-31"]],
    ["a range", { from: new Date(2026, 9, 6), to: new Date(2026, 9, 7) }, ["2026-10-06", "2026-10-07"]],
    ["weekdays", { dayOfWeek: [3, 6] }, ["2026-10-03", "2026-10-07", "2026-10-10", "2026-10-14", "2026-10-17", "2026-10-21", "2026-10-24", "2026-10-28", "2026-10-31"]],
    ["a mix", [new Date(2026, 9, 1), { dayOfWeek: 5 }], ["2026-10-01", "2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"]],
  ])("matches %s", async (_, disabled, expected) => {
    await setup({ mode: "single", disabled })
    const found = [...document.querySelectorAll<HTMLElement>("[data-disabled]:not([data-outside])")].map((td) => td.dataset.day)
    expect(found).toEqual(expected)
  })

  test("custom modifiers add their class name, own classNames replace the defaults key by key", async () => {
    await setup({
      mode: "single",
      selected: new Date(2026, 9, 12),
      modifiers: { booked: [new Date(2026, 9, 3)], never: undefined },
      modifiersClassNames: { booked: "is-booked" },
      classNames: { root: "R", day: "D", today: "T", selected: "S" },
      className: "mine",
    })
    expect(document.querySelector(".R")?.className).toBe("R mine")
    expect(cell("2026-10-03").className).toBe("D is-booked")
    expect(cell("2026-10-12").className).toBe("D S")
    expect(cell("2026-10-14").className).toBe("D T")
  })
})

describe("selection", () => {
  test("single: reports the clicked day with the modifiers and the event", async () => {
    const onSelect = vi.fn()
    await setup({ mode: "single", onSelect })
    await click(day("2026-10-12"))
    expect(onSelect).toHaveBeenCalledOnce()
    const [selected, trigger, modifiers, event] = onSelect.mock.calls[0]!
    expect([selected, trigger]).toEqual([new Date(2026, 9, 12), new Date(2026, 9, 12)])
    expect(modifiers).toMatchObject({ disabled: false, today: false, selected: undefined })
    expect(event.type).toBe("click")
  })

  test("single, uncontrolled: keeps the selection itself and toggles it", async () => {
    await setup({ mode: "single" })
    await click(day("2026-10-12"))
    expect(cell("2026-10-12").getAttribute("aria-selected")).toBe("true")
    expect(cell("2026-10-12").dataset.selected).toBe("true")
    expect(cell("2026-10-12").className).toBe("rdp-day rdp-focused rdp-selected")
    expect(day("2026-10-12").getAttribute("aria-label")).toBe("Monday, October 12th, 2026, selected")
    await click(day("2026-10-12"))
    expect(cell("2026-10-12").hasAttribute("aria-selected")).toBe(false)
  })

  test("single, controlled: onSelect gets the new value and the picker shows what the parent passes", async () => {
    const seen: unknown[] = []
    function App() {
      const [selected, setSelected] = useState<Date | undefined>(new Date(2026, 9, 12))
      return (
        <DayPicker
          today={today}
          mode="single"
          selected={selected}
          onSelect={(value, trigger) => {
            seen.push([value, trigger])
            setSelected(value)
          }}
        />
      )
    }
    render(<App />)
    await settle()
    await click(day("2026-10-20"))
    expect(seen[0]).toEqual([new Date(2026, 9, 20), new Date(2026, 9, 20)])
    expect(cell("2026-10-20").getAttribute("aria-selected")).toBe("true")
    expect(cell("2026-10-12").hasAttribute("aria-selected")).toBe(false)
    await click(day("2026-10-20"))
    expect(seen[1]).toEqual([undefined, new Date(2026, 9, 20)])
  })

  test("single, required: a second click keeps the day selected", async () => {
    const onSelect = vi.fn()
    await setup({ mode: "single", required: true, selected: new Date(2026, 9, 12), onSelect })
    await click(day("2026-10-12"))
    expect(onSelect.mock.calls[0]![0]).toEqual(new Date(2026, 9, 12))
  })

  test("a disabled day cannot be clicked", async () => {
    const onSelect = vi.fn()
    await setup({ mode: "single", disabled: new Date(2026, 9, 12), onSelect })
    await click(day("2026-10-12"))
    expect(onSelect).not.toHaveBeenCalled()
  })

  test("multiple: toggles days, respects max (starts over) and min (keeps the last ones)", async () => {
    await setup({ mode: "multiple", max: 2, min: 1 })
    await click(day("2026-10-01"))
    await click(day("2026-10-02"))
    await click(day("2026-10-03"))
    expect([...document.querySelectorAll("[aria-selected]")].map((td) => (td as HTMLElement).dataset.day)).toEqual(["2026-10-03"])
    await click(day("2026-10-03"))
    expect(document.querySelectorAll("[aria-selected]")).toHaveLength(1)
    await click(day("2026-10-05"))
    await click(day("2026-10-05"))
    expect([...document.querySelectorAll("[aria-selected]")].map((td) => (td as HTMLElement).dataset.day)).toEqual(["2026-10-03"])
  })

  test("range: first click starts the range, the second ends it, with start, middle and end marked", async () => {
    const onSelect = vi.fn()
    function App() {
      const [selected, setSelected] = useState<DateRange | undefined>()
      return <DayPicker today={today} mode="range" selected={selected} onSelect={(range, trigger, modifiers, e) => (onSelect(range, trigger, modifiers, e.type), setSelected(range))} />
    }
    render(<App />)
    await settle()
    await click(day("2026-10-05"))
    expect(onSelect.mock.calls[0]![0]).toEqual({ from: new Date(2026, 9, 5), to: new Date(2026, 9, 5) })
    await click(day("2026-10-08"))
    expect(onSelect.mock.calls[1]![0]).toEqual({ from: new Date(2026, 9, 5), to: new Date(2026, 9, 8) })
    expect(onSelect.mock.calls[1]![3]).toBe("click")
    expect(cell("2026-10-05").className).toBe("rdp-day rdp-selected rdp-range_start")
    expect(cell("2026-10-06").className).toBe("rdp-day rdp-selected rdp-range_middle")
    expect(cell("2026-10-08").className).toBe("rdp-day rdp-focused rdp-selected rdp-range_end")
    expect(cell("2026-10-09").className).toBe("rdp-day")
    await click(day("2026-10-03")) // before the start: extends the start
    expect(onSelect.mock.calls[2]![0]).toEqual({ from: new Date(2026, 9, 3), to: new Date(2026, 9, 8) })
  })

  test("range with min: a one-day click waits for the end", async () => {
    await setup({ mode: "range", min: 2 })
    await click(day("2026-10-05"))
    expect(cell("2026-10-05").className).toBe("rdp-day rdp-focused rdp-selected")
    await click(day("2026-10-07"))
    expect(cell("2026-10-07").className).toBe("rdp-day rdp-focused rdp-selected rdp-range_end")
  })

  test("onDayClick fires for a day, also without a mode", async () => {
    const onDayClick = vi.fn()
    await setup({ onDayClick })
    await click(day("2026-10-12"))
    expect(onDayClick.mock.calls[0]!.slice(0, 2)).toEqual([new Date(2026, 9, 12), expect.objectContaining({ disabled: false, today: false })])
  })
})

describe("month navigation", () => {
  test("previous and next move the month, report it and update the caption and the grid label", async () => {
    const onMonthChange = vi.fn()
    const onNextClick = vi.fn()
    const onPrevClick = vi.fn()
    await setup({ onMonthChange, onNextClick, onPrevClick })
    await click(nextButton())
    expect(caption()).toBe("November 2026")
    expect(screen.getByRole("grid").getAttribute("aria-label")).toBe("November 2026")
    expect(onNextClick).toHaveBeenCalledWith(new Date(2026, 10, 1))
    await click(previousButton())
    await click(previousButton())
    expect(caption()).toBe("September 2026")
    expect(onMonthChange.mock.calls.map(([month]) => month)).toEqual([new Date(2026, 10, 1), new Date(2026, 9, 1), new Date(2026, 8, 1)])
    expect(onPrevClick).toHaveBeenCalledTimes(2)
  })

  test("stops at startMonth and endMonth: the button is aria-disabled, leaves the tab order and does nothing", async () => {
    const onMonthChange = vi.fn()
    await setup({ startMonth: new Date(2026, 9, 1), endMonth: new Date(2026, 10, 1), onMonthChange })
    const previous = previousButton()
    expect([previous.getAttribute("aria-disabled"), previous.getAttribute("tabindex")]).toEqual(["true", "-1"])
    await click(previous)
    expect(onMonthChange).not.toHaveBeenCalled()
    await click(nextButton())
    expect(caption()).toBe("November 2026")
    expect(nextButton().getAttribute("aria-disabled")).toBe("true")
    await click(nextButton())
    expect(caption()).toBe("November 2026")
  })

  test("a controlled month changes only when the parent says so", async () => {
    const onMonthChange = vi.fn()
    const view = render(<DayPicker today={today} month={new Date(2027, 0, 15)} onMonthChange={onMonthChange} />)
    await settle()
    expect(caption()).toBe("January 2027")
    await click(nextButton())
    expect(onMonthChange).toHaveBeenCalledWith(new Date(2027, 1, 1))
    expect(caption()).toBe("January 2027")
    view.rerender(<DayPicker today={today} month={new Date(2027, 1, 1)} onMonthChange={onMonthChange} />)
    await settle()
    expect(caption()).toBe("February 2027")
  })

  test("numberOfMonths with pagedNavigation moves by the page and never shows months past endMonth", async () => {
    await setup({ numberOfMonths: 3, pagedNavigation: true, endMonth: new Date(2027, 1, 1) })
    expect([...document.querySelectorAll('[role="status"]')].map((el) => el.textContent)).toEqual(["October 2026", "November 2026", "December 2026"])
    await click(nextButton())
    expect([...document.querySelectorAll('[role="status"]')].map((el) => el.textContent)).toEqual(["January 2027", "February 2027"])
    expect(nextButton().getAttribute("aria-disabled")).toBe("true")
  })

  test("disableNavigation and hideNavigation", async () => {
    const view = await setup({ disableNavigation: true })
    expect(nextButton().getAttribute("aria-disabled")).toBe("true")
    view.rerender(<DayPicker today={today} hideNavigation hideWeekdays />)
    await settle()
    expect(document.querySelector("nav")).toBeNull()
    expect(document.querySelector("thead")).toBeNull()
  })

  test("defaultMonth starts the picker elsewhere, and an end limit before the shown months moves them back", async () => {
    await setup({ defaultMonth: new Date(2026, 2, 20), numberOfMonths: 2, endMonth: new Date(2026, 2, 1) })
    expect([...document.querySelectorAll('[role="status"]')].map((el) => el.textContent)).toEqual(["February 2026", "March 2026"])
  })
})

describe("dropdowns", () => {
  const props: DayPickerProps = { captionLayout: "dropdown", startMonth: new Date(2025, 2, 1), endMonth: new Date(2027, 5, 1), defaultMonth: new Date(2026, 9, 1) }

  test("render a month and a year select, with the caption kept for screen readers", async () => {
    await setup(props)
    const months = screen.getByRole("combobox", { name: "Choose the Month" }) as HTMLSelectElement
    const years = screen.getByRole("combobox", { name: "Choose the Year" }) as HTMLSelectElement
    expect(months.options).toHaveLength(12)
    expect([...years.options].map((option) => option.textContent)).toEqual(["2025", "2026", "2027"])
    expect(months.className).toBe("rdp-dropdown rdp-months_dropdown")
    expect(months.closest(".rdp-dropdown_root")?.getAttribute("data-disabled")).toBe("false")
    expect(months.closest(".rdp-dropdowns")?.querySelector('[role="status"]')?.textContent).toBe("October 2026")
    expect(months.nextElementSibling?.textContent).toBe("October")
    expect(months.nextElementSibling?.getAttribute("aria-hidden")).toBe("true")
  })

  test("disable the months outside the navigation range", async () => {
    await setup({ ...props, defaultMonth: new Date(2027, 5, 1) })
    const months = screen.getByRole("combobox", { name: "Choose the Month" }) as HTMLSelectElement
    expect([...months.options].filter((option) => option.disabled).map((option) => option.textContent)).toEqual(["July", "August", "September", "October", "November", "December"])
  })

  test("choosing a month or a year moves the picker", async () => {
    const onMonthChange = vi.fn()
    await setup({ ...props, onMonthChange })
    const months = screen.getByRole("combobox", { name: "Choose the Month" }) as HTMLSelectElement
    const years = screen.getByRole("combobox", { name: "Choose the Year" }) as HTMLSelectElement
    fireEvent.change(months, { target: { value: "1" } })
    await settle()
    expect(caption()).toBe("February 2026")
    fireEvent.change(years, { target: { value: "2027" } })
    await settle()
    expect(caption()).toBe("February 2027")
    expect(onMonthChange.mock.calls.map(([month]) => month)).toEqual([new Date(2026, 1, 1), new Date(2027, 1, 1)])
    expect(screen.getByRole("combobox", { name: "Choose the Year" }).nextElementSibling?.textContent).toBe("2027")
  })

  test("a year dropdown without limits spans the last 100 years up to the end of this year", async () => {
    await setup({ captionLayout: "dropdown-years" })
    const years = screen.getByRole("combobox", { name: "Choose the Year" }) as HTMLSelectElement
    expect([years.options[0]?.textContent, years.options[years.options.length - 1]?.textContent, years.options.length]).toEqual(["1926", "2026", 101])
    expect(screen.queryByRole("combobox", { name: "Choose the Month" })).toBeNull()
    expect(document.querySelector(".rdp-dropdowns > span:not([role])")?.textContent).toBe("October")
  })

  test("in a month dropdown with several months, each select moves its own month", async () => {
    await setup({ ...props, captionLayout: "dropdown-months", numberOfMonths: 2 })
    const months = screen.getAllByRole("combobox", { name: "Choose the Month" }) as HTMLSelectElement[]
    fireEvent.change(months[1]!, { target: { value: "5" } })
    await settle()
    expect([...document.querySelectorAll('[role="status"]')].map((el) => el.textContent)).toEqual(["May 2026", "June 2026"])
  })
})

describe("keyboard", () => {
  const focused = () => (document.activeElement as HTMLElement).closest<HTMLElement>("[data-day]")?.dataset.day

  test("only today's day is in the tab order", async () => {
    await setup({ mode: "single" })
    expect([...document.querySelectorAll("button[tabindex='0']")].map((b) => (b.closest("[data-day]") as HTMLElement).dataset.day)).toEqual(["2026-10-14"])
  })

  test("the selected day wins over today, and the first enabled day is the fallback", async () => {
    await setup({ mode: "single", selected: new Date(2026, 9, 21) })
    expect(document.querySelector("button[tabindex='0']")).toBe(day("2026-10-21"))
    cleanup()
    await setup({ today: new Date(2025, 0, 1), defaultMonth: new Date(2026, 9, 1), mode: "single", disabled: { before: new Date(2026, 9, 3) } })
    expect(document.querySelector("button[tabindex='0']")).toBe(day("2026-10-03"))
  })

  test.each<[string, KeyboardEventInit, string]>([
    ["ArrowRight", {}, "2026-10-15"],
    ["ArrowLeft", {}, "2026-10-13"],
    ["ArrowDown", {}, "2026-10-21"],
    ["ArrowUp", {}, "2026-10-07"],
    ["Home", {}, "2026-10-11"],
    ["End", {}, "2026-10-17"],
    ["PageDown", {}, "2026-11-14"],
    ["PageUp", {}, "2026-09-14"],
    ["PageDown", { shiftKey: true }, "2027-10-14"],
    ["PageUp", { shiftKey: true }, "2025-10-14"],
    ["ArrowRight", { shiftKey: true }, "2026-11-14"],
    ["ArrowDown", { shiftKey: true }, "2027-10-14"],
  ])("%s %j moves focus to %s", async (key, init, expected) => {
    await setup({ mode: "single", showOutsideDays: true, startMonth: new Date(2020, 0, 1), endMonth: new Date(2030, 0, 1) })
    await focus(day("2026-10-14"))
    await press(key, init)
    expect(focused()).toBe(expected)
  })

  test("moving past the end of the month shows the next month and keeps the focus on the day", async () => {
    await setup({ mode: "single" })
    await focus(day("2026-10-31"))
    await press("ArrowRight")
    expect(caption()).toBe("November 2026")
    expect(focused()).toBe("2026-11-01")
  })

  test("skips disabled days, stops at the navigation limits and swaps the horizontal keys in rtl", async () => {
    const view = await setup({ mode: "single", disabled: [new Date(2026, 9, 15), new Date(2026, 9, 16)], endMonth: new Date(2026, 9, 31) })
    await focus(day("2026-10-14"))
    await press("ArrowRight")
    expect(focused()).toBe("2026-10-17")
    await focus(day("2026-10-31"))
    await press("ArrowRight")
    expect(focused()).toBe("2026-10-31")
    expect(caption()).toBe("October 2026")
    view.rerender(<DayPicker today={today} mode="single" dir="rtl" />)
    await settle()
    await focus(day("2026-10-14"))
    await press("ArrowRight")
    expect(focused()).toBe("2026-10-13")
  })

  test("handles the key only when it navigates, and tells onDayKeyDown either way", async () => {
    const onDayKeyDown = vi.fn()
    await setup({ mode: "single", onDayKeyDown })
    await focus(day("2026-10-14"))
    const arrow = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })
    day("2026-10-14").dispatchEvent(arrow)
    const letter = new KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true })
    day("2026-10-15").dispatchEvent(letter)
    await settle()
    expect([arrow.defaultPrevented, letter.defaultPrevented]).toEqual([true, false])
    expect(onDayKeyDown).toHaveBeenCalledTimes(2)
  })

  test("Enter and Space select through the button's own click", async () => {
    await setup({ mode: "single" })
    await focus(day("2026-10-14"))
    await click(document.activeElement!)
    expect(cell("2026-10-14").getAttribute("aria-selected")).toBe("true")
  })

  test("the tab stop stays where it was while a day has focus and moves to the day that lost it", async () => {
    await setup({ mode: "single" })
    await focus(day("2026-10-20"))
    expect(cell("2026-10-20").dataset.focused).toBe("true")
    expect(document.querySelector("button[tabindex='0']")).toBe(day("2026-10-14"))
    ;(document.activeElement as HTMLElement).blur()
    await settle()
    expect(document.querySelector("[data-focused]")).toBeNull()
    expect(document.querySelector("button[tabindex='0']")).toBe(day("2026-10-20"))
  })

  test("the day that lost focus is the tab stop before the selected day and today", async () => {
    await setup({ mode: "single", selected: new Date(2026, 9, 21) })
    expect(document.querySelector("button[tabindex='0']")).toBe(day("2026-10-21"))
    await focus(day("2026-10-20"))
    ;(document.activeElement as HTMLElement).blur()
    await settle()
    expect(document.querySelector("button[tabindex='0']")).toBe(day("2026-10-20"))
  })

  test("does not move before the first month the navigation reaches", async () => {
    await setup({ mode: "single", startMonth: new Date(2026, 9, 1) })
    await focus(day("2026-10-01"))
    await press("ArrowLeft")
    await press("PageUp")
    expect(document.activeElement).toBe(day("2026-10-01"))
    expect(caption()).toBe("October 2026")
  })

  test("autoFocus puts focus on the first focusable day once mounted", async () => {
    await setup({ mode: "single", autoFocus: true })
    expect(document.activeElement).toBe(day("2026-10-14"))
  })

  test("focus moves to a day of the new month when the shown months change under it", async () => {
    await setup({ mode: "single" })
    await focus(day("2026-10-14"))
    await click(nextButton())
    await settle()
    expect(caption()).toBe("November 2026")
    expect(document.querySelector("button[tabindex='0']")).toBe(day("2026-11-01"))
  })
})

describe("customisation", () => {
  test("components replace the defaults and receive the day, its modifiers and the shared pieces", async () => {
    const seen: string[] = []
    await setup({
      mode: "single",
      selected: new Date(2026, 9, 12),
      components: {
        DayButton: ({ day, modifiers, children, ...props }) => {
          if (day.isoDate === "2026-10-12") seen.push(`${modifiers.selected}/${modifiers.today}/${day.outside}`)
          return (
            <button data-custom {...props}>
              {children}!
            </button>
          )
        },
        Chevron: ({ orientation }) => <i data-orientation={orientation} />,
        Root: ({ rootRef, ...props }) => <div data-slot="calendar" ref={rootRef} {...props} />,
      },
    })
    expect(document.querySelector("[data-slot=calendar]")?.className).toBe("rdp-root")
    expect(day("2026-10-12").textContent).toBe("12!")
    expect(day("2026-10-12").hasAttribute("data-custom")).toBe(true)
    expect(seen).toContain("true/false/false")
    expect([...document.querySelectorAll("nav i")].map((i) => i.getAttribute("data-orientation"))).toEqual(["left", "right"])
  })

  test("a custom DayButton that focuses itself keeps keyboard navigation working", async () => {
    await setup({
      mode: "single",
      components: { DayButton: ({ day, modifiers, ...props }) => <button ref={(el) => void (modifiers.focused && el?.focus())} {...props} /> },
    })
    await focus(day("2026-10-14"))
    await press("ArrowDown")
    expect(document.activeElement).toBe(day("2026-10-21"))
  })

  test("formatters and labels replace the text", async () => {
    await setup({
      mode: "single",
      formatters: { formatCaption: (month) => `M${month.getMonth()}`, formatDay: (date) => `d${date.getDate()}`, formatWeekdayName: (date) => `w${date.getDay()}` },
      labels: { labelNext: () => "Later", labelPrevious: () => "Earlier", labelNav: () => "Months" },
    })
    expect(caption()).toBe("M9")
    expect(day("2026-10-02").textContent).toBe("d2")
    expect(document.querySelector("th")?.textContent).toBe("w0")
    expect([screen.getByRole("button", { name: "Later" }), screen.getByRole("button", { name: "Earlier" }), screen.getByRole("navigation", { name: "Months" })]).toHaveLength(3)
  })

  test("a locale sets the language, the weekday order, the month names and its translated labels", async () => {
    await setup({ mode: "single", locale: es, selected: new Date(2026, 9, 12), showWeekNumber: true })
    expect(document.querySelector<HTMLElement>(".rdp-root")?.lang).toBe("es")
    expect(caption()).toBe("octubre 2026")
    expect([...document.querySelectorAll("thead th")].map((th) => th.getAttribute("aria-label"))).toEqual(["Número de semana", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"])
    expect(screen.getByRole("button", { name: "Ir al mes siguiente" })).toBeTruthy()
    expect(screen.getByRole("navigation", { name: "Barra de navegación" })).toBeTruthy()
    expect(day("2026-10-12").getAttribute("aria-label")).toBe("lunes, 12 de octubre de 2026, seleccionado")
    expect(day("2026-10-14").getAttribute("aria-label")).toBe("Hoy, miércoles, 14 de octubre de 2026")
    expect(document.querySelector("tbody th")?.getAttribute("aria-label")).toBe("Semana 40")
  })

  test("a plain date-fns locale translates the names and keeps the English labels", async () => {
    const { fr } = await import("date-fns/locale")
    await setup({ locale: fr })
    expect(caption()).toBe("octobre 2026")
    expect(screen.getByRole("button", { name: "Go to the Next Month" })).toBeTruthy()
  })

  test("a locale of years first writes the caption as year and month", async () => {
    const { ja } = await import("date-fns/locale")
    await setup({ locale: ja, captionLayout: "dropdown" })
    expect(caption()).toBe("2026年10月")
    expect([...document.querySelectorAll(".rdp-dropdowns select")].map((s) => s.className)).toEqual(["rdp-dropdown rdp-years_dropdown", "rdp-dropdown rdp-months_dropdown"])
  })

  test("weekStartsOn changes the first weekday", async () => {
    await setup({ weekStartsOn: 1 })
    expect(document.querySelector("thead th")?.textContent).toBe("Mo")
  })

  test("useDayPicker needs a DayPicker above it", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    function Lonely() {
      useDayPicker()
      return null
    }
    expect(() => render(<Lonely />)).toThrow("useDayPicker() must be used within a custom component.")
    spy.mockRestore()
  })
})

describe("timeZone", () => {
  test("today and the selection are read in that zone", async () => {
    // 20:00 UTC on the 14th is already the 15th, 10:00 in Kiritimati (UTC+14)
    const now = new Date("2026-10-14T20:00:00Z")
    await setup({ today: now, timeZone: "Pacific/Kiritimati", mode: "single", selected: new Date("2026-10-19T20:00:00Z") })
    expect(document.querySelector<HTMLElement>("[data-today]")?.dataset.day).toBe("2026-10-15")
    expect(document.querySelector<HTMLElement>("[aria-selected]")?.dataset.day).toBe("2026-10-20")
  })

  test("disabled matchers are read in that zone as well", async () => {
    await setup({ timeZone: "Pacific/Kiritimati", mode: "single", disabled: new Date("2026-10-19T20:00:00Z"), today })
    expect(document.querySelector<HTMLElement>("[data-disabled]")?.dataset.day).toBe("2026-10-20")
  })
})
