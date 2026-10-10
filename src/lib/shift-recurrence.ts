// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { addDays, generateShiftSeries, seriesProblem, type SeriesSlot } from "./shift-series"

/**
 * Recurring permanences (#866): « every Wednesday 14:00–17:00 until June » described once gives
 * every date of the period, public holidays and closures left out. The rule lives inside an
 * event (a long-running one, e.g. a season); the generated shifts are ordinary shifts linked to
 * it. Pure: the form previews exactly what the API creates.
 */

/** Upper bound of shifts created by one rule, so a typo can't create thousands of shifts. */
export const RECURRENCE_MAX_SHIFTS = 500

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7
export const WEEKDAYS: { value: Weekday; label: string; short: string }[] = [
  { value: 1, label: "lundi", short: "lun." },
  { value: 2, label: "mardi", short: "mar." },
  { value: 3, label: "mercredi", short: "mer." },
  { value: 4, label: "jeudi", short: "jeu." },
  { value: 5, label: "vendredi", short: "ven." },
  { value: 6, label: "samedi", short: "sam." },
  { value: 7, label: "dimanche", short: "dim." },
]

/**
 * Public holidays left out: none, France (national), or Switzerland (the days most cantons
 * observe; cantonal holidays are not covered, they go in the closures).
 */
export type HolidayCalendar = "none" | "FR" | "CH"
export const HOLIDAY_CALENDARS: { value: HolidayCalendar; label: string }[] = [
  { value: "none", label: "Aucun" },
  { value: "FR", label: "France (jours fériés nationaux)" },
  { value: "CH", label: "Suisse (jours fériés communs à la plupart des cantons)" },
]

export type RecurrenceInput = {
  /** First and last day of the rule, "YYYY-MM-DD", both included. */
  from: string
  until: string
  weekdays: Weekday[]
  /** 1 = every week, 2 = every other week (counted from the week of `from`). */
  everyWeeks: 1 | 2
  /** Daily time range and slot length, as for a series (#393). */
  startTime: string
  endTime: string
  slotMinutes: number
  breakMinutes?: number
  holidays: HolidayCalendar
  /** Days left out by hand (closures), "YYYY-MM-DD". */
  closures: string[]
}

export type SkippedDate = { date: string; reason: string }
export type RecurrenceShift = SeriesSlot & { /** The day the permanence belongs to (a shift past midnight keeps it). */ day: string }

/** ISO weekday of a "YYYY-MM-DD" date. */
export function weekdayOf(date: string): Weekday {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay()
  return (d === 0 ? 7 : d) as Weekday
}

/** Monday of the week of `date`. */
function mondayOf(date: string): string {
  return addDays(date, 1 - weekdayOf(date))
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

/** Easter Sunday of a year (Gregorian calendar, anonymous algorithm). */
export function easterSunday(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** The public holidays of a calendar for one year, date → name. */
export function publicHolidays(calendar: HolidayCalendar, year: number): Map<string, string> {
  const out = new Map<string, string>()
  if (calendar === "none") return out
  const fixed = (md: string, name: string) => out.set(`${year}-${md}`, name)
  const easter = easterSunday(year)
  const fromEaster = (days: number, name: string) => out.set(addDays(easter, days), name)
  fixed("01-01", "Nouvel an")
  if (calendar === "FR") {
    fromEaster(1, "Lundi de Pâques")
    fixed("05-01", "Fête du travail")
    fixed("05-08", "Victoire 1945")
    fromEaster(39, "Ascension")
    fromEaster(50, "Lundi de Pentecôte")
    fixed("07-14", "Fête nationale")
    fixed("08-15", "Assomption")
    fixed("11-01", "Toussaint")
    fixed("11-11", "Armistice 1918")
    fixed("12-25", "Noël")
  } else {
    fromEaster(-2, "Vendredi saint")
    fromEaster(1, "Lundi de Pâques")
    fromEaster(39, "Ascension")
    fromEaster(50, "Lundi de Pentecôte")
    fixed("08-01", "Fête nationale")
    fixed("12-25", "Noël")
    fixed("12-26", "Saint-Étienne")
  }
  return out
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** The days of the rule, in order, and the ones left out with their reason. */
export function recurrenceDays(input: Pick<RecurrenceInput, "from" | "until" | "weekdays" | "everyWeeks" | "holidays" | "closures">): { days: string[]; skipped: SkippedDate[] } {
  const days: string[] = []
  const skipped: SkippedDate[] = []
  if (!DATE_RE.test(input.from) || !DATE_RE.test(input.until) || input.until < input.from) return { days, skipped }
  const wanted = new Set(input.weekdays)
  const closures = new Set(input.closures)
  const firstMonday = mondayOf(input.from)
  const holidays = new Map<number, Map<string, string>>()
  const holidayOf = (date: string) => {
    const year = Number(date.slice(0, 4))
    if (!holidays.has(year)) holidays.set(year, publicHolidays(input.holidays, year))
    return holidays.get(year)!.get(date)
  }
  // A two-year cap on the loop itself: the shift bound stops creation far earlier anyway.
  for (let date = input.from, n = 0; date <= input.until && n < 800; date = addDays(date, 1), n++) {
    if (!wanted.has(weekdayOf(date))) continue
    if (input.everyWeeks === 2 && Math.floor(daysBetween(firstMonday, date) / 7) % 2 === 1) continue
    const holiday = holidayOf(date)
    if (holiday) { skipped.push({ date, reason: `jour férié (${holiday})` }); continue }
    if (closures.has(date)) { skipped.push({ date, reason: "fermeture" }); continue }
    days.push(date)
  }
  return { days, skipped }
}

/** Every shift of the rule: the daily series repeated on each day kept. */
export function generateRecurrence(input: RecurrenceInput): { shifts: RecurrenceShift[]; skipped: SkippedDate[] } {
  const { days, skipped } = recurrenceDays(input)
  const shifts: RecurrenceShift[] = []
  for (const day of days) {
    for (const slot of generateShiftSeries({ date: day, startTime: input.startTime, endTime: input.endTime, slotMinutes: input.slotMinutes, breakMinutes: input.breakMinutes })) {
      shifts.push({ ...slot, day })
    }
  }
  return { shifts, skipped }
}

/** Why the rule can't be generated, or null. Mirrors the API's validation for the form. */
export function recurrenceProblem(input: RecurrenceInput, eventPeriod?: { start: string; end: string }): string | null {
  if (!DATE_RE.test(input.from) || !DATE_RE.test(input.until)) return "Indiquez la date de début et la date de fin."
  if (input.until < input.from) return "La date de fin est avant la date de début."
  if (eventPeriod && (input.from < eventPeriod.start || input.until > eventPeriod.end))
    return "Les dates doivent rester dans la période de l'événement."
  if (input.weekdays.length === 0) return "Choisissez au moins un jour de la semaine."
  if (input.closures.some((d) => !DATE_RE.test(d))) return "Une date de fermeture n'est pas valide."
  const series = seriesProblem({ date: input.from, startTime: input.startTime, endTime: input.endTime, slotMinutes: input.slotMinutes, breakMinutes: input.breakMinutes })
  if (series) return series
  const { shifts } = generateRecurrence(input)
  if (shifts.length === 0) return "Aucune date ne correspond : vérifiez les jours et la période."
  if (shifts.length > RECURRENCE_MAX_SHIFTS) return `Cette répétition créerait ${shifts.length} créneaux ; le maximum est de ${RECURRENCE_MAX_SHIFTS}. Raccourcissez la période ou espacez les créneaux.`
  return null
}

/** « chaque mercredi », « un samedi sur deux », « chaque mardi et jeudi » for the preview. */
export function describeWeekdays(weekdays: Weekday[], everyWeeks: 1 | 2): string {
  const names = WEEKDAYS.filter((w) => weekdays.includes(w.value)).map((w) => w.label)
  if (names.length === 0) return ""
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`
  return everyWeeks === 2 ? `un ${list} sur deux` : `chaque ${list}`
}

/** Suggested holiday calendar from the organisation's time zone. */
export function defaultHolidayCalendar(timeZone: string): HolidayCalendar {
  if (timeZone === "Europe/Paris") return "FR"
  if (timeZone === "Europe/Zurich") return "CH"
  return "none"
}
