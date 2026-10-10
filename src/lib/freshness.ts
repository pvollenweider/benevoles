// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Nouveau » / « Mis à jour » on documentation units and videos (#763). The dates are explicit,
 * set by the author when the change is worth pointing out (`added`, `updated` in a unit's front
 * matter or a video's catalogue entry), never taken from git: a typo fix would count. The label
 * expires on its own after FRESHNESS_DAYS, and `new: false` hides it before that. Pure: the pages
 * are rendered per request and pass the request time.
 */

export const FRESHNESS_DAYS = 30

export type Freshness = "new" | "updated"

export const FRESHNESS_LABEL: Record<Freshness, string> = {
  new: "Nouveau",
  updated: "Mis à jour",
}

/** The dates as written by the author, `YYYY-MM-DD`; `hidden` is `new: false`. */
export type FreshnessDates = { added?: string; updated?: string; hidden?: boolean }

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 24 * 60 * 60 * 1000

/** A real calendar date (`2026-02-30` is not), as midnight UTC; null otherwise. */
export function parseCalendarDate(value: string | undefined): Date | null {
  const match = value ? DATE_RE.exec(value) : null
  if (!match) return null
  const [, y, m, d] = match.map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null
}

/** Whether `date` is today or within the FRESHNESS_DAYS days before it (a future date is not). */
function withinWindow(date: Date | null, now: Date, days: number): boolean {
  if (!date) return false
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const age = (today - date.getTime()) / DAY_MS
  return age >= 0 && age < days
}

/**
 * « Nouveau » while `added` is within the window, else « Mis à jour » while `updated` is (and not
 * before `added`); nothing once both have expired, for a future or invalid date, or when hidden.
 */
export function freshness(dates: FreshnessDates, now: Date, days: number = FRESHNESS_DAYS): Freshness | null {
  if (dates.hidden) return null
  const added = parseCalendarDate(dates.added)
  if (withinWindow(added, now, days)) return "new"
  const updated = parseCalendarDate(dates.updated)
  if (added && updated && updated.getTime() < added.getTime()) return null
  return withinWindow(updated, now, days) ? "updated" : null
}

/** The date the label refers to, for a sentence such as « Fiche ajoutée le … ». */
export function freshnessDate(dates: FreshnessDates, kind: Freshness): Date | null {
  return parseCalendarDate(kind === "new" ? dates.added : dates.updated)
}
