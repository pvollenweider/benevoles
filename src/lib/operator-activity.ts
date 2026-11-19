// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Platform activity for the super-admin statistics page (#1415): where the events stand, how fast
 * registrations arrive compared with the previous period, the busiest hour, and the bubble chart
 * of the events that weigh on the platform. Pure and Prisma-free: the queries are in
 * src/lib/operator-activity-data.ts, the client chart builds its config from these functions.
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

// ── Bubble chart: the weight of each event ──────────────────────────────────────────────────

export type BubbleCategory = "now" | "within7" | "within30"

export const BUBBLE_CATEGORY_LABELS: Record<BubbleCategory, string> = {
  now: "En cours",
  within7: "Début dans les 7 jours",
  within30: "Début dans 8 à 30 jours",
}

/** Shape used by the chart's pointStyle, repeated in the table so the situation never relies on colour. */
export const BUBBLE_CATEGORY_SYMBOLS: Record<BubbleCategory, string> = {
  now: "●",
  within7: "▲",
  within30: "■",
}

export type BubbleEventFacts = EventWindowFacts & {
  id: string
  title: string
  organizationName: string
  shifts: number
  registrations: number
  roles: number
}

/** Number of civil days from `today` to `day` (both "YYYY-MM-DD"), positive in the future. */
export function civilDayOffset(day: string, today: string): number {
  const [year, month, date] = day.split("-").map(Number)
  const [todayYear, todayMonth, todayDate] = today.split("-").map(Number)
  return Math.round((Date.UTC(year, month - 1, date) - Date.UTC(todayYear, todayMonth - 1, todayDate)) / DAY_MS)
}

export type BubblePoint = {
  id: string
  title: string
  organizationName: string
  /** "YYYY-MM-DD" (the stored calendar day). */
  startDate: string
  endDate: string
  category: BubbleCategory
  /** Real values, also shown in the table and the tooltip. */
  shifts: number
  registrations: number
  roles: number
  /** Days from today (Zurich civil day) to the event's start day; negative when it already started. */
  x: number
  /** Registrations, capped only when one event dwarfs the others. */
  y: number
  radius: number
  /** Whether the point sits on the capped registrations axis. */
  clampedY: boolean
}

export type BubbleAxis = {
  /** Date axis bounds, in days from today; always includes today (0) and the 30-day horizon. */
  xMin: number
  xMax: number
  /** Registrations axis maximum set when the data has an outlier, null for the automatic scale. */
  yMax: number | null
  capped: boolean
}

export type BubbleChartData = {
  points: BubblePoint[]
  axis: BubbleAxis
  /** The Zurich civil day the chart is built from ("YYYY-MM-DD"). */
  today: string
  /** One visible sentence: « 12 événements, le plus gros : … ». */
  summary: string
  empty: boolean
}

/** Last charted start day, in days from today. */
export const BUBBLE_DATE_HORIZON_DAYS = 30
/** Empty days kept on each side of the date axis so an edge bubble is not cut in half. */
export const BUBBLE_DATE_MARGIN_DAYS = 2

/** Largest bubble radius, in CSS pixels; the area grows with the number of créneaux. */
export const BUBBLE_MAX_RADIUS = 26
/** Smallest radius, so an event with one créneau stays visible (its area is then slightly over-proportional). */
export const BUBBLE_MIN_RADIUS = 6

/** Radius from the number of créneaux: the area is proportional to them (radius ∝ √créneaux). */
export function bubbleRadius(shifts: number, maxShifts: number): number {
  if (shifts <= 0 || maxShifts <= 0) return BUBBLE_MIN_RADIUS
  return Math.max(BUBBLE_MIN_RADIUS, (BUBBLE_MAX_RADIUS * Math.sqrt(shifts)) / Math.sqrt(maxShifts))
}

/**
 * A capped linear axis rather than a log scale: a published event may have 0 créneau or 0
 * inscription, which a logarithmic axis cannot place. When one event dwarfs the others (at least
 * 4× the second value and 10 units above it), its coordinate is clamped to the cap and the table
 * keeps the real values; the summary says so.
 */
export function chartAxisCap(values: readonly number[]): number | null {
  const sorted = values.filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => b - a)
  if (sorted.length < 2) return null
  const [max, second] = sorted
  if (max - second < 10) return null
  if (max < 4 * Math.max(second, 1)) return null
  return Math.max(1, Math.ceil(second * 1.25))
}

function bubbleCategory(event: EventWindowFacts, now: Date, timeZone: string): BubbleCategory | null {
  const category = eventWindowCategory(event, now, timeZone)
  if (category === "now") return "now"
  if (category === "soon7") return "within7"
  if (category === "soon30") return "within30"
  return null
}

function bubbleSummary(points: readonly BubblePoint[], axis: BubbleAxis): string {
  if (points.length === 0) return "Aucun événement en cours ou dans les 30 jours."
  // « Le plus gros » is the largest bubble (créneaux), then the busiest in registrations.
  const biggest = [...points].sort((a, b) => b.shifts - a.shifts || b.registrations - a.registrations || a.title.localeCompare(b.title, "fr"))[0]
  const count = `${points.length} événement${points.length > 1 ? "s" : ""}`
  const weight = `${biggest.shifts} créneau${biggest.shifts > 1 ? "x" : ""}, ${registrations(biggest.registrations)}, ${biggest.roles} poste${biggest.roles > 1 ? "s" : ""}`
  const cap = axis.yMax === null ? null : capSentence(points, axis.yMax)
  const capText = cap === null ? "" : ` ; ${cap} ; le tableau donne les valeurs réelles`
  return `${count} ; le plus gros : « ${biggest.title} » (${weight})${capText}.`
}

/** The event furthest past the capped registrations axis, with its real value: « l'axe des inscriptions est plafonné à 25 ; « X » le dépasse (400) ». */
function capSentence(points: readonly BubblePoint[], cap: number): string | null {
  const over = points.filter((point) => point.clampedY)
  if (over.length === 0) return null
  const worst = over.reduce((best, point) => (point.registrations > best.registrations ? point : best))
  return `l'axe des inscriptions est plafonné à ${cap} ; « ${worst.title} » le dépasse (${worst.registrations})`
}

/**
 * One bubble per published event happening now or starting within 30 days (drafts, archived and
 * past events excluded; unlisted events included, they are published). x = the event's start day in
 * days from today (a multi-day event keeps its real start, even before today), y = inscriptions,
 * area = créneaux; the category is now / within 7 days / within 30 days. The date axis is never
 * capped; only the registrations axis is, when one event dwarfs the others.
 */
export function bubbleChartData(events: readonly BubbleEventFacts[], now: Date, timeZone: string = APP_TIME_ZONE): BubbleChartData {
  const today = civilDate(now, timeZone)
  const chosen: { event: BubbleEventFacts; category: BubbleCategory }[] = []
  for (const event of events) {
    const category = bubbleCategory(event, now, timeZone)
    if (category) chosen.push({ event, category })
  }
  // The table reads this order: by start date, then the busiest, so rows are stable.
  chosen.sort(
    (a, b) =>
      isoDay(a.event.startDate).localeCompare(isoDay(b.event.startDate)) ||
      b.event.registrations - a.event.registrations ||
      a.event.title.localeCompare(b.event.title, "fr") ||
      a.event.id.localeCompare(b.event.id),
  )

  const maxShifts = chosen.reduce((max, { event }) => Math.max(max, Math.max(0, event.shifts)), 0)
  const yMax = chartAxisCap(chosen.map(({ event }) => event.registrations))
  const offsets = chosen.map(({ event }) => civilDayOffset(isoDay(event.startDate), today))
  const xMin = Math.min(0, ...offsets) - BUBBLE_DATE_MARGIN_DAYS
  const xMax = BUBBLE_DATE_HORIZON_DAYS + BUBBLE_DATE_MARGIN_DAYS

  const points: BubblePoint[] = chosen.map(({ event, category }, index) => {
    const shifts = Math.max(0, event.shifts)
    const regs = Math.max(0, event.registrations)
    const y = yMax === null ? regs : Math.min(regs, yMax)
    return {
      id: event.id,
      title: event.title,
      organizationName: event.organizationName,
      startDate: isoDay(event.startDate),
      endDate: isoDay(event.endDate),
      category,
      shifts,
      registrations: regs,
      roles: Math.max(0, event.roles),
      x: offsets[index],
      y,
      radius: bubbleRadius(shifts, maxShifts),
      clampedY: yMax !== null && regs > yMax,
    }
  })

  const axis: BubbleAxis = { xMin, xMax, yMax, capped: yMax !== null }
  return { points, axis, today, summary: bubbleSummary(points, axis), empty: points.length === 0 }
}

// ── Formatting ──────────────────────────────────────────────────────────────────────────────

const fullDate = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })
const dayOfMonth = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric" })
const monthAndYear = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" })
const shortDate = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "short" })

/** Date-axis tick: « Aujourd'hui » for day 0, otherwise a short French date (« 20 nov. »). */
export function bubbleDateTickLabel(offsetDays: number, today: string): string {
  const offset = Math.round(offsetDays)
  if (offset === 0) return "Aujourd'hui"
  return shortDate.format(new Date(`${addDays(today, offset)}T00:00:00Z`))
}

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
