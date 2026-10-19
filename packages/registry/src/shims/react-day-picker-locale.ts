// Derived from react-day-picker 10.0.2, Copyright (c) 2014-2026 Giampaolo Bellavite <io@gpbl.dev> and contributors, MIT License (https://opensource.org/license/mit)
import { es as dateFnsEs } from "date-fns/locale/es"
import { DateLib, type DateLibOptions, type DayPickerLocale, type Modifiers } from "./react-day-picker"

// react-day-picker/locale: a date-fns locale plus DayPicker's translated aria labels.
// shortcut: only `es`, the one the examples use; copy another from react-day-picker/src/locale/<code>.ts the same way. A plain date-fns locale works too, with English labels.
export const es: DayPickerLocale = {
  ...dateFnsEs,
  labels: {
    labelDayButton: (date: Date, modifiers: Modifiers, options?: DateLibOptions, dateLib?: DateLib) => {
      let label = (dateLib ?? new DateLib(options)).format(date, "PPPP")
      if (modifiers.today) label = `Hoy, ${label}`
      if (modifiers.selected) label = `${label}, seleccionado`
      return label
    },
    labelMonthDropdown: "Elegir el mes",
    labelNext: "Ir al mes siguiente",
    labelPrevious: "Ir al mes anterior",
    labelWeekNumber: (weekNumber: number) => `Semana ${weekNumber}`,
    labelYearDropdown: "Elegir el año",
    labelGrid: (date: Date, options?: DateLibOptions, dateLib?: DateLib) => (dateLib ?? new DateLib(options)).formatMonthYear(date),
    labelGridcell: (date: Date, modifiers?: Modifiers, options?: DateLibOptions, dateLib?: DateLib) => {
      const label = (dateLib ?? new DateLib(options)).format(date, "PPPP")
      return modifiers?.today ? `Hoy, ${label}` : label
    },
    labelNav: "Barra de navegación",
    labelWeekNumberHeader: "Número de semana",
    labelWeekday: (date: Date, options?: DateLibOptions, dateLib?: DateLib) => (dateLib ?? new DateLib(options)).format(date, "cccc"),
  },
}
