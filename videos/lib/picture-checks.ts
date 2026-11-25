// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Picture facts read from FFmpeg's own output, and the moments a reference video is sampled at.
 *
 * These functions only parse strings and compute: the regression runner runs blackdetect,
 * freezedetect and ssim, then hands their stderr to the parsers below. Times are printed by
 * FFmpeg in seconds and kept here in milliseconds, rounded to the nearest integer.
 */

/** A stretch of the video, in milliseconds from its start. */
export type Interval = { startMs: number; endMs: number }

const SECONDS = String.raw`-?(?:\d+(?:\.\d+)?|\.\d+)`
const BLACK_LINE = new RegExp(String.raw`black_start:\s*(${SECONDS})\s+black_end:\s*(${SECONDS})`)
const FREEZE_START = new RegExp(String.raw`freeze_start:\s*(${SECONDS})`)
const FREEZE_END = new RegExp(String.raw`freeze_end:\s*(${SECONDS})`)
const FREEZE_DURATION = new RegExp(String.raw`freeze_duration:\s*(${SECONDS})`)
const SSIM_ALL = new RegExp(String.raw`\bAll:\s*(${SECONDS})`, "g")

function milliseconds(seconds: string): number {
  return Math.round(Number(seconds) * 1_000)
}

/**
 * Black stretches of `blackdetect`, from its `black_start:<s> black_end:<s>` lines.
 *
 * A line that mentions `black_start` but does not carry both bounds is an error: dropping it would
 * turn an unrecognised format after an FFmpeg upgrade into "no black stretch", which never fails
 * the regression loop. Lines that mention no marker (the filter configuration, other filters) are
 * ignored.
 */
export function parseBlackdetect(stderr: string): Interval[] {
  const stretches: Interval[] = []
  for (const line of stderr.split(/\r?\n/)) {
    if (!line.includes("black_start")) continue
    const match = BLACK_LINE.exec(line)
    if (!match) throw new Error(`Unreadable blackdetect line: ${line}`)
    stretches.push({ startMs: milliseconds(match[1]), endMs: milliseconds(match[2]) })
  }
  return stretches
}

/**
 * Frozen stretches of `freezedetect`, from its `freeze_start` and `freeze_end` lines (the
 * `freeze_duration` line between them is redundant). A start without an end is a still picture
 * running to the end of the file: it is closed at `durationMs`.
 *
 * A line that mentions a freeze marker but cannot be read, an end without a pending start, a
 * second start before the previous end, or an end before its start is an error: silently dropping
 * it would turn an unrecognised format into "no still picture". Lines that mention no marker (the
 * filter configuration, other filters) are ignored.
 */
export function parseFreezedetect(stderr: string, durationMs: number): Interval[] {
  const stretches: Interval[] = []
  let startMs: number | null = null
  for (const line of stderr.split(/\r?\n/)) {
    if (line.includes("freeze_start")) {
      const match = FREEZE_START.exec(line)
      if (!match) throw new Error(`Unreadable freezedetect line: ${line}`)
      if (startMs !== null) throw new Error(`Freezedetect start before the previous end: ${line}`)
      startMs = milliseconds(match[1])
      continue
    }
    if (line.includes("freeze_end")) {
      const match = FREEZE_END.exec(line)
      if (!match) throw new Error(`Unreadable freezedetect line: ${line}`)
      if (startMs === null) throw new Error(`Freezedetect end without a start: ${line}`)
      const endMs = milliseconds(match[1])
      if (endMs < startMs) throw new Error(`Freezedetect end before its start: ${line}`)
      stretches.push({ startMs, endMs })
      startMs = null
      continue
    }
    if (line.includes("freeze_duration") && !FREEZE_DURATION.exec(line)) {
      throw new Error(`Unreadable freezedetect line: ${line}`)
    }
  }
  if (startMs !== null) stretches.push({ startMs, endMs: Math.round(durationMs) })
  return stretches
}

/** The `All:` value of `ssim`, between 0 and 1; throws when FFmpeg printed no such value. */
export function parseSsimAll(stderr: string): number {
  const matches = [...stderr.matchAll(SSIM_ALL)]
  if (!matches.length) throw new Error('No SSIM "All:" value in the FFmpeg output')
  return Number(matches[matches.length - 1][1])
}

export type TimelineFrames = {
  cues: Interval[]
  portraitFrames?: Interval[]
  detailFrames?: Interval[]
  focusFrames?: Interval[]
}

/**
 * The middle of every cue and of every framing interval, in milliseconds: one sample per scene
 * and at least one inside each phone frame, detail frame and focus frame. Sorted, without duplicate
 * times. The caller maps the timeline's own field names to `focusFrames`.
 */
export function frameSampleTimes(timeline: TimelineFrames): number[] {
  const intervals = [
    ...timeline.cues,
    ...(timeline.portraitFrames ?? []),
    ...(timeline.detailFrames ?? []),
    ...(timeline.focusFrames ?? []),
  ]
  const times = intervals.map(({ startMs, endMs }) => Math.round((startMs + endMs) / 2))
  return [...new Set(times)].sort((left, right) => left - right)
}

/**
 * The actual stretches with no golden counterpart: a stretch counts as known when one golden
 * stretch has both its start and its end within `toleranceMs` of it. A still screen where the
 * narration goes on is in the golden already, so only new pauses are returned.
 */
export function newStretches(golden: Interval[], actual: Interval[], toleranceMs: number): Interval[] {
  return actual.filter((stretch) => !golden.some((known) =>
    Math.abs(known.startMs - stretch.startMs) <= toleranceMs && Math.abs(known.endMs - stretch.endMs) <= toleranceMs
  ))
}
