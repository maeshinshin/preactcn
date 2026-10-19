// Derived from react-day-picker 10.0.2, Copyright (c) 2014-2026 Giampaolo Bellavite <io@gpbl.dev> and contributors, MIT License (https://opensource.org/license/mit)
import { TZDate } from "@date-fns/tz"
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  eachMonthOfInterval,
  eachYearOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  getMonth,
  getWeek,
  getYear,
  isAfter,
  isBefore,
  isDate,
  isSameDay,
  isSameMonth,
  max,
  min,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
  type EndOfWeekOptions,
  type FormatOptions,
  type Locale as DateFnsLocale,
  type StartOfWeekOptions,
} from "date-fns"
import { enUS } from "date-fns/locale/en-US"

// react-day-picker 10.0.2 without React: the same date model, class names, modifiers and focus rules, on date-fns.
// shortcut: no ISOWeek, broadcastCalendar, numerals, noonSafe, custom dateLib or `useAdditional*Tokens`; port the helper from react-day-picker when an app needs it.

export type Modifiers = Record<string, boolean>
export type DateRange = { from: Date | undefined; to?: Date | undefined }
export type DateBefore = { before: Date }
export type DateAfter = { after: Date }
export type DateInterval = { before: Date; after: Date }
export type DayOfWeek = { dayOfWeek: number | number[] }
export type Matcher = boolean | ((date: Date) => boolean) | Date | Date[] | DateRange | DateBefore | DateAfter | DateInterval | DayOfWeek
export type MoveFocusBy = "day" | "week" | "startOfWeek" | "endOfWeek" | "month" | "year"
export type MoveFocusDir = "after" | "before"

// the order of flagKeys is the order of the class names a day gets
const flagKeys = ["focused", "disabled", "hidden", "outside", "today"] as const
const rangeKeys = ["range_end", "range_middle", "range_start", "selected"] as const
const uiKeys = [
  "root", "chevron", "day", "day_button", "caption_label", "dropdowns", "dropdown", "dropdown_root", "month_grid", "month_caption",
  "months_dropdown", "month", "months", "nav", "button_next", "button_previous", "week", "weeks", "weekday", "weekdays", "week_number",
  "week_number_header", "years_dropdown",
] as const
export type ClassNames = Record<(typeof uiKeys)[number] | (typeof flagKeys)[number] | (typeof rangeKeys)[number], string>

export const getDefaultClassNames = (): ClassNames =>
  Object.fromEntries([...uiKeys, ...flagKeys, ...rangeKeys].map((key) => [key, `rdp-${key}`])) as ClassNames

export type DayPickerLocaleLabels = { [K in keyof Labels]?: string | Labels[K] }
export interface DayPickerLocale extends DateFnsLocale {
  labels?: DayPickerLocaleLabels
}
export type Locale = DayPickerLocale

export interface DateLibOptions extends FormatOptions, StartOfWeekOptions, EndOfWeekOptions {
  locale?: DayPickerLocale
  timeZone?: string
}

const yearFirstLocales = new Set([
  "eu", "hu", "ja", "ja-Hira", "ja-JP", "ko", "ko-KR", "lt", "lt-LT", "lv", "lv-LV", "mn", "mn-MN", "zh", "zh-CN", "zh-HK", "zh-TW",
])

// shortcut: only the methods the shim and the locale labels use; react-day-picker's DateLib wraps every date-fns function it calls
// react-day-picker's own en-US adds a navigation label and writes the grid label with a four digit year to date-fns' en-US; every other label equals the default
const defaultLocale: DayPickerLocale = {
  ...enUS,
  labels: { labelNav: "Navigation bar", labelGrid: (date, options, dateLib) => (dateLib ?? new DateLib(options)).format(date, "LLLL yyyy") },
}
export { defaultLocale }

export class DateLib {
  readonly options: DateLibOptions

  constructor(options?: DateLibOptions) {
    this.options = { locale: defaultLocale, ...options }
  }

  today = (): Date => (this.options.timeZone ? TZDate.tz(this.options.timeZone) : new Date())
  format = (date: Date, formatStr: string): string => format(date, formatStr, this.options)
  getMonth = (date: Date): number => getMonth(date, this.options)
  getYear = (date: Date): number => getYear(date, this.options)
  getWeek = (date: Date): number => getWeek(date, this.options)
  startOfWeek = (date: Date): Date => startOfWeek(date, this.options)
  endOfWeek = (date: Date): Date => endOfWeek(date, this.options)

  getMonthYearOrder = (): "month-first" | "year-first" => (yearFirstLocales.has(this.options.locale?.code ?? "") ? "year-first" : "month-first")

  formatMonthYear = (date: Date): string => {
    const { locale, timeZone } = this.options
    if (locale?.code && yearFirstLocales.has(locale.code)) {
      try {
        return new Intl.DateTimeFormat(locale.code, { month: "long", year: "numeric", timeZone }).format(date)
      } catch {
        // an unknown locale code falls back to the date-fns pattern below
      }
    }
    return this.format(date, this.getMonthYearOrder() === "year-first" ? "y LLLL" : "LLLL y")
  }
}
export const defaultDateLib = new DateLib()

export class CalendarDay {
  readonly date: Date
  readonly displayMonth: Date
  readonly dateLib: DateLib
  readonly outside: boolean
  readonly isoDate: string
  readonly displayMonthId: string
  readonly dateMonthId: string

  constructor(date: Date, displayMonth: Date, dateLib: DateLib = defaultDateLib) {
    this.date = date
    this.displayMonth = displayMonth
    this.dateLib = dateLib
    this.outside = Boolean(displayMonth && !isSameMonth(date, displayMonth))
    this.isoDate = dateLib.format(date, "yyyy-MM-dd")
    this.displayMonthId = dateLib.format(displayMonth, "yyyy-MM")
    this.dateMonthId = dateLib.format(date, "yyyy-MM")
  }

  isEqualTo(day: CalendarDay): boolean {
    return isSameDay(day.date, this.date) && isSameMonth(day.displayMonth, this.displayMonth)
  }
}
export type CalendarWeek = { weekNumber: number; days: CalendarDay[] }
export type CalendarMonth = { date: Date; weeks: CalendarWeek[] }

export const isDateRange = (value: unknown): value is DateRange => Boolean(value && typeof value === "object" && "from" in value)
const isDateInterval = (value: unknown): value is DateInterval => Boolean(value && typeof value === "object" && "before" in value && "after" in value)
const isDateAfter = (value: unknown): value is DateAfter => Boolean(value && typeof value === "object" && "after" in value)
const isDateBefore = (value: unknown): value is DateBefore => Boolean(value && typeof value === "object" && "before" in value)
const isDayOfWeek = (value: unknown): value is DayOfWeek => Boolean(value && typeof value === "object" && "dayOfWeek" in value)

export function rangeIncludesDate(range: DateRange, date: Date, excludeEnds = false): boolean {
  let { from, to } = range
  if (from && to) {
    if (differenceInCalendarDays(to, from) < 0) [from, to] = [to, from]
    const ends = excludeEnds ? 1 : 0
    return differenceInCalendarDays(date, from) >= ends && differenceInCalendarDays(to, date) >= ends
  }
  if (!excludeEnds && to) return isSameDay(to, date)
  if (!excludeEnds && from) return isSameDay(from, date)
  return false
}

export function dateMatchModifiers(date: Date, matchers: Matcher | Matcher[]): boolean {
  return (Array.isArray(matchers) ? matchers : [matchers]).some((matcher) => {
    if (typeof matcher === "boolean") return matcher
    if (isDate(matcher)) return isSameDay(date, matcher)
    if (isDatesArray(matcher)) return matcher.some((day) => isSameDay(date, day))
    if (isDateRange(matcher)) return rangeIncludesDate(matcher, date)
    if (isDayOfWeek(matcher)) return Array.isArray(matcher.dayOfWeek) ? matcher.dayOfWeek.includes(date.getDay()) : matcher.dayOfWeek === date.getDay()
    if (isDateInterval(matcher)) {
      const isDayBefore = differenceInCalendarDays(matcher.before, date) > 0
      const isDayAfter = differenceInCalendarDays(matcher.after, date) < 0
      return isAfter(matcher.before, matcher.after) ? isDayAfter && isDayBefore : isDayBefore || isDayAfter
    }
    if (isDateAfter(matcher)) return differenceInCalendarDays(date, matcher.after) > 0
    if (isDateBefore(matcher)) return differenceInCalendarDays(matcher.before, date) > 0
    if (typeof matcher === "function") return matcher(date)
    return false
  })
}
const isDatesArray = (value: unknown): value is Date[] => Array.isArray(value) && value.every(isDate)

export function addToRange(date: Date, initialRange: DateRange | undefined, min = 0, max = 0, required = false): DateRange | undefined {
  const { from, to } = initialRange || {}
  let range: DateRange | undefined
  if (!from && !to) {
    range = { from: date, to: min > 0 ? undefined : date }
  } else if (from && !to) {
    if (isSameDay(from, date)) range = min === 0 ? { from, to: date } : required ? { from, to: undefined } : undefined
    else if (isBefore(date, from)) range = { from: date, to: from }
    else range = { from, to: date }
  } else if (from && to) {
    if (isSameDay(from, date) && isSameDay(to, date)) range = required ? { from, to } : undefined
    else if (isSameDay(from, date)) range = { from, to: min > 0 ? undefined : date }
    else if (isSameDay(to, date)) range = { from: date, to: min > 0 ? undefined : date }
    else if (isBefore(date, from)) range = { from: date, to }
    else range = { from, to: date }
  }
  if (range?.from && range?.to) {
    const diff = differenceInCalendarDays(range.to, range.from)
    if ((max > 0 && diff > max) || (min > 1 && diff < min)) range = { from: date, to: undefined }
  }
  return range
}

export const toTimeZone = (date: Date, timeZone: string): Date => (date instanceof TZDate && date.timeZone === timeZone ? date : new TZDate(date, timeZone))

function convertMatcher(matcher: Matcher, timeZone: string): Matcher {
  if (typeof matcher === "boolean" || typeof matcher === "function") return matcher
  if (matcher instanceof Date) return toTimeZone(matcher, timeZone)
  if (Array.isArray(matcher)) return matcher.map((date) => toTimeZone(date, timeZone))
  if (isDateRange(matcher)) return { ...matcher, from: matcher.from && toTimeZone(matcher.from, timeZone), to: matcher.to && toTimeZone(matcher.to, timeZone) }
  if (isDateInterval(matcher)) return { before: toTimeZone(matcher.before, timeZone), after: toTimeZone(matcher.after, timeZone) }
  if (isDateAfter(matcher)) return { after: toTimeZone(matcher.after, timeZone) }
  if (isDateBefore(matcher)) return { before: toTimeZone(matcher.before, timeZone) }
  return matcher
}
export const convertMatchersToTimeZone = (matchers: Matcher | Matcher[] | undefined, timeZone: string) =>
  Array.isArray(matchers) ? matchers.map((matcher) => convertMatcher(matcher, timeZone)) : matchers && convertMatcher(matchers, timeZone)

type NavProps = { startMonth?: Date; endMonth?: Date; today?: Date; captionLayout?: string }

// the months the navigation may reach; a year dropdown without limits spans the 100 years before today up to the end of this year
export function getNavMonths(props: NavProps, dateLib: DateLib): [Date | undefined, Date | undefined] {
  let { startMonth, endMonth } = props
  const hasYearDropdown = props.captionLayout === "dropdown" || props.captionLayout === "dropdown-years"
  if (startMonth) startMonth = startOfMonth(startMonth)
  else if (hasYearDropdown) startMonth = startOfYear(addYears(props.today ?? dateLib.today(), -100))
  if (endMonth) endMonth = endOfMonth(endMonth)
  else if (hasYearDropdown) endMonth = endOfYear(props.today ?? dateLib.today())
  return [startMonth && startOfDay(startMonth), endMonth && startOfDay(endMonth)]
}

export function getInitialMonth(
  props: { month?: Date; defaultMonth?: Date; today?: Date; numberOfMonths?: number },
  navStart: Date | undefined,
  navEnd: Date | undefined,
  dateLib: DateLib
): Date {
  const { month, defaultMonth, today = dateLib.today(), numberOfMonths = 1 } = props
  let initialMonth = month || defaultMonth || today
  if (navEnd && differenceInCalendarMonths(navEnd, initialMonth) < numberOfMonths - 1) initialMonth = addMonths(navEnd, -(numberOfMonths - 1))
  if (navStart && differenceInCalendarMonths(initialMonth, navStart) < 0) initialMonth = navStart
  return startOfMonth(initialMonth)
}

export function getDisplayMonths(firstMonth: Date, navEnd: Date | undefined, numberOfMonths = 1): Date[] {
  const months: Date[] = []
  for (let i = 0; i < numberOfMonths; i++) {
    const month = addMonths(firstMonth, i)
    if (navEnd && month > navEnd) break
    months.push(month)
  }
  return months
}

// One grid per month, from the first day of its first week to the last day of its last week (six weeks with `fixedWeeks`).
export function getMonths(displayMonths: Date[], fixedWeeks: boolean | undefined, dateLib: DateLib): CalendarMonth[] {
  return displayMonths.map((month) => {
    const start = dateLib.startOfWeek(month)
    const length = Math.max(differenceInCalendarDays(dateLib.endOfWeek(endOfMonth(month)), start) + 1, fixedWeeks ? 42 : 0)
    const weeks: CalendarWeek[] = []
    for (let offset = 0; offset < length; offset += 7) {
      const days = Array.from({ length: 7 }, (_, i) => new CalendarDay(addDays(start, offset + i), month, dateLib))
      weeks.push({ weekNumber: dateLib.getWeek(days[0]!.date), days })
    }
    return { date: month, weeks }
  })
}

export function getWeekdays(dateLib: DateLib, today: Date = dateLib.today()): Date[] {
  const start = dateLib.startOfWeek(today)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

type StepProps = { numberOfMonths?: number; pagedNavigation?: boolean; disableNavigation?: boolean }

export function getPreviousMonth(first: Date, navStart: Date | undefined, props: StepProps): Date | undefined {
  if (props.disableNavigation) return undefined
  const month = startOfMonth(first)
  if (navStart && differenceInCalendarMonths(month, navStart) <= 0) return undefined
  return addMonths(month, -(props.pagedNavigation ? (props.numberOfMonths ?? 1) : 1))
}

export function getNextMonth(first: Date, navEnd: Date | undefined, props: StepProps): Date | undefined {
  if (props.disableNavigation) return undefined
  const { numberOfMonths = 1 } = props
  if (navEnd && differenceInCalendarMonths(navEnd, first) < numberOfMonths) return undefined
  return addMonths(startOfMonth(first), props.pagedNavigation ? numberOfMonths : 1)
}

export type DropdownOption = { value: number; label: string; disabled: boolean }

export function getMonthOptions(
  displayMonth: Date,
  navStart: Date | undefined,
  navEnd: Date | undefined,
  formatters: Pick<Formatters, "formatMonthDropdown">,
  dateLib: DateLib
): DropdownOption[] {
  const months = eachMonthOfInterval({ start: startOfYear(displayMonth), end: endOfYear(displayMonth) })
  return months.map((month) => ({
    value: dateLib.getMonth(month),
    label: formatters.formatMonthDropdown(month, dateLib),
    disabled: Boolean((navStart && month < startOfMonth(navStart)) || (navEnd && month > startOfMonth(navEnd))),
  }))
}

export function getYearOptions(
  navStart: Date | undefined,
  navEnd: Date | undefined,
  formatters: Pick<Formatters, "formatYearDropdown">,
  dateLib: DateLib
): DropdownOption[] | undefined {
  if (!navStart || !navEnd) return undefined
  const years = eachYearOfInterval({ start: startOfYear(navStart), end: endOfYear(navEnd) })
  return years.map((year) => ({ value: dateLib.getYear(year), label: formatters.formatYearDropdown(year, dateLib), disabled: false }))
}

type Hidden = { disabled?: Matcher | Matcher[]; hidden?: Matcher | Matcher[] }

export function createGetModifiers(
  days: CalendarDay[],
  props: Hidden & { modifiers?: Record<string, Matcher | Matcher[] | undefined>; showOutsideDays?: boolean; today?: Date },
  navStart: Date | undefined,
  navEnd: Date | undefined,
  dateLib: DateLib
) {
  const { disabled, hidden, modifiers, showOutsideDays, today = dateLib.today() } = props
  const computedNavStart = navStart && startOfMonth(navStart)
  const computedNavEnd = navEnd && endOfMonth(navEnd)
  const flagged: Record<(typeof flagKeys)[number], CalendarDay[]> = { focused: [], outside: [], disabled: [], hidden: [], today: [] }
  const custom: Record<string, CalendarDay[]> = {}

  for (const day of days) {
    const { date, displayMonth } = day
    const isOutside = Boolean(displayMonth && !isSameMonth(date, displayMonth))
    const isHidden =
      Boolean(hidden && dateMatchModifiers(date, hidden)) ||
      Boolean(computedNavStart && isBefore(date, computedNavStart)) ||
      Boolean(computedNavEnd && isAfter(date, computedNavEnd)) ||
      (!showOutsideDays && isOutside)
    if (isOutside) flagged.outside.push(day)
    if (disabled && dateMatchModifiers(date, disabled)) flagged.disabled.push(day)
    if (isHidden) flagged.hidden.push(day)
    if (isSameDay(date, today)) flagged.today.push(day)
    for (const name of Object.keys(modifiers ?? {})) {
      const matcher = modifiers?.[name]
      if (matcher && dateMatchModifiers(date, matcher)) (custom[name] ??= []).push(day)
    }
  }

  return (day: CalendarDay): Modifiers => {
    const result: Modifiers = {}
    for (const name of flagKeys) result[name] = flagged[name].some((d) => d === day)
    for (const name in custom) result[name] = custom[name]!.some((d) => d === day)
    return result
  }
}

export function getClassNamesForModifiers(modifiers: Modifiers, classNames: ClassNames, modifiersClassNames: Record<string, string> = {}): string[] {
  const names = [classNames.day]
  for (const [key, active] of Object.entries(modifiers)) {
    if (active !== true) continue
    const own = (flagKeys as readonly string[]).includes(key) || (rangeKeys as readonly string[]).includes(key) ? classNames[key as keyof ClassNames] : undefined
    const name = modifiersClassNames[key] || own
    if (name) names.push(name)
  }
  return names
}

type FocusProps = Hidden & { modifiers?: unknown }

function getFocusableDate(moveBy: MoveFocusBy, moveDir: MoveFocusDir, refDate: Date, navStart: Date | undefined, navEnd: Date | undefined, dateLib: DateLib): Date {
  const moves = { day: addDays, week: addWeeks, month: addMonths, year: addYears, startOfWeek: dateLib.startOfWeek, endOfWeek: dateLib.endOfWeek }
  let date = moves[moveBy](refDate, moveDir === "after" ? 1 : -1)
  if (moveDir === "before" && navStart) date = max([navStart, date])
  else if (moveDir === "after" && navEnd) date = min([navEnd, date])
  return date
}

// The next day focus can land on, skipping disabled and hidden days.
export function getNextFocus(
  moveBy: MoveFocusBy,
  moveDir: MoveFocusDir,
  refDay: CalendarDay,
  navStart: Date | undefined,
  navEnd: Date | undefined,
  props: FocusProps,
  dateLib: DateLib,
  attempt = 0
): CalendarDay | undefined {
  if (attempt > 365) return undefined
  const date = getFocusableDate(moveBy, moveDir, refDay.date, navStart, navEnd, dateLib)
  const day = new CalendarDay(date, date, dateLib)
  const skipped = Boolean((props.disabled && dateMatchModifiers(date, props.disabled)) || (props.hidden && dateMatchModifiers(date, props.hidden)))
  return skipped ? getNextFocus(moveBy, moveDir, day, navStart, navEnd, props, dateLib, attempt + 1) : day
}

// Which day gets tabindex 0: the focused one, else the last focused, else the selected one, else today, else the first day that can take focus.
export function calculateFocusTarget(
  days: CalendarDay[],
  getModifiers: (day: CalendarDay) => Modifiers,
  isSelected: (date: Date) => boolean,
  lastFocused: CalendarDay | undefined
): CalendarDay | undefined {
  const isFocusable = (modifiers: Modifiers) => !modifiers.disabled && !modifiers.hidden && !modifiers.outside
  let target: CalendarDay | undefined
  let priority = -1
  for (const day of days) {
    const modifiers = getModifiers(day)
    if (!isFocusable(modifiers)) continue
    const rank = modifiers.focused ? 3 : lastFocused?.isEqualTo(day) ? 2 : isSelected(day.date) ? 1 : modifiers.today ? 0 : -1
    if (rank > priority) {
      target = day
      priority = rank
    }
  }
  return target ?? days.find((day) => isFocusable(getModifiers(day)))
}

export type Labels = {
  labelNav: () => string
  labelGrid: (date: Date, options?: DateLibOptions, dateLib?: DateLib) => string
  labelGridcell: (date: Date, modifiers?: Modifiers, options?: DateLibOptions, dateLib?: DateLib) => string
  labelMonthDropdown: (options?: DateLibOptions) => string
  labelYearDropdown: (options?: DateLibOptions) => string
  labelNext: (month: Date | undefined, options?: DateLibOptions) => string
  labelPrevious: (month: Date | undefined) => string
  labelDayButton: (date: Date, modifiers: Modifiers, options?: DateLibOptions, dateLib?: DateLib) => string
  labelWeekday: (date: Date, options?: DateLibOptions, dateLib?: DateLib) => string
  labelWeekNumber: (weekNumber: number, options?: DateLibOptions) => string
  labelWeekNumberHeader: (options?: DateLibOptions) => string
}
const lib = (options?: DateLibOptions, dateLib?: DateLib) => dateLib ?? new DateLib(options)
const defaultLabels: Labels = {
  labelNav: () => "",
  labelGrid: (date, options, dateLib) => lib(options, dateLib).formatMonthYear(date),
  labelGridcell: (date, modifiers, options, dateLib) => {
    const label = lib(options, dateLib).format(date, "PPPP")
    return modifiers?.today ? `Today, ${label}` : label
  },
  labelMonthDropdown: () => "Choose the Month",
  labelYearDropdown: () => "Choose the Year",
  labelNext: () => "Go to the Next Month",
  labelPrevious: () => "Go to the Previous Month",
  labelDayButton: (date, modifiers, options, dateLib) => {
    let label = lib(options, dateLib).format(date, "PPPP")
    if (modifiers.today) label = `Today, ${label}`
    if (modifiers.selected) label = `${label}, selected`
    return label
  },
  labelWeekday: (date, options, dateLib) => lib(options, dateLib).format(date, "cccc"),
  labelWeekNumber: (weekNumber) => `Week ${weekNumber}`,
  labelWeekNumberHeader: () => "Week Number",
}

// A locale's own labels (a string or a function) beat the English defaults, the `labels` prop beats both.
export function getLabels(custom: Partial<Labels> | undefined, locale: DayPickerLocale | undefined): Labels {
  const labels: Record<string, unknown> = { ...defaultLabels }
  for (const [name, label] of Object.entries(locale?.labels ?? {})) if (label) labels[name] = typeof label === "function" ? label : () => label
  return { ...labels, ...custom } as Labels
}

export type Formatters = {
  formatCaption: (month: Date, options?: DateLibOptions, dateLib?: DateLib) => string
  formatDay: (date: Date, options?: DateLibOptions, dateLib?: DateLib) => string
  formatMonthDropdown: (month: Date, dateLib?: DateLib) => string
  formatWeekNumber: (weekNumber: number, dateLib?: DateLib) => string
  formatWeekNumberHeader: () => string
  formatWeekdayName: (weekday: Date, options?: DateLibOptions, dateLib?: DateLib) => string
  formatYearDropdown: (year: Date, dateLib?: DateLib) => string
}
export const defaultFormatters: Formatters = {
  formatCaption: (month, options, dateLib) => lib(options, dateLib).formatMonthYear(month),
  formatDay: (date, options, dateLib) => lib(options, dateLib).format(date, "d"),
  formatMonthDropdown: (month, dateLib = defaultDateLib) => dateLib.format(month, "LLLL"),
  formatWeekNumber: (weekNumber) => (weekNumber < 10 ? `0${weekNumber.toLocaleString()}` : weekNumber.toLocaleString()),
  formatWeekNumberHeader: () => "",
  formatWeekdayName: (weekday, options, dateLib) => lib(options, dateLib).format(weekday, "cccccc"),
  formatYearDropdown: (year, dateLib = defaultDateLib) => dateLib.format(year, "yyyy"),
}
