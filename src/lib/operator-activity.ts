// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Platform activity for the super-admin statistics page (#1415): where the events stand, how fast
 * registrations arrive compared with the previous period and the busiest hour. Pure and
 * Prisma-free: the queries are in src/lib/operator-activity-data.ts; the load chart has its own
 * pure module, src/lib/operator-load.ts.
 *
 * Event dates are calendar days stored at midnight UTC (see src/lib/time-zone.ts). "Today" is the
 * civil day in APP_TIME_ZONE (Europe/Zurich by default): at 00:30 in Zurich, a UTC day is still the
 * previous one. Drafts and archived events never count; unlisted events are published, so they do.
 */

import { APP_TIME_ZONE } from "./time-zone"

const DAY_MS = 86_400_000

/** Calendar formatters, one per zone (building one costs more than formatting with it). */
const civilFormatters = new Map<string, Intl.DateTimeFormat>()

function civilFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = civilFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    civilFormatters.set(timeZone, formatter)
  }
  return formatter
}

/** The civil day ("YYYY-MM-DD") of an instant in `timeZone` (APP_TIME_ZONE by default). */
export function civilDate(instant: Date, timeZone: string = APP_TIME_ZONE): string {
  const parts = civilFormatter(timeZone).formatToParts(instant)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

/** The stored calendar day ("YYYY-MM-DD") of an event date (midnight UTC, as entered). */
export function isoDay(date: Date | string): string {
  return typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10)
}

/** `day` shifted by `days` civil days, without any time-zone arithmetic (dates are plain days). */
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, date) + days * DAY_MS).toISOString().slice(0, 10)
}

// ── Events: happening now, starting soon ─────────────────────────────────────────────────────

export type EventWindowFacts = {
  publicStatus: string
  isListed: boolean
  startDate: Date | string
  endDate: Date | string
}

export type EventWindowCategory = "now" | "soon7" | "soon30" | "later" | "past" | "not_published"

/**
 * Where an event falls from `now`:
 * - "now": a single day between its start and end day is today in APP_TIME_ZONE (a multi-day event
 *   spanning today counts every day it runs);
 * - "soon7" / "soon30": it starts after today, within 7 / 30 days (exclusive buckets: an event in
 *   3 days is "soon7", one in 10 days is "soon30");
 * - "past": its last day was yesterday or earlier;
 * - "later": it starts more than 30 days from today;
 * - "not_published": a draft or an archived event (unlisted published events are counted).
 */
export function eventWindowCategory(event: EventWindowFacts, now: Date, timeZone: string = APP_TIME_ZONE): EventWindowCategory {
  if (event.publicStatus !== "published") return "not_published"
  const today = civilDate(now, timeZone)
  const start = isoDay(event.startDate)
  const end = isoDay(event.endDate)
  if (start <= today && end >= today) return "now"
  if (end < today) return "past"
  if (start <= addDays(today, 7)) return "soon7"
  if (start <= addDays(today, 30)) return "soon30"
  return "later"
}

export type EventWindowCounts = {
  /** Published events whose days include today. */
  now: number
  /** Published events starting after today and within 7 days. */
  startingWithin7: number
  /** Published events starting after today and within 30 days (includes startingWithin7). */
  startingWithin30: number
}

export function eventWindowCounts(events: readonly EventWindowFacts[], now: Date, timeZone: string = APP_TIME_ZONE): EventWindowCounts {
  const counts: EventWindowCounts = { now: 0, startingWithin7: 0, startingWithin30: 0 }
  for (const event of events) {
    const category = eventWindowCategory(event, now, timeZone)
    if (category === "now") counts.now += 1
    else if (category === "soon7") {
      counts.startingWithin7 += 1
      counts.startingWithin30 += 1
    } else if (category === "soon30") counts.startingWithin30 += 1
  }
  return counts
}

/** The situation shown in the 10-next-events table: the window category, or « plus tard ». */
export type UpcomingSituation = "now" | "soon7" | "soon30" | "later"

export const UPCOMING_SITUATION_LABELS: Record<UpcomingSituation, string> = {
  now: "En cours",
  soon7: "Début dans les 7 jours",
  soon30: "Début dans 8 à 30 jours",
  later: "Début dans plus de 30 jours",
}

/**
 * Where a published event of the 10-next-events list stands. The list only contains events ending
 * today or later, so a past or unpublished category is never reached there; anything past the
 * 30-day window reads « Plus tard ».
 */
export function upcomingSituation(event: EventWindowFacts, now: Date, timeZone: string = APP_TIME_ZONE): UpcomingSituation {
  const category = eventWindowCategory(event, now, timeZone)
  if (category === "now" || category === "soon7" || category === "soon30") return category
  return "later"
}

// ── Registration windows ─────────────────────────────────────────────────────────────────────

export type RegistrationWindowFacts = {
  publicStatus: string
  /** Open unless explicitly false (the column defaults to true). */
  registrationsOpen?: boolean | null
  registrationOpensAt?: Date | string | null
  registrationClosesAt?: Date | string | null
}

function toDate(value: Date | string | null | undefined): Date | null {
  return value == null ? null : value instanceof Date ? value : new Date(value)
}

/** The rule of src/lib/registration-window.ts, kept here for the counts (published events only). */
export function registrationsOpenNow(event: RegistrationWindowFacts, now: Date): boolean {
  if (event.publicStatus !== "published" || event.registrationsOpen === false) return false
  const opensAt = toDate(event.registrationOpensAt)
  const closesAt = toDate(event.registrationClosesAt)
  if (opensAt && now < opensAt) return false
  if (closesAt && now >= closesAt) return false
  return true
}

/** Whether a published event's registrations are scheduled to open in the next `days` days. */
export function registrationOpeningSoon(event: RegistrationWindowFacts, now: Date, days = 7): boolean {
  if (event.publicStatus !== "published" || event.registrationsOpen === false) return false
  const opensAt = toDate(event.registrationOpensAt)
  return opensAt != null && opensAt > now && opensAt.getTime() <= now.getTime() + days * DAY_MS
}

// ── Registration rhythm and comparisons ─────────────────────────────────────────────────────

export type ActivityCounts = {
  lastHour: number
  previousHour: number
  last24h: number
  previous24h: number
  last7d: number
  previous7d: number
}

export type PeriodComparison = {
  current: number
  previous: number
  delta: number
  /** Percentage change, null when the previous period had no registration (no division by zero). */
  percent: number | null
  direction: "up" | "down" | "flat"
  /** A short French phrase, never colour alone: « en hausse de 25 % par rapport à la période précédente ». */
  text: string
}

function registrations(count: number): string {
  return `${count} inscription${count > 1 ? "s" : ""}`
}

/** One period against the previous one of the same length. */
export function comparePeriods(current: number, previous: number): PeriodComparison {
  const c = Math.max(0, Math.round(current))
  const p = Math.max(0, Math.round(previous))
  const delta = c - p
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat"
  if (p === 0) {
    return {
      current: c,
      previous: p,
      delta,
      percent: null,
      direction,
      text: c === 0 ? "aucune inscription sur les deux périodes" : "aucune inscription sur la période précédente",
    }
  }
  const percent = Math.round((delta / p) * 100)
  if (percent === 0) {
    return {
      current: c,
      previous: p,
      delta,
      percent,
      direction,
      text: delta === 0 ? "stable par rapport à la période précédente" : `${delta > 0 ? "+" : ""}${delta} inscription${Math.abs(delta) > 1 ? "s" : ""} par rapport à la période précédente`,
    }
  }
  return {
    current: c,
    previous: p,
    delta,
    percent,
    direction,
    text: `${delta > 0 ? "en hausse" : "en baisse"} de ${Math.abs(percent)} % par rapport à la période précédente`,
  }
}

export type ActivityRow = { key: "hour" | "day" | "week"; label: string; current: number; comparison: PeriodComparison }

/** The three rows of the activity table, each with its previous period. */
export function activityRows(counts: ActivityCounts): ActivityRow[] {
  const rows: { key: ActivityRow["key"]; label: string; current: number; previous: number }[] = [
    { key: "hour", label: "Dernière heure", current: counts.lastHour, previous: counts.previousHour },
    { key: "day", label: "Dernières 24 heures", current: counts.last24h, previous: counts.previous24h },
    { key: "week", label: "7 derniers jours", current: counts.last7d, previous: counts.previous7d },
  ]
  return rows.map((row) => ({ key: row.key, label: row.label, current: row.current, comparison: comparePeriods(row.current, row.previous) }))
}

export type HourBucket = {
  /** The Zurich local hour, "YYYY-MM-DDTHH". */
  hour: string
  count: number
}

/** The hour with the most registrations; the earliest hour wins a tie; null when there is none. */
export function busiestHour(buckets: readonly HourBucket[]): HourBucket | null {
  let best: HourBucket | null = null
  for (const bucket of buckets) {
    const count = Math.round(bucket.count)
    if (!Number.isFinite(count) || count <= 0) continue
    if (!best || count > best.count || (count === best.count && bucket.hour < best.hour)) {
      best = { hour: bucket.hour, count }
    }
  }
  return best
}

const WEEKDAYS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"]
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]

/** « jeudi 9 juillet, de 18h à 19h » for a bucket returned by the SQL aggregate. */
export function hourBucketLabel(hour: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2})/.exec(hour)
  if (!match) return hour
  const [, year, month, day, localHour] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  const start = Number(localHour)
  const next = (start + 1) % 24
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}, de ${start}h à ${next}h`
}

export function busiestHourSentence(bucket: HourBucket | null): string {
  if (!bucket) return "Aucune inscription sur les 7 derniers jours."
  return `${hourBucketLabel(bucket.hour)} : ${registrations(bucket.count)}`
}

// ── Calendar day offsets ────────────────────────────────────────────────────────────────────

/** Number of civil days from `today` to `day` (both "YYYY-MM-DD"), positive in the future. */
export function civilDayOffset(day: string, today: string): number {
  const [year, month, date] = day.split("-").map(Number)
  const [todayYear, todayMonth, todayDate] = today.split("-").map(Number)
  return Math.round((Date.UTC(year, month - 1, date) - Date.UTC(todayYear, todayMonth - 1, todayDate)) / DAY_MS)
}

// ── Formatting ──────────────────────────────────────────────────────────────────────────────

const fullDate = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })
const dayOfMonth = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric" })
const monthAndYear = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" })

/** « 10 juillet 2026 », « 10–12 juillet 2026 » or « 30 juin – 2 juillet 2026 » (stored days, read in UTC). */
export function eventDatesLabel(startDate: Date | string, endDate: Date | string): string {
  const start = isoDay(startDate)
  const end = isoDay(endDate)
  const startAt = new Date(`${start}T00:00:00Z`)
  const endAt = new Date(`${end}T00:00:00Z`)
  if (start === end) return fullDate.format(startAt)
  if (start.slice(0, 4) === end.slice(0, 4) && start.slice(0, 7) === end.slice(0, 7)) {
    return `${dayOfMonth.format(startAt)}–${dayOfMonth.format(endAt)} ${monthAndYear.format(endAt)}`
  }
  return `${fullDate.format(startAt)} – ${fullDate.format(endAt)}`
}

/** Filled share of an event, 0–100; null when its shifts have no place at all. */
export function fillRate(registrations: number, capacity: number): number | null {
  if (!Number.isFinite(capacity) || capacity <= 0) return null
  return Math.max(0, Math.min(100, Math.round((registrations / capacity) * 100)))
}
