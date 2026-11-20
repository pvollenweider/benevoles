// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Load chart of the super-admin statistics page (#1415): shifts per period as stacked bars, the
 * number of distinct events as a line, over a window that reaches as far before today as after it.
 *
 * Pure and Prisma-free: the server loader (src/lib/operator-load-data.ts) only returns plain event
 * facts and one row per (day, event); this module chooses the range, buckets the days (weeks are cut
 * so one starts today), ranks the five biggest events of the range, clips an event's days to the
 * window and computes the two round axes. The client component imports it directly, so no Prisma
 * code ever enters the browser bundle.
 *
 * Dates are calendar days ("YYYY-MM-DD", stored at midnight UTC). "Today" is the civil day in
 * Europe/Zurich, computed once by the loader; no time-zone arithmetic happens here.
 */

import { addDays, civilDayOffset, fillRate } from "./operator-activity"

// ── Ranges ────────────────────────────────────────────────────────────────────────────────────

export type LoadRangeKey = "week" | "month" | "half" | "year"
export type LoadRangeUnit = "day" | "week"

export type LoadRangeDefinition = {
  key: LoadRangeKey
  /** Days on each side of today: the window is [today − days, today + days − 1]. */
  days: number
  /** One bar per day for a week or a month, per week for six months or a year. */
  unit: LoadRangeUnit
  /** Sentence read in the chart's accessible description, lower-case after the colon. */
  label: string
  /** Text of the segmented control. */
  buttonLabel: string
}

export const LOAD_RANGES: Record<LoadRangeKey, LoadRangeDefinition> = {
  week: { key: "week", days: 7, unit: "day", label: "Une semaine de part et d'autre", buttonLabel: "Une semaine" },
  month: { key: "month", days: 31, unit: "day", label: "Un mois de part et d'autre", buttonLabel: "Un mois" },
  half: { key: "half", days: 182, unit: "week", label: "6 mois de part et d'autre", buttonLabel: "6 mois" },
  year: { key: "year", days: 364, unit: "week", label: "Un an de part et d'autre", buttonLabel: "Un an" },
}

/** Reading order of the segmented control. */
export const LOAD_RANGE_KEYS = ["week", "month", "half", "year"] as const

/** « Un mois » on load, as approved in the preview. */
export const DEFAULT_LOAD_RANGE: LoadRangeKey = "month"

/** « Un an : 104 semaines »: what the live region says after a range switch. */
export function rangeAnnouncement(definition: LoadRangeDefinition): string {
  const count = bucketCount(definition)
  const singular = definition.unit === "day" ? "jour" : "semaine"
  const plural = definition.unit === "day" ? "jours" : "semaines"
  return `${definition.buttonLabel} : ${countLabel(count, singular, plural)}`
}

// ── Plain data returned by the server loader ───────────────────────────────────────────────────

export type LoadEvent = {
  id: string
  title: string
  organizationName: string
  /** Super-admin page of the organisation. */
  organizationSlug: string
  /** "YYYY-MM-DD" (stored calendar day). */
  startDate: string
  endDate: string
  /** Archived events are counted, like the published ones; the detail says « (archivé) ». */
  archived: boolean
  /** Whole event: non-cancelled shifts, their capacity and active registrations. */
  shifts: number
  capacity: number
  registrations: number
}

export type LoadDay = {
  /** "YYYY-MM-DD". */
  day: string
  eventId: string
  /** Non-cancelled shifts of that event on that day. */
  shifts: number
  capacity: number
  registrations: number
}

/** What the page passes to the client component: no volunteer data, no Prisma object. */
export type OperatorLoadData = {
  /** The Zurich civil day the window is built around ("YYYY-MM-DD"). */
  today: string
  events: LoadEvent[]
  /** Only (day, event) rows with at least one non-cancelled shift, inside today ± 364 days. */
  days: LoadDay[]
}

// ── Buckets ───────────────────────────────────────────────────────────────────────────────────

export type LoadBucketEvent = {
  eventId: string
  shifts: number
  capacity: number
  registrations: number
}

export type LoadBucket = {
  index: number
  /** Per event shift totals inside the bucket, only for events with at least one shift. */
  byEvent: Record<string, LoadBucketEvent>
  events: number
  /** First and last day of the bucket ("YYYY-MM-DD"). */
  from: string
  to: string
  shifts: number
  capacity: number
  registrations: number
}

export type LoadRange = {
  key: LoadRangeKey
  definition: LoadRangeDefinition
  today: string
  /** First and last day of the whole window, inclusive. */
  start: string
  end: string
  buckets: LoadBucket[]
  /** Index of the bucket containing today (the one that starts today for a weekly range). */
  todayIndex: number
  /** The five events with the most shifts over the range, in colour; ties broken by title then id. */
  topEvents: LoadEvent[]
}

/** The bucket a day offset falls in, before shifting by the first bucket of the window. */
function bucketKey(definition: LoadRangeDefinition, offset: number): number {
  return definition.unit === "day" ? offset : Math.floor(offset / 7)
}

function firstBucketKey(definition: LoadRangeDefinition): number {
  return bucketKey(definition, -definition.days)
}

function bucketIndexForOffset(definition: LoadRangeDefinition, offset: number): number {
  return bucketKey(definition, offset) - firstBucketKey(definition)
}

/** Number of buckets of a range: one per day for a week or a month, one per week otherwise. */
export function bucketCount(definition: LoadRangeDefinition): number {
  return bucketIndexForOffset(definition, definition.days - 1) + 1
}

/**
 * Buckets the loaded days for a range. The window starts `days` days before today and ends
 * `days - 1` days after it: both sides have the same length, and today opens the future side.
 * Weekly buckets are cut so that one starts exactly today; the partial first bucket (six months
 * and a year divide evenly by seven, so there is none) would hold the oldest days.
 */
export function buildLoadRange(data: OperatorLoadData, key: LoadRangeKey): LoadRange {
  const definition = LOAD_RANGES[key]
  const start = addDays(data.today, -definition.days)
  const end = addDays(data.today, definition.days - 1)
  const count = bucketCount(definition)
  const buckets: LoadBucket[] = Array.from({ length: count }, (_, index) => ({
    index,
    byEvent: {},
    events: 0,
    from: "",
    to: "",
    shifts: 0,
    capacity: 0,
    registrations: 0,
  }))
  const indexByDay = new Map<string, number>()

  for (let offset = -definition.days; offset <= definition.days - 1; offset++) {
    const day = addDays(data.today, offset)
    const index = bucketIndexForOffset(definition, offset)
    const bucket = buckets[index]
    if (!bucket.from) bucket.from = day
    bucket.to = day
    indexByDay.set(day, index)
  }

  for (const row of data.days) {
    if (!(row.shifts > 0)) continue
    const index = indexByDay.get(row.day)
    if (index === undefined) continue
    const bucket = buckets[index]
    const capacity = Math.max(0, row.capacity)
    const registrations = Math.max(0, row.registrations)
    bucket.shifts += row.shifts
    bucket.capacity += capacity
    bucket.registrations += registrations
    const current = bucket.byEvent[row.eventId] ?? { eventId: row.eventId, shifts: 0, capacity: 0, registrations: 0 }
    current.shifts += row.shifts
    current.capacity += capacity
    current.registrations += registrations
    bucket.byEvent[row.eventId] = current
  }

  for (const bucket of buckets) bucket.events = Object.keys(bucket.byEvent).length

  const eventById = new Map(data.events.map((event) => [event.id, event]))
  const shiftsByEvent = new Map<string, number>()
  for (const bucket of buckets) {
    for (const [eventId, value] of Object.entries(bucket.byEvent)) {
      shiftsByEvent.set(eventId, (shiftsByEvent.get(eventId) ?? 0) + value.shifts)
    }
  }
  const topEvents = [...shiftsByEvent.entries()]
    .filter(([eventId]) => eventById.has(eventId))
    .sort(
      (a, b) =>
        b[1] - a[1] ||
        eventById.get(a[0])!.title.localeCompare(eventById.get(b[0])!.title, "fr") ||
        a[0].localeCompare(b[0]),
    )
    .slice(0, 5)
    .map(([eventId]) => eventById.get(eventId)!)

  return {
    key,
    definition,
    today: data.today,
    start,
    end,
    buckets,
    todayIndex: indexByDay.get(data.today) ?? bucketIndexForOffset(definition, 0),
    topEvents,
  }
}

/** The bucket index of a day inside the window, null outside it. */
export function bucketIndexForDay(range: Pick<LoadRange, "today" | "definition">, day: string): number | null {
  const offset = civilDayOffset(day, range.today)
  if (offset < -range.definition.days || offset > range.definition.days - 1) return null
  return bucketIndexForOffset(range.definition, offset)
}

/** The period's events, most shifts first; `colorIndex` is their rank in the legend, −1 for « Autres ». */
export type LoadPeriodRow = {
  event: LoadEvent
  shifts: number
  capacity: number
  registrations: number
  colorIndex: number
}

export function periodEventRows(range: LoadRange, data: OperatorLoadData, bucketIndex: number): LoadPeriodRow[] {
  const bucket = range.buckets[bucketIndex]
  if (!bucket) return []
  const eventById = new Map(data.events.map((event) => [event.id, event]))
  return Object.values(bucket.byEvent)
    .flatMap((value) => {
      const event = eventById.get(value.eventId)
      if (!event) return []
      return [{ event, shifts: value.shifts, capacity: value.capacity, registrations: value.registrations, colorIndex: range.topEvents.findIndex((candidate) => candidate.id === event.id) }]
    })
    .sort((a, b) => b.shifts - a.shifts || a.event.title.localeCompare(b.event.title, "fr") || a.event.id.localeCompare(b.event.id))
}

// ── Event band and event detail ───────────────────────────────────────────────────────────────

export type LoadEventBand = {
  /** First and last bucket covering the event's days inside the window, inclusive. */
  fromIndex: number
  toIndex: number
  /** The event starts before the window and/or ends after it: the label gets « ← » / « → ». */
  startsBefore: boolean
  endsAfter: boolean
}

/** The event's days clipped to the window, or null when it does not overlap it. */
export function eventBand(range: LoadRange, event: LoadEvent): LoadEventBand | null {
  const from = event.startDate < range.start ? range.start : event.startDate
  const to = event.endDate > range.end ? range.end : event.endDate
  if (from > to) return null
  const fromIndex = bucketIndexForDay(range, from)
  const toIndex = bucketIndexForDay(range, to)
  if (fromIndex === null || toIndex === null) return null
  return { fromIndex, toIndex, startsBefore: event.startDate < range.start, endsAfter: event.endDate > range.end }
}

export type LoadEventDay = { day: string; shifts: number; capacity: number; registrations: number }

export type LoadEventDetail = {
  event: LoadEvent
  /** The event's days inside the displayed window, oldest first. */
  days: LoadEventDay[]
  /** Totals over those days, not over the whole event. */
  shifts: number
  capacity: number
  registrations: number
  /** Whole-event active registrations over the whole-event capacity, 0–100; null without places. */
  fillPercent: number | null
}

/** The detail panel of a chosen event: its whole-event facts plus its days inside the range. */
export function eventDetail(range: LoadRange, data: OperatorLoadData, eventId: string): LoadEventDetail | null {
  const event = data.events.find((candidate) => candidate.id === eventId)
  if (!event) return null
  const days = data.days
    .filter((row) => row.eventId === eventId && row.shifts > 0 && row.day >= range.start && row.day <= range.end)
    .map((row) => ({ day: row.day, shifts: row.shifts, capacity: Math.max(0, row.capacity), registrations: Math.max(0, row.registrations) }))
    .sort((a, b) => a.day.localeCompare(b.day))
  const totals = days.reduce(
    (sum, day) => ({ shifts: sum.shifts + day.shifts, capacity: sum.capacity + day.capacity, registrations: sum.registrations + day.registrations }),
    { shifts: 0, capacity: 0, registrations: 0 },
  )
  return {
    event,
    days,
    shifts: totals.shifts,
    capacity: totals.capacity,
    registrations: totals.registrations,
    fillPercent: fillRate(event.registrations, event.capacity),
  }
}

// ── Axes ─────────────────────────────────────────────────────────────────────────────────────

export type LoadAxis = {
  /** Round step between two ticks, at least 1. */
  step: number
  /** Number of intervals: ticks has tickCount + 1 entries (0 included). */
  tickCount: number
  /** step × tickCount, always at least the largest value. */
  max: number
  ticks: number[]
}

/** A round step of 1, 2, 5 or 10 times a power of ten, never below 1: counts never get a decimal tick. */
export function niceStep(maxValue: number, targetTicks = 5): number {
  const raw = maxValue / targetTicks
  const power = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const fraction = raw / power
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return Math.max(1, nice * power)
}

/** An axis with only the ticks it needs: at most `targetTicks` intervals, and no empty tick above. */
export function axisFor(maxValue: number): LoadAxis {
  const raw = Math.max(1, maxValue)
  const step = niceStep(raw)
  const tickCount = Math.ceil(raw / step)
  const max = step * tickCount
  return {
    step,
    tickCount,
    max,
    ticks: Array.from({ length: tickCount + 1 }, (_, index) => Number((step * index).toFixed(6))),
  }
}

/** The shifts axis (left) and the events axis (right), each with its own round step. */
export function loadAxes(buckets: readonly LoadBucket[]): { shifts: LoadAxis; events: LoadAxis } {
  return {
    shifts: axisFor(Math.max(0, ...buckets.map((bucket) => bucket.shifts))),
    events: axisFor(Math.max(0, ...buckets.map((bucket) => bucket.events))),
  }
}

// ── Titles and qualifiers ────────────────────────────────────────────────────────────────────

const LONG_DAY = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" })
const SHORT_DAY = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "short" })
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })
const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })

const dayDate = (day: string): Date => new Date(`${day}T00:00:00Z`)

/** « vendredi 20 novembre »: the long label of one day in the detail. */
export function formatLongDay(day: string): string {
  return LONG_DAY.format(dayDate(day))
}

/** « 20 nov. »: the short label of the x axis and of a week's first day. */
export function formatShortDay(day: string): string {
  return SHORT_DAY.format(dayDate(day))
}

const MONTH_YEAR = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "short", year: "2-digit" })
const DAY_MONTH_LONG_YEAR = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })

/** Axis label of a period: « 20 nov. » up to a month either side, « 20 nov. 26 » beyond, where a year spans two Novembers. */
export function formatAxisDay(day: string, rangeDays: number): string {
  return rangeDays > 31 ? MONTH_YEAR.format(dayDate(day)) : SHORT_DAY.format(dayDate(day))
}

/** « 9 juin 2026 »: a day with its full year, for the chart's accessible description. */
export function formatDayWithYear(day: string): string {
  return DAY_MONTH_LONG_YEAR.format(dayDate(day))
}

/** « 0 événement », « 1 événement », « 3 événements » (French: singular below two): the counts written in the detail, tooltip and labels. */
export function countLabel(value: number, singular: string, plural: string): string {
  return `${formatLoadNumber(value)} ${value < 2 ? singular : plural}`
}

/** « vendredi 20 novembre » or « Semaine du 17 nov. au 23 nov. 2026 ». */
export function periodTitle(bucket: Pick<LoadBucket, "from" | "to">, unit: LoadRangeUnit): string {
  return unit === "day"
    ? LONG_DAY.format(dayDate(bucket.from))
    : `Semaine du ${SHORT_DAY.format(dayDate(bucket.from))} au ${DAY_MONTH_YEAR.format(dayDate(bucket.to))}`
}

/**
 * The qualifier that says where the period stands: « (passé) », « (aujourd'hui) » for a day,
 * « (semaine en cours) » for the week that contains today, nothing for a future period.
 */
export function periodQualifier(bucket: Pick<LoadBucket, "from" | "to">, today: string, unit: LoadRangeUnit): string {
  if (bucket.to < today) return " (passé)"
  if (bucket.from <= today && today <= bucket.to) return unit === "day" ? " (aujourd'hui)" : " (semaine en cours)"
  return ""
}

/** French number formatting shared by the chart, the legend and the detail tables. */
export function formatLoadNumber(value: number): string {
  return NUMBER_FORMAT.format(value)
}

/** Accessible label of a period button: its date or week, its place in time, shifts, events, registrations. */
export function periodAriaLabel(bucket: LoadBucket, today: string, unit: LoadRangeUnit): string {
  const qualifier = periodQualifier(bucket, today, unit)
  return `${periodTitle(bucket, unit)}${qualifier} : ${countLabel(bucket.shifts, "créneau", "créneaux")}, ${countLabel(bucket.events, "événement", "événements")}, ${countLabel(bucket.registrations, "inscrit", "inscrits")}. Afficher le détail.`
}

/** The detail heading of a period, also announced by the live region: date, qualifier and counts. */
export function detailHeadingFor(bucket: LoadBucket, today: string, unit: LoadRangeUnit): string {
  const qualifier = periodQualifier(bucket, today, unit)
  return `${periodTitle(bucket, unit)}${qualifier} : ${countLabel(bucket.events, "événement", "événements")}, ${countLabel(bucket.shifts, "créneau", "créneaux")}, ${countLabel(bucket.registrations, "inscrit", "inscrits")}`
}

/**
 * Accessible description of the chart, replacing the facts the sighted reader gets from the hidden
 * SVG (axes, past shading, today rule) and naming the exact window.
 */
export function loadDescription(definition: LoadRangeDefinition, start: string, end: string): string {
  const unitWord = definition.unit === "day" ? "jour" : "semaine"
  return `Les barres empilées donnent les créneaux par ${unitWord} (axe de gauche, les cinq plus gros événements de la période en couleur) et la courbe le nombre d'événements avec au moins un créneau (axe de droite). Le passé est grisé (événements archivés compris) et une règle marque aujourd'hui. Période affichée : ${definition.label.toLowerCase()}, du ${formatDayWithYear(start)} au ${formatDayWithYear(end)}.`
}

/** « ce jour » / « cette semaine » in the detail captions. */
export function periodWord(unit: LoadRangeUnit): string {
  return unit === "day" ? "ce jour" : "cette semaine"
}
