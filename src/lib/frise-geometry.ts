// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Geometry shared by the day timeline (`DayTimeline.tsx`) and the rule that decides from which
 * screen width the timeline is the default (part B, #1407). One source for the chart's constants
 * and for a day's span, so the width computed here is the one the chart really needs.
 *
 * Pure, no React, no Prisma.
 */
import { crossesMidnight, toMin, toMinEnd } from "./gantt-utils"
import type { ShiftViewSetting } from "./shift-view"

/** Width of the chart's label column, in CSS px. Wide enough for long role names (#217). */
export const LABEL_W = 92
/** The chart stops shrinking below this many px per minute and scrolls sideways instead. */
export const MIN_PX_PER_MIN = 0.6
/** The chart never stretches beyond this many px per minute: a short day stays a readable chart. */
export const MAX_PX_PER_MIN = 2
/** A bar is never narrower than this (24 px, the AA target size). */
export const MIN_BAR_W = 24

/** The page's `px-4`, both sides. */
export const PAGE_GUTTER = 32
/** The scrolling card's 1 px `border`, both sides: it is outside the card's inner width. */
export const CARD_BORDER = 2
/** The chart card's `p-3`, both sides. */
export const CARD_PADDING = 24

/**
 * From this bar width a bar prints its end time and « Complet », « Fermé », « Terminé »
 * (the `@min-[64px]` container query). A shift that crosses midnight prints its long range
 * (« 22h–02h +1 ») from `@min-[92px]`.
 */
export const READABLE_BAR_W = 64
export const READABLE_OVERNIGHT_BAR_W = 92

/** No viewport below this is used as a timeline threshold: phones stay at least 320 px. */
export const MIN_FRISE_WIDTH = 320
/** The timeline never becomes the default later than today's `sm` breakpoint (40rem). */
export const MAX_FRISE_FROM_WIDTH = 640

export type FriseTimeRange = { startTime: string; endTime: string }
export type FriseDay = { shifts: FriseTimeRange[]; shows?: FriseTimeRange[] }

export type DaySpan = { dayStart: number; dayEnd: number; span: number }

/**
 * A day's axis: whole hours around the first start and the last end, both shifts and show bands
 * included, exactly as the chart computes it.
 */
export function daySpan({ shifts, shows = [] }: FriseDay): DaySpan | null {
  const minutes = [
    ...shifts.flatMap((s) => [toMin(s.startTime), toMinEnd(s.endTime, s.startTime)]),
    ...shows.flatMap((s) => [toMin(s.startTime), toMinEnd(s.endTime, s.startTime)]),
  ]
  if (minutes.length === 0) return null
  const dayStart = Math.floor(Math.min(...minutes) / 60) * 60
  const dayEnd = Math.ceil(Math.max(...minutes) / 60) * 60
  return { dayStart, dayEnd, span: dayEnd - dayStart }
}

/** The chart's min-width for a span: the card padding and the label column around the plot. */
export function chartMinWidth(span: number): number {
  return CARD_PADDING + LABEL_W + span * MIN_PX_PER_MIN
}

/** The width a shift needs for its own text: 92 px across midnight, 64 px otherwise. */
function readableBarMin(shift: FriseTimeRange): number {
  return crossesMidnight(shift.startTime, shift.endTime) ? READABLE_OVERNIGHT_BAR_W : READABLE_BAR_W
}

/** Duration of a shift on the day's axis, in minutes; an overnight end counts past midnight. */
function durationOf(shift: FriseTimeRange): number {
  return toMinEnd(shift.endTime, shift.startTime) - toMin(shift.startTime)
}

/**
 * The width of the narrowest bar at a given viewport, in CSS px. `friseDayReadableWidth` inverts
 * this: at the width it returns, the narrowest bar is exactly `READABLE_BAR_W`. The plot is fluid
 * between its scroll floor (`MIN_PX_PER_MIN`) and its stretch ceiling (`MAX_PX_PER_MIN`).
 */
export function narrowestBarWidth(day: FriseDay, viewport: number): number {
  const axis = daySpan(day)
  if (!axis || day.shifts.length === 0) return 0
  // The card's inner width, minus its padding and label column; the plot never gets narrower than
  // its scroll floor (the card scrolls instead) nor wider than its stretch ceiling.
  const plot = Math.min(
    Math.max(viewport - PAGE_GUTTER - CARD_BORDER - CARD_PADDING - LABEL_W, axis.span * MIN_PX_PER_MIN),
    axis.span * MAX_PX_PER_MIN,
  )
  return Math.min(...day.shifts.map((s) => Math.max(MIN_BAR_W, (plot * durationOf(s)) / axis.span)))
}

/**
 * The smallest viewport at which one day's chart neither scrolls nor squeezes a bar too far.
 * `Infinity` when a shift is too short to ever reach its readable width, even with the chart fully
 * stretched: the day is never readable, whatever the screen.
 */
export function friseDayReadableWidth(day: FriseDay): number | null {
  const axis = daySpan(day)
  if (!axis || day.shifts.length === 0) return null
  // A bar is at most `duration × MAX_PX_PER_MIN` wide: a shift under 32 min (46 overnight) can
  // never print its end time and state, however wide the screen.
  if (day.shifts.some((s) => durationOf(s) * MAX_PX_PER_MIN < readableBarMin(s))) return Infinity
  // 32 (page px-4) + 2 (card border) + 24 (card padding) + LABEL_W + the plot the bars need.
  const chartLeft = PAGE_GUTTER + CARD_BORDER + CARD_PADDING + LABEL_W
  const scroll = chartLeft + axis.span * MIN_PX_PER_MIN
  const bars = day.shifts.map((s) => chartLeft + Math.ceil((readableBarMin(s) * axis.span) / durationOf(s)))
  return Math.ceil(Math.max(scroll, ...bars))
}

/**
 * The smallest viewport at which the timeline is readable for every day of the event, all days
 * included (not only the month shown). `null` for an event with no shift; never below 320.
 * `Infinity` when any day holds a shift too short to reach its readable width.
 */
export function friseReadableWidth(days: FriseDay[]): number | null {
  const widths = days.map(friseDayReadableWidth).filter((w): w is number => w !== null)
  if (widths.length === 0) return null
  return Math.max(MIN_FRISE_WIDTH, Math.max(...widths))
}

/**
 * The viewport width from which the timeline is the default. `0` = always (setting « Frise »),
 * `null` = never (setting « Liste », or automatic on a long event: the list on every width).
 */
export function friseFromWidth({ setting, long, readableWidth }: {
  setting: ShiftViewSetting
  long: boolean
  readableWidth: number | null
}): number | null {
  if (setting === "frise") return 0
  if (setting === "liste") return null
  if (long) return null
  return Math.min(readableWidth ?? MAX_FRISE_FROM_WIDTH, MAX_FRISE_FROM_WIDTH)
}
