// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Split rule and band geometry for the printable day sheet (#1431).
 *
 * A day with many short shifts is unreadable as one timeline: each shift bar is a few pixels wide
 * and its names stack letter by letter. Such a day is printed as a compact overview strip (one
 * cell per shift, only "inscrits/places") followed by 6-hour bands whose time axis is wide enough
 * for names, one per line. The day's detail table is left out: the bands already carry the names.
 *
 * The thresholds are deliberately explicit and documented here, because they decide what the
 * printed sheet looks like:
 *
 * - a day is dense when it has at least 12 shifts of 60 minutes or less AND spans more than
 *   8 hours (480 minutes);
 * - it is also dense when the narrowest shift would be under 28 px wide on the current single
 *   timeline. That width is computed from the existing column layout (`ganttColumnWidths`: an
 *   11 % role column — 9 % when a label column is printed — and the rest split equally between
 *   the day's 15-minute slots) over the printable width of an A4 landscape page with the sheet's
 *   1.2 cm side margins (273 mm, about 1032 px at 96 dpi).
 *
 * Bands are the fixed 0–6 / 6–12 / 12–18 / 18–24 windows, clipped to the hours the day actually
 * uses; only windows containing a shift are printed. Within a band the step is 30 minutes, or the
 * day's own regular step when every shift boundary falls on a common 15, 20, 30 or 60-minute grid.
 * The step never exceeds 60 minutes and always divides an hour, so hour labels land on a column.
 *
 * Pure: times in, numbers out, no Prisma and no HTML.
 */
import { ganttColumnWidths, toMin, toMinEnd } from "./gantt-utils"

/** A shift with the only fields the rule and the band geometry need (role/label only widen the axis). */
export type BandTimingShift = { startTime: string; endTime: string; roleName?: string; label?: string }

/** Short-shift threshold and minimum count of part of the dense-day rule. */
export const SHORT_SHIFT_MAX_MINUTES = 60
export const MIN_SHORT_SHIFTS = 12
/** The day must span strictly more than this many minutes (8 hours) for the count rule. */
export const MIN_DAY_SPAN_MINUTES = 8 * 60
/** Below this printed width (CSS px at 96 dpi), a shift bar is not readable. */
export const MIN_SHIFT_WIDTH_PX = 28
/**
 * Printable width of the A4 landscape sheet: 297 mm minus the 1.2 cm side margins of the sheet's
 * @page rule, converted at 96 dpi. `ganttColumnWidths` percentages apply to this width.
 */
export const PRINTED_TIMELINE_WIDTH_PX = Math.round(((297 - 2 * 12) / 25.4) * 96)
/** Default band column, also used when the day has no regular step. */
export const DEFAULT_BAND_STEP_MINUTES = 30
/** Width of one band. */
export const BAND_MINUTES = 6 * 60

/** A printed band, in minutes since midnight; a window past midnight carries `nextDay`. */
export type DayBand = { startMin: number; endMin: number; nextDay: boolean }

/** A day's chronological bounds and the step its band/overview columns use. */
export type DayAxis = { startMin: number; endMin: number; step: number }

function shiftRange(s: BandTimingShift): { start: number; end: number } {
  return { start: toMin(s.startTime), end: toMinEnd(s.endTime, s.startTime) }
}

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b)
}

/**
 * The regular grid the day's shift boundaries follow: 60, 30, 20 or 15 minutes, or the 30-minute
 * default when they share no such grid (an irregular day, or an odd end such as 23:59). Keeping a
 * divisor of 60 guarantees an hour label on a column.
 */
export function bandStepMinutes(shifts: BandTimingShift[]): number {
  if (shifts.length === 0) return DEFAULT_BAND_STEP_MINUTES
  let step = 0
  for (const s of shifts) {
    const r = shiftRange(s)
    step = gcd(step, r.start)
    step = gcd(step, r.end)
  }
  for (const candidate of [60, 30, 20, 15]) if (step % candidate === 0) return candidate
  return DEFAULT_BAND_STEP_MINUTES
}

/** The day's used range, rounded out to its band step so the first and last columns are whole. */
export function dayAxis(shifts: BandTimingShift[]): DayAxis {
  if (shifts.length === 0) return { startMin: 0, endMin: 0, step: DEFAULT_BAND_STEP_MINUTES }
  const ranges = shifts.map(shiftRange)
  const step = bandStepMinutes(shifts)
  const start = Math.min(...ranges.map((r) => r.start))
  const end = Math.max(...ranges.map((r) => r.end))
  return { startMin: Math.floor(start / step) * step, endMin: Math.ceil(end / step) * step, step }
}

/**
 * The 6-hour windows the day uses, clipped to its start and end and in chronological order. A
 * window with no shift is omitted; a shift running past midnight adds a "next day" window.
 */
export function dayBands(shifts: BandTimingShift[]): DayBand[] {
  if (shifts.length === 0) return []
  const { startMin: dayStart, endMin: dayEnd } = dayAxis(shifts)
  const ranges = shifts.map(shiftRange)
  const bands: DayBand[] = []
  for (let windowStart = 0; windowStart < dayEnd; windowStart += BAND_MINUTES) {
    const startMin = Math.max(windowStart, dayStart)
    const endMin = Math.min(windowStart + BAND_MINUTES, dayEnd)
    if (endMin <= startMin) continue
    if (!ranges.some((r) => r.start < endMin && r.end > startMin)) continue
    bands.push({ startMin, endMin, nextDay: windowStart >= 1440 })
  }
  return bands
}

/**
 * Whether the printable day sheet splits this day into bands (#1431). Both conditions count:
 * the many-short-shifts rule and the printed-width rule. Non-split days keep today's single
 * timeline and its detail table exactly as before.
 */
export function shouldSplitDay(shifts: BandTimingShift[]): boolean {
  if (shifts.length === 0) return false
  const ranges = shifts.map(shiftRange)
  const shortShifts = ranges.filter((r) => r.end - r.start <= SHORT_SHIFT_MAX_MINUTES).length
  const span = Math.max(...ranges.map((r) => r.end)) - Math.min(...ranges.map((r) => r.start))
  if (shortShifts >= MIN_SHORT_SHIFTS && span > MIN_DAY_SPAN_MINUTES) return true

  // Printed-width rule, on the 15-minute slots the current single timeline uses.
  const STEP = 15
  const dayStart = Math.floor(Math.min(...ranges.map((r) => r.start)) / STEP) * STEP
  const dayEnd = Math.ceil(Math.max(...ranges.map((r) => r.end)) / STEP) * STEP
  const slotCount = (dayEnd - dayStart) / STEP
  const hasLabel = shifts.some((s) => s.label !== undefined && s.roleName !== undefined && s.label !== s.roleName)
  const slotWidth = (ganttColumnWidths(slotCount, hasLabel).slot / 100) * PRINTED_TIMELINE_WIDTH_PX
  const narrowestSlotSpan = Math.min(...ranges.map((r) => Math.max(1, Math.round((r.end - r.start) / STEP))))
  return slotWidth * narrowestSlotSpan < MIN_SHIFT_WIDTH_PX
}
