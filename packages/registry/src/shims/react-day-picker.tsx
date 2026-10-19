// Derived from react-day-picker 10.0.2, Copyright (c) 2014-2026 Giampaolo Bellavite <io@gpbl.dev> and contributors, MIT License (https://opensource.org/license/mit)
import {
  createContext,
  type ComponentProps,
  type CSSProperties,
  type Ref,
  type TargetedEvent,
  type TargetedFocusEvent,
  type TargetedKeyboardEvent,
  type TargetedMouseEvent,
} from "preact"
import { useContext, useEffect, useRef, useState } from "preact/hooks"
import { addMonths, isSameDay, setMonth, setYear, startOfMonth } from "date-fns"
import {
  addToRange,
  calculateFocusTarget,
  convertMatchersToTimeZone,
  createGetModifiers,
  DateLib,
  defaultFormatters,
  defaultLocale,
  getClassNamesForModifiers,
  getDefaultClassNames,
  getDisplayMonths,
  getInitialMonth,
  getLabels,
  getMonthOptions,
  getMonths,
  getNavMonths,
  getNextFocus,
  getNextMonth,
  getPreviousMonth,
  getWeekdays,
  getYearOptions,
  isDateRange,
  rangeIncludesDate,
  toTimeZone,
  type CalendarDay,
  type CalendarMonth,
  type CalendarWeek,
  type ClassNames,
  type DateRange,
  type DropdownOption,
  type Formatters,
  type Labels,
  type Matcher,
  type Modifiers,
  type MoveFocusBy,
  type MoveFocusDir,
  type DayPickerLocale,
} from "./internal/react-day-picker-core"

// react-day-picker 10.0.2 on Preact hooks: the same DOM, roles, aria, data-* attributes, class names, keyboard navigation and focus management.
// shortcut: no `animate`, `footer`, `navLayout`, `reverseMonths`, `reverseYears`, `styles`, `modifiersStyles`, `ISOWeek`, `broadcastCalendar`, `numerals`,
// `noonSafe`, `dateLib` and no range `excludeDisabled` or `resetOnSelect` (TypeScript rejects them); port the one an app needs from react-day-picker.
export { DateLib, getDefaultClassNames }
export type { CalendarDay, CalendarMonth, CalendarWeek, ClassNames, DateLibOptions, DateRange, DayPickerLocale, Formatters, Labels, Locale, Matcher, Modifiers } from "./internal/react-day-picker-core"

export function CaptionLabel(props: ComponentProps<"span">) {
  return <span {...props} />
}
export function Chevron({ size = 24, orientation = "left", className, style }: { className?: string; style?: CSSProperties; size?: number; disabled?: boolean; orientation?: "up" | "down" | "left" | "right" }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24">
      {orientation === "up" && <polygon points="6.77 17 12.5 11.43 18.24 17 20 15.28 12.5 8 5 15.28" />}
      {orientation === "down" && <polygon points="6.77 8 12.5 13.57 18.24 8 20 9.72 12.5 17 5 9.72" />}
      {orientation === "left" && <polygon points="16 18.112 9.81111111 12 16 5.87733333 14.0888889 4 6 12 14.0888889 20" />}
      {orientation === "right" && <polygon points="8 18.112 14.18888889 12 8 5.87733333 9.91111111 4 18 12 9.91111111 20" />}
    </svg>
  )
}
export function Day({ day, modifiers, ...props }: { day: CalendarDay; modifiers: Modifiers } & ComponentProps<"td">) {
  return <td {...props} />
}
export function DayButton({ day, modifiers, ...props }: { day: CalendarDay; modifiers: Modifiers } & ComponentProps<"button">) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])
  return <button ref={ref} {...props} />
}
export function Select(props: ComponentProps<"select">) {
  return <select {...props} />
}
export function Option(props: ComponentProps<"option">) {
  return <option {...props} />
}
export function Dropdown({ options, className, children, ...selectProps }: { options?: DropdownOption[] } & ComponentProps<"select">) {
  const { classNames, components } = useDayPicker()
  const selectedOption = options?.find(({ value }) => value === selectProps.value)
  return (
    <span data-disabled={selectProps.disabled} className={classNames.dropdown_root}>
      <components.Select className={[classNames.dropdown, className].join(" ")} {...selectProps}>
        {options?.map(({ value, label, disabled }) => (
          <components.Option key={value} value={value} disabled={disabled}>
            {label}
          </components.Option>
        ))}
      </components.Select>
      <span className={classNames.caption_label} aria-hidden>
        {selectedOption?.label}
        <components.Chevron orientation="down" size={18} className={classNames.chevron} />
      </span>
    </span>
  )
}
export function MonthsDropdown(props: Parameters<typeof Dropdown>[0]) {
  const { components } = useDayPicker()
  return <components.Dropdown {...props} />
}
export const YearsDropdown = MonthsDropdown
export function DropdownNav(props: ComponentProps<"div">) {
  return <div {...props} />
}
export function Month({ calendarMonth, displayIndex, ...props }: { calendarMonth: CalendarMonth; displayIndex: number } & ComponentProps<"div">) {
  return <div {...props} />
}
export function MonthCaption({ calendarMonth, displayIndex, ...props }: { calendarMonth: CalendarMonth; displayIndex: number } & ComponentProps<"div">) {
  return <div {...props} />
}
export function MonthGrid(props: ComponentProps<"table">) {
  return <table {...props} />
}
export function Months(props: ComponentProps<"div">) {
  return <div {...props} />
}
export function Nav({
  onPreviousClick,
  onNextClick,
  previousMonth,
  nextMonth,
  ...props
}: {
  onPreviousClick?: (e: TargetedMouseEvent<HTMLButtonElement>) => void
  onNextClick?: (e: TargetedMouseEvent<HTMLButtonElement>) => void
  previousMonth?: Date | undefined
  nextMonth?: Date | undefined
} & ComponentProps<"nav">) {
  const {
    components,
    classNames,
    labels: { labelPrevious, labelNext },
  } = useDayPicker()
  return (
    <nav {...props}>
      <components.PreviousMonthButton
        type="button"
        className={classNames.button_previous}
        tabIndex={previousMonth ? undefined : -1}
        aria-disabled={previousMonth ? undefined : true}
        aria-label={labelPrevious(previousMonth)}
        onClick={(e: TargetedMouseEvent<HTMLButtonElement>) => previousMonth && onPreviousClick?.(e)}
      >
        <components.Chevron disabled={previousMonth ? undefined : true} className={classNames.chevron} orientation="left" />
      </components.PreviousMonthButton>
      <components.NextMonthButton
        type="button"
        className={classNames.button_next}
        tabIndex={nextMonth ? undefined : -1}
        aria-disabled={nextMonth ? undefined : true}
        aria-label={labelNext(nextMonth)}
        onClick={(e: TargetedMouseEvent<HTMLButtonElement>) => nextMonth && onNextClick?.(e)}
      >
        <components.Chevron disabled={nextMonth ? undefined : true} orientation="right" className={classNames.chevron} />
      </components.NextMonthButton>
    </nav>
  )
}
export function NextMonthButton(props: ComponentProps<"button">) {
  return <button {...props} />
}
export const PreviousMonthButton = NextMonthButton
export function Root({ rootRef, ...props }: { rootRef?: Ref<HTMLDivElement> } & ComponentProps<"div">) {
  return <div {...props} ref={rootRef} />
}
export function Week({ week, ...props }: { week: CalendarWeek } & ComponentProps<"tr">) {
  return <tr {...props} />
}
export function Weekday(props: ComponentProps<"th">) {
  return <th {...props} />
}
export function Weekdays(props: ComponentProps<"tr">) {
  return (
    <thead aria-hidden>
      <tr {...props} />
    </thead>
  )
}
export function WeekNumber({ week, ...props }: { week: CalendarWeek } & ComponentProps<"th">) {
  return <th {...props} />
}
export const WeekNumberHeader = Weekday
export function Weeks(props: ComponentProps<"tbody">) {
  return <tbody {...props} />
}

const defaultComponents = {
  CaptionLabel, Chevron, Day, DayButton, Dropdown, DropdownNav, Month, MonthCaption, MonthGrid, Months, MonthsDropdown, Nav, NextMonthButton,
  Option, PreviousMonthButton, Root, Select, Week, Weekday, Weekdays, WeekNumber, WeekNumberHeader, Weeks, YearsDropdown,
}
export type CustomComponents = typeof defaultComponents

type PropsBase = {
  mode?: "single" | "multiple" | "range" | undefined
  required?: boolean | undefined
  className?: string
  classNames?: Partial<ClassNames>
  modifiersClassNames?: Record<string, string>
  style?: CSSProperties
  id?: string
  defaultMonth?: Date
  month?: Date
  numberOfMonths?: number
  startMonth?: Date | undefined
  endMonth?: Date
  pagedNavigation?: boolean
  hideNavigation?: boolean
  disableNavigation?: boolean
  captionLayout?: "label" | "dropdown" | "dropdown-months" | "dropdown-years"
  fixedWeeks?: boolean
  hideWeekdays?: boolean
  showOutsideDays?: boolean
  showWeekNumber?: boolean
  timeZone?: string | undefined
  components?: Partial<CustomComponents>
  autoFocus?: boolean
  disabled?: Matcher | Matcher[] | undefined
  hidden?: Matcher | Matcher[] | undefined
  today?: Date
  modifiers?: Record<string, Matcher | Matcher[] | undefined> | undefined
  labels?: Partial<Labels>
  formatters?: Partial<Formatters>
  dir?: "ltr" | "rtl" | "auto"
  "aria-label"?: string
  "aria-labelledby"?: string
  role?: "application" | "dialog" | undefined
  nonce?: string
  title?: string
  lang?: string
  locale?: Partial<DayPickerLocale> | undefined
  weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | undefined
  firstWeekContainsDate?: 1 | 4
  onMonthChange?: (month: Date) => void
  onNextClick?: (month: Date) => void
  onPrevClick?: (month: Date) => void
  onDayClick?: DayEventHandler<TargetedMouseEvent<HTMLButtonElement>>
  onDayFocus?: DayEventHandler<TargetedFocusEvent<HTMLButtonElement>>
  onDayBlur?: DayEventHandler<TargetedFocusEvent<HTMLButtonElement>>
  onDayKeyDown?: DayEventHandler<TargetedKeyboardEvent<HTMLButtonElement>>
  onDayMouseEnter?: DayEventHandler<TargetedMouseEvent<HTMLButtonElement>>
  onDayMouseLeave?: DayEventHandler<TargetedMouseEvent<HTMLButtonElement>>
}
type DayEventHandler<E> = (date: Date, modifiers: Modifiers, e: E) => void
type SelectEvent = TargetedMouseEvent<HTMLButtonElement> | TargetedKeyboardEvent<HTMLButtonElement>
type OnSelect<T> = (selected: T, triggerDate: Date, modifiers: Modifiers, e: SelectEvent) => void
type PropsSingleRequired = { mode: "single"; required: true; selected: Date | undefined; onSelect?: OnSelect<Date> }
type PropsSingle = { mode: "single"; required?: false | undefined; selected?: Date | undefined; onSelect?: OnSelect<Date | undefined> }
type PropsMultiRequired = { mode: "multiple"; required: true; selected: Date[] | undefined; onSelect?: OnSelect<Date[]>; min?: number; max?: number }
type PropsMulti = { mode: "multiple"; required?: false | undefined; selected?: Date[] | undefined; onSelect?: OnSelect<Date[] | undefined>; min?: number; max?: number }
type PropsRangeRequired = { mode: "range"; required: true; selected: DateRange | undefined; onSelect?: OnSelect<DateRange>; min?: number; max?: number }
type PropsRange = { mode: "range"; required?: false | undefined; selected?: DateRange | undefined; onSelect?: OnSelect<DateRange | undefined>; min?: number; max?: number }
export type DayPickerProps = PropsBase &
  (PropsSingle | PropsSingleRequired | PropsMulti | PropsMultiRequired | PropsRange | PropsRangeRequired | { mode?: undefined; required?: undefined })

type Selected = Date | Date[] | DateRange | undefined
type DayPickerContext = {
  dayPickerProps: DayPickerProps
  selected: Selected
  select: ((date: Date, modifiers: Modifiers, e: SelectEvent) => Selected) | undefined
  isSelected: ((date: Date) => boolean) | undefined
  months: CalendarMonth[]
  nextMonth: Date | undefined
  previousMonth: Date | undefined
  goToMonth: (month: Date) => void
  getModifiers: (day: CalendarDay) => Modifiers
  components: CustomComponents
  classNames: ClassNames
  labels: Labels
  formatters: Formatters
}
const dayPickerContext = createContext<DayPickerContext | undefined>(undefined)

export function useDayPicker(): DayPickerContext {
  const context = useContext(dayPickerContext)
  if (context === undefined) throw new Error("useDayPicker() must be used within a custom component.")
  return context
}

function zonedProps(props: DayPickerProps, timeZone: string): DayPickerProps {
  const zone = (date?: Date) => date && toTimeZone(date, timeZone)
  const { selected } = props as { selected?: Selected }
  return {
    ...props,
    today: zone(props.today),
    month: zone(props.month),
    defaultMonth: zone(props.defaultMonth),
    startMonth: zone(props.startMonth),
    endMonth: zone(props.endMonth),
    ...(selected && {
      selected: selected instanceof Date ? zone(selected) : Array.isArray(selected) ? selected.map(zone) : { from: zone(selected.from), to: zone(selected.to) },
    }),
    disabled: convertMatchersToTimeZone(props.disabled, timeZone),
    hidden: convertMatchersToTimeZone(props.hidden, timeZone),
    modifiers: props.modifiers && Object.fromEntries(Object.entries(props.modifiers).map(([name, matcher]) => [name, convertMatchersToTimeZone(matcher, timeZone)])),
  } as DayPickerProps
}

function useCalendar(props: DayPickerProps, dateLib: DateLib) {
  const [navStart, navEnd] = getNavMonths(props, dateLib)
  const initialMonth = getInitialMonth(props, navStart, navEnd, dateLib)
  const [uncontrolledMonth, setFirstMonth] = useState(initialMonth)
  const firstMonth = props.month ? initialMonth : uncontrolledMonth
  useEffect(() => setFirstMonth(getInitialMonth(props, navStart, navEnd, dateLib)), [props.timeZone])

  const months = getMonths(getDisplayMonths(firstMonth, navEnd, props.numberOfMonths), props.fixedWeeks, dateLib)
  const weeks = months.flatMap((month) => month.weeks)
  const days = weeks.flatMap((week) => week.days)

  const goToMonth = (date: Date) => {
    if (props.disableNavigation) return
    let month = startOfMonth(date)
    if (navStart && month < startOfMonth(navStart)) month = startOfMonth(navStart)
    if (navEnd && month > startOfMonth(navEnd)) month = startOfMonth(navEnd)
    setFirstMonth(month)
    props.onMonthChange?.(month)
  }
  const goToDay = (day: CalendarDay) => {
    if (!days.some((d) => d.isEqualTo(day))) goToMonth(day.date)
  }

  return {
    months,
    days,
    navStart,
    navEnd,
    previousMonth: getPreviousMonth(firstMonth, navStart, props),
    nextMonth: getNextMonth(firstMonth, navEnd, props),
    goToMonth,
    goToDay,
  }
}
type Calendar = ReturnType<typeof useCalendar>

// Without `onSelect` the picker keeps the selection itself, starting from `selected`; with it, `selected` is the only source.
function useSelection(props: DayPickerProps) {
  const { mode, selected: given, onSelect, required, min, max } = props as {
    mode?: string
    selected?: Selected
    onSelect?: (selected: Selected, date: Date, modifiers: Modifiers, e: SelectEvent) => void
    required?: boolean
    min?: number
    max?: number
  }
  const [own, setOwn] = useState(given)
  if (!mode) return undefined
  const selected = onSelect ? given : own
  const isSelected = (date: Date): boolean =>
    mode === "single"
      ? Boolean(selected) && isSameDay(selected as Date, date)
      : mode === "multiple"
        ? ((selected as Date[] | undefined)?.some((d) => isSameDay(d, date)) ?? false)
        : (selected && rangeIncludesDate(selected as DateRange, date, false)) as boolean

  const select = (date: Date, modifiers: Modifiers, e: SelectEvent): Selected => {
    let next: Selected
    if (mode === "single") {
      next = !required && selected && isSameDay(date, selected as Date) ? undefined : date
    } else if (mode === "multiple") {
      const dates = (selected as Date[] | undefined) ?? []
      if (isSelected(date)) {
        if (dates.length === min || (required && dates.length === 1)) return undefined
        next = dates.filter((d) => !isSameDay(d, date))
      } else {
        next = dates.length === max ? [date] : [...dates, date]
      }
    } else {
      next = addToRange(date, selected as DateRange | undefined, min, max, required)
    }
    if (!onSelect) setOwn(next)
    onSelect?.(next, date, modifiers, e)
    return next
  }

  return { selected, select, isSelected }
}

function useFocus(
  props: DayPickerProps,
  calendar: Calendar,
  getModifiers: (day: CalendarDay) => Modifiers,
  isSelected: (date: Date) => boolean,
  dateLib: DateLib
) {
  const [lastFocused, setLastFocused] = useState<CalendarDay | undefined>()
  const focusTarget = calculateFocusTarget(calendar.days, getModifiers, isSelected, lastFocused)
  const [focused, setFocused] = useState<CalendarDay | undefined>(props.autoFocus ? focusTarget : undefined)

  // the focused day left the grid (month change, new props): hand focus to the day that can take it
  useEffect(() => {
    if (focused && focusTarget && !calendar.days.some((day) => day.isEqualTo(focused))) setFocused(focusTarget)
  }, [calendar.days, focused, focusTarget])

  return {
    focused,
    setFocused,
    isFocusTarget: (day: CalendarDay) => Boolean(focusTarget?.isEqualTo(day)),
    blur: () => {
      setLastFocused(focused)
      setFocused(undefined)
    },
    moveFocus: (moveBy: MoveFocusBy, moveDir: MoveFocusDir) => {
      if (!focused) return
      const next = getNextFocus(moveBy, moveDir, focused, calendar.navStart, calendar.navEnd, props, dateLib)
      if (!next) return
      if (props.disableNavigation && !calendar.days.some((day) => day.isEqualTo(next))) return
      calendar.goToDay(next)
      setFocused(next)
    },
  }
}

export function DayPicker(initialProps: DayPickerProps) {
  let props = initialProps.timeZone ? zonedProps(initialProps, initialProps.timeZone) : initialProps
  const locale = { ...defaultLocale, ...props.locale }
  const dateLib = new DateLib({ locale, weekStartsOn: props.weekStartsOn, firstWeekContainsDate: props.firstWeekContainsDate, timeZone: props.timeZone })
  const components = { ...defaultComponents, ...props.components }
  const formatters = { ...defaultFormatters, ...props.formatters }
  const labels = getLabels(props.labels, locale)
  const classNames = { ...getDefaultClassNames(), ...props.classNames }
  if (!props.today) props = { ...props, today: dateLib.today() }

  const { captionLayout, mode, showWeekNumber } = props
  const { formatCaption, formatDay, formatMonthDropdown, formatWeekNumber, formatWeekNumberHeader, formatWeekdayName, formatYearDropdown } = formatters
  const calendar = useCalendar(props, dateLib)
  const { days, months, navStart, navEnd, previousMonth, nextMonth, goToMonth } = calendar
  const getModifiers = createGetModifiers(days, props, navStart, navEnd, dateLib)
  const { isSelected, select, selected: selectedValue } = useSelection(props) ?? {}
  const { blur, focused, isFocusTarget, moveFocus, setFocused } = useFocus(props, calendar, getModifiers, isSelected ?? (() => false), dateLib)
  const { labelDayButton, labelGridcell, labelGrid, labelMonthDropdown, labelNav, labelWeekday, labelWeekNumber, labelWeekNumberHeader, labelYearDropdown } = labels
  const weekdays = getWeekdays(dateLib, props.today)
  const isInteractive = mode !== undefined || props.onDayClick !== undefined

  const handlePreviousClick = () => {
    if (!previousMonth) return
    goToMonth(previousMonth)
    props.onPrevClick?.(previousMonth)
  }
  const handleNextClick = () => {
    if (!nextMonth) return
    goToMonth(nextMonth)
    props.onNextClick?.(nextMonth)
  }
  const handleDayClick = (day: CalendarDay, modifiers: Modifiers) => (e: TargetedMouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setFocused(day)
    if (modifiers.disabled) return
    select?.(day.date, modifiers, e)
    props.onDayClick?.(day.date, modifiers, e)
  }
  const handleDayFocus = (day: CalendarDay, modifiers: Modifiers) => (e: TargetedFocusEvent<HTMLButtonElement>) => {
    setFocused(day)
    props.onDayFocus?.(day.date, modifiers, e)
  }
  const handleDayBlur = (day: CalendarDay, modifiers: Modifiers) => (e: TargetedFocusEvent<HTMLButtonElement>) => {
    blur()
    props.onDayBlur?.(day.date, modifiers, e)
  }
  const handleDayKeyDown = (day: CalendarDay, modifiers: Modifiers) => (e: TargetedKeyboardEvent<HTMLButtonElement>) => {
    const rtl = props.dir === "rtl"
    const keyMap: Record<string, [MoveFocusBy, MoveFocusDir]> = {
      ArrowLeft: [e.shiftKey ? "month" : "day", rtl ? "after" : "before"],
      ArrowRight: [e.shiftKey ? "month" : "day", rtl ? "before" : "after"],
      ArrowDown: [e.shiftKey ? "year" : "week", "after"],
      ArrowUp: [e.shiftKey ? "year" : "week", "before"],
      PageUp: [e.shiftKey ? "year" : "month", "before"],
      PageDown: [e.shiftKey ? "year" : "month", "after"],
      Home: ["startOfWeek", "before"],
      End: ["endOfWeek", "after"],
    }
    const move = keyMap[e.key]
    if (move) {
      e.preventDefault()
      e.stopPropagation()
      moveFocus(...move)
    }
    props.onDayKeyDown?.(day.date, modifiers, e)
  }
  const handleMonthChange = (date: Date, monthOffset: number) => (e: TargetedEvent<HTMLSelectElement>) => {
    const month = setMonth(startOfMonth(date), Number(e.currentTarget.value))
    goToMonth(addMonths(month, -monthOffset))
  }
  const handleYearChange = (date: Date, monthOffset: number) => (e: TargetedEvent<HTMLSelectElement>) => {
    const month = setYear(startOfMonth(date), Number(e.currentTarget.value))
    goToMonth(addMonths(month, -monthOffset))
  }

  const dataAttributes: Record<string, unknown> = {
    "data-mode": props.mode ?? undefined,
    "data-required": "required" in props ? props.required : undefined,
    "data-multiple-months": (props.numberOfMonths && props.numberOfMonths > 1) || undefined,
    "data-week-numbers": props.showWeekNumber || undefined,
  }
  for (const [key, value] of Object.entries(props)) if (key.startsWith("data-")) dataAttributes[key] = value

  const contextValue: DayPickerContext = {
    dayPickerProps: props,
    selected: selectedValue,
    select,
    isSelected,
    months,
    nextMonth,
    previousMonth,
    goToMonth,
    getModifiers,
    components,
    classNames,
    labels,
    formatters,
  }

  return (
    <dayPickerContext.Provider value={contextValue}>
      <components.Root
        className={[classNames.root, props.className].filter(Boolean).join(" ")}
        style={props.style}
        dir={props.dir}
        id={props.id}
        lang={props.lang ?? locale.code}
        nonce={props.nonce}
        title={props.title}
        role={props.role}
        aria-label={props["aria-label"]}
        aria-labelledby={props["aria-labelledby"]}
        {...dataAttributes}
      >
        <components.Months className={classNames.months}>
          {!props.hideNavigation && (
            <components.Nav
              className={classNames.nav}
              aria-label={labelNav()}
              onPreviousClick={handlePreviousClick}
              onNextClick={handleNextClick}
              previousMonth={previousMonth}
              nextMonth={nextMonth}
            />
          )}
          {months.map((calendarMonth, displayIndex) => (
            // the index is the key on purpose: a month keeps its element while the dates under it change
            <components.Month key={displayIndex} className={classNames.month} displayIndex={displayIndex} calendarMonth={calendarMonth}>
              <components.MonthCaption className={classNames.month_caption} calendarMonth={calendarMonth} displayIndex={displayIndex}>
                {captionLayout?.startsWith("dropdown") ? (
                  <components.DropdownNav className={classNames.dropdowns}>
                    {(() => {
                      const monthControl =
                        captionLayout === "dropdown" || captionLayout === "dropdown-months" ? (
                          <components.MonthsDropdown
                            key="month"
                            className={classNames.months_dropdown}
                            aria-label={labelMonthDropdown()}
                            disabled={Boolean(props.disableNavigation)}
                            onChange={handleMonthChange(calendarMonth.date, displayIndex)}
                            options={getMonthOptions(calendarMonth.date, navStart, navEnd, formatters, dateLib)}
                            value={dateLib.getMonth(calendarMonth.date)}
                          />
                        ) : (
                          <span key="month">{formatMonthDropdown(calendarMonth.date, dateLib)}</span>
                        )
                      const yearControl =
                        captionLayout === "dropdown" || captionLayout === "dropdown-years" ? (
                          <components.YearsDropdown
                            key="year"
                            className={classNames.years_dropdown}
                            aria-label={labelYearDropdown(dateLib.options)}
                            disabled={Boolean(props.disableNavigation)}
                            onChange={handleYearChange(calendarMonth.date, displayIndex)}
                            options={getYearOptions(navStart, navEnd, formatters, dateLib)}
                            value={dateLib.getYear(calendarMonth.date)}
                          />
                        ) : (
                          <span key="year">{formatYearDropdown(calendarMonth.date, dateLib)}</span>
                        )
                      return dateLib.getMonthYearOrder() === "year-first" ? [yearControl, monthControl] : [monthControl, yearControl]
                    })()}
                    <span
                      role="status"
                      aria-live="polite"
                      style={{ border: "0", clip: "rect(0 0 0 0)", height: "1px", margin: "-1px", overflow: "hidden", padding: "0", position: "absolute", width: "1px", whiteSpace: "nowrap", wordWrap: "normal" }}
                    >
                      {formatCaption(calendarMonth.date, dateLib.options, dateLib)}
                    </span>
                  </components.DropdownNav>
                ) : (
                  <components.CaptionLabel className={classNames.caption_label} role="status" aria-live="polite">
                    {formatCaption(calendarMonth.date, dateLib.options, dateLib)}
                  </components.CaptionLabel>
                )}
              </components.MonthCaption>
              <components.MonthGrid
                role="grid"
                aria-multiselectable={mode === "multiple" || mode === "range"}
                aria-label={labelGrid(calendarMonth.date, dateLib.options, dateLib) || undefined}
                className={classNames.month_grid}
              >
                {!props.hideWeekdays && (
                  <components.Weekdays className={classNames.weekdays}>
                    {showWeekNumber && (
                      <components.WeekNumberHeader aria-label={labelWeekNumberHeader(dateLib.options)} className={classNames.week_number_header} scope="col">
                        {formatWeekNumberHeader()}
                      </components.WeekNumberHeader>
                    )}
                    {weekdays.map((weekday) => (
                      <components.Weekday
                        aria-label={labelWeekday(weekday, dateLib.options, dateLib)}
                        className={classNames.weekday}
                        key={String(weekday)}
                        scope="col"
                      >
                        {formatWeekdayName(weekday, dateLib.options, dateLib)}
                      </components.Weekday>
                    ))}
                  </components.Weekdays>
                )}
                <components.Weeks className={classNames.weeks}>
                  {calendarMonth.weeks.map((week) => (
                    <components.Week className={classNames.week} key={week.weekNumber} week={week}>
                      {showWeekNumber && (
                        <components.WeekNumber
                          week={week}
                          aria-label={labelWeekNumber(week.weekNumber, { locale })}
                          className={classNames.week_number}
                          scope="row"
                          role="rowheader"
                        >
                          {formatWeekNumber(week.weekNumber, dateLib)}
                        </components.WeekNumber>
                      )}
                      {week.days.map((day) => {
                        const { date } = day
                        const modifiers = getModifiers(day)
                        modifiers.focused = !modifiers.hidden && Boolean(focused?.isEqualTo(day))
                        // `||` on purpose: an unselected day without a range keeps `selected` undefined, which custom day buttons read as an absent data attribute
                        modifiers.selected = isSelected?.(date) || modifiers.selected
                        if (isDateRange(selectedValue)) {
                          const { from, to } = selectedValue
                          modifiers.range_start = Boolean(from && to && isSameDay(date, from))
                          modifiers.range_end = Boolean(from && to && isSameDay(date, to))
                          modifiers.range_middle = rangeIncludesDate(selectedValue, date, true)
                        }
                        return (
                          <components.Day
                            key={`${day.isoDate}_${day.displayMonthId}`}
                            day={day}
                            modifiers={modifiers}
                            className={getClassNamesForModifiers(modifiers, classNames, props.modifiersClassNames).join(" ")}
                            role="gridcell"
                            aria-selected={modifiers.selected || undefined}
                            aria-label={!isInteractive && !modifiers.hidden ? labelGridcell(date, modifiers, dateLib.options, dateLib) : undefined}
                            data-day={day.isoDate}
                            data-month={day.outside ? day.dateMonthId : undefined}
                            data-selected={modifiers.selected || undefined}
                            data-disabled={modifiers.disabled || undefined}
                            data-hidden={modifiers.hidden || undefined}
                            data-outside={day.outside || undefined}
                            data-focused={modifiers.focused || undefined}
                            data-today={modifiers.today || undefined}
                          >
                            {!modifiers.hidden && isInteractive ? (
                              <components.DayButton
                                className={classNames.day_button}
                                type="button"
                                day={day}
                                modifiers={modifiers}
                                disabled={(!modifiers.focused && modifiers.disabled) || undefined}
                                aria-disabled={(modifiers.focused && modifiers.disabled) || undefined}
                                tabIndex={isFocusTarget(day) ? 0 : -1}
                                aria-label={labelDayButton(date, modifiers, dateLib.options, dateLib)}
                                onClick={handleDayClick(day, modifiers)}
                                onBlur={handleDayBlur(day, modifiers)}
                                onFocus={handleDayFocus(day, modifiers)}
                                onKeyDown={handleDayKeyDown(day, modifiers)}
                                onMouseEnter={(e: TargetedMouseEvent<HTMLButtonElement>) => props.onDayMouseEnter?.(date, modifiers, e)}
                                onMouseLeave={(e: TargetedMouseEvent<HTMLButtonElement>) => props.onDayMouseLeave?.(date, modifiers, e)}
                              >
                                {formatDay(date, dateLib.options, dateLib)}
                              </components.DayButton>
                            ) : (
                              !modifiers.hidden && formatDay(day.date, dateLib.options, dateLib)
                            )}
                          </components.Day>
                        )
                      })}
                    </components.Week>
                  ))}
                </components.Weeks>
              </components.MonthGrid>
            </components.Month>
          ))}
        </components.Months>
      </components.Root>
    </dayPickerContext.Provider>
  )
}
