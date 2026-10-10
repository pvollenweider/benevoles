// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Long-running events (#866): a season of weekly permanences holds dozens of dates. Their public
 * page shows one month at a time and leaves past days out, and nobody can sign up for a day that
 * is over. Pure, shared by the public page and the sign-up route.
 */

/** From this span (first to last day), an event runs over weeks: a season, not a weekend. */
export const LONG_EVENT_DAYS = 28
/** From this number of dates, the public page groups them by month. */
export const MONTH_VIEW_MIN_DAYS = 8

const DAY_MS = 86_400_000

/** "YYYY-MM-DD" of a date or an ISO string. */
const isoDay = (d: Date | string) => (typeof d === "string" ? d : d.toISOString()).slice(0, 10)

export function isLongEvent(start: Date | string | null | undefined, end: Date | string | null | undefined): boolean {
  if (!start || !end) return false
  return (Date.parse(`${isoDay(end)}T00:00:00Z`) - Date.parse(`${isoDay(start)}T00:00:00Z`)) / DAY_MS + 1 >= LONG_EVENT_DAYS
}

/** The days a long event shows: today and after. A short event shows them all, as before. */
export function visibleDays(days: string[], today: string, long: boolean): string[] {
  return long ? days.filter((d) => d >= today) : days
}

export type MonthGroup = { key: string; label: string; days: string[] }

/** Days grouped by calendar month, in order: « septembre 2026 ». */
export function groupDaysByMonth(days: string[]): MonthGroup[] {
  const groups: MonthGroup[] = []
  for (const day of [...days].sort()) {
    const key = day.slice(0, 7)
    let group = groups[groups.length - 1]
    if (!group || group.key !== key) {
      const label = new Date(`${key}-01T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" })
      group = { key, label, days: [] }
      groups.push(group)
    }
    group.days.push(day)
  }
  return groups
}

/** Whether the page should group days by month. */
export function usesMonthView(days: string[]): boolean {
  return days.length >= MONTH_VIEW_MIN_DAYS
}

/**
 * A long event's shift whose day is over can't be taken any more (the page doesn't show it, but
 * a page left open overnight still could). Returns the first such shift's label, or null.
 */
export function pastShiftLabel(
  event: { startDate?: Date | string | null; endDate?: Date | string | null },
  shifts: { date: Date | string; label: string }[],
  today: string,
): string | null {
  if (!isLongEvent(event.startDate, event.endDate)) return null
  return shifts.find((s) => isoDay(s.date) < today)?.label ?? null
}
