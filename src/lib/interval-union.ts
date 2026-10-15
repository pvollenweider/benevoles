// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Time a person actually gives when some of their shifts run at the same time (#986: a role
 * « Cumulable avec un autre créneau »): the union of the intervals, never their sum. Two parallel
 * hours of first aid and coffee are two hours, not four. Pure, unit-agnostic (minutes or
 * milliseconds, as long as all intervals use the same); an empty or inverted interval adds nothing.
 */
export type Interval = { start: number; end: number }

/** The intervals merged where they overlap or touch, in time order. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start || a.end - b.end)
  const out: Interval[] = []
  for (const i of sorted) {
    const last = out[out.length - 1]
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end)
    else out.push({ start: i.start, end: i.end })
  }
  return out
}

/** Length of the union of the intervals. */
export function unionLength(intervals: Interval[]): number {
  return mergeIntervals(intervals).reduce((n, i) => n + (i.end - i.start), 0)
}

/** Whether two of the intervals share some time (touching ends do not). */
export function hasParallelTime(intervals: Interval[]): boolean {
  const total = intervals.reduce((n, i) => n + Math.max(0, i.end - i.start), 0)
  return unionLength(intervals) < total
}
