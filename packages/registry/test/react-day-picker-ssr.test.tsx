// @vitest-environment node
import { renderToString } from "preact-render-to-string"
import { describe, expect, test } from "vitest"
import { DayPicker } from "../src/shims/react-day-picker"
import { es } from "../src/shims/react-day-picker-locale"

const today = new Date(2026, 9, 14)

// No window or document here: any DOM access while rendering would throw
describe("server rendering", () => {
  test("renders the grid with its roles, labels and the roving tab stop", () => {
    const html = renderToString(<DayPicker today={today} mode="single" selected={new Date(2026, 9, 12)} />)
    expect(html).toContain('<div class="rdp-root" lang="en-US" data-mode="single"')
    expect(html).toContain('<nav class="rdp-nav" aria-label="Navigation bar">')
    expect(html).toContain('role="grid" aria-multiselectable="false" aria-label="October 2026"')
    expect(html).toContain('<thead aria-hidden="true">')
    expect(html).toContain('<th aria-label="Monday" class="rdp-weekday" scope="col">Mo</th>')
    expect(html).toContain('<td class="rdp-day rdp-selected" role="gridcell" aria-selected="true" data-day="2026-10-12" data-selected="true">')
    expect(html).toContain('<button class="rdp-day_button" type="button" tabindex="0" aria-label="Monday, October 12th, 2026, selected">12</button>')
    expect(html).toContain('<td class="rdp-day rdp-today" role="gridcell" data-day="2026-10-14" data-today="true"><button class="rdp-day_button" type="button" tabindex="-1" aria-label="Today, Wednesday, October 14th, 2026">14</button>')
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
  })

  test("renders dropdowns with the current month and year selected", () => {
    const html = renderToString(<DayPicker today={today} captionLayout="dropdown" startMonth={new Date(2025, 0, 1)} endMonth={new Date(2027, 11, 1)} />)
    expect(html).toContain('<select class="rdp-dropdown rdp-months_dropdown" aria-label="Choose the Month"')
    expect(html).toContain('<option selected value="9">October</option>')
    expect(html).toContain('<option selected value="2026">2026</option>')
    expect(html).toContain('<span role="status" aria-live="polite"')
  })

  test("renders week numbers, a locale and several months", () => {
    const html = renderToString(<DayPicker today={today} locale={es} showWeekNumber numberOfMonths={2} />)
    expect(html).toContain('lang="es"')
    expect(html).toContain('<th aria-label="Número de semana" class="rdp-week_number_header" scope="col"></th>')
    expect(html).toContain('aria-label="Semana 40" class="rdp-week_number" scope="row" role="rowheader">40</th>')
    expect(html).toContain('aria-label="noviembre 2026"')
    expect(html.match(/role="grid"/g)).toHaveLength(2)
  })

  test("renders a time zone's today without a document", () => {
    const html = renderToString(<DayPicker today={new Date("2026-10-14T20:00:00Z")} timeZone="Pacific/Kiritimati" mode="single" />)
    expect(html).toMatch(/data-day="2026-10-15" data-today="true"/)
  })
})
