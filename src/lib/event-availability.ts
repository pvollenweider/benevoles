// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { civilDateSchema } from "./civil-date"
import { clockSchema } from "./shift-time"
import { dayLabel } from "./spoken-time"

/**
 * Dated availability for one event (#1146, lot A): each person asked says, date by date, when they
 * are free (« de 14:00 à 20:00 », « de 20:00 à 03:00 ») or that they are not available that date.
 * Separate from the general hints of src/lib/availability.ts: « matin » is never certain
 * availability on a given date, and nothing here is ever inferred from it.
 *
 * What a stored answer means (AvailabilityRequest / AvailabilityDay / AvailabilityRange):
 *   - a date with no day row: unknown, no answer for that date;
 *   - a day row with no range: « pas disponible » that date;
 *   - a day row with ranges: free during those ranges, and only then.
 * A range belongs to the date it starts on, as a shift does: an end earlier than the start is the
 * next morning (« 20:00 → 03:00, lendemain »). So « pas disponible » on a date means that no range
 * starts that date; the night before may still run into its first hours. Comparisons use the real
 * instants each range resolves to in the event's snapshotted zone, half-open [start, end).
 *
 * The messages avoid « tu » and « vous »: the same rules answer the person asked and the organisers.
 * Pure and Prisma-free: the volunteer page and the organiser screens read the same rules.
 */

/** At most this many ranges on one date: enough for a split day plus a night task. */
export const AVAILABILITY_MAX_RANGES_PER_DAY = 6

/** At most this many dates in one submission (a year of dates). */
export const AVAILABILITY_MAX_DAYS = 366

const DAY_MS = 24 * 60 * 60 * 1000

/** Every civil date (YYYY-MM-DD) of the event, from its start date to its end date included. */
export function availabilityDates(startDate: Date, endDate: Date): string[] {
  const out: string[] = []
  const start = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate())
  const end = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate())
  for (let t = start; t <= end && out.length < AVAILABILITY_MAX_DAYS; t += DAY_MS) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

const rangeSchema = z.object({ start: clockSchema, end: clockSchema })
const daySchema = z.object({ date: civilDateSchema, ranges: z.array(rangeSchema).max(AVAILABILITY_MAX_RANGES_PER_DAY, `Au plus ${AVAILABILITY_MAX_RANGES_PER_DAY} plages par date.`) })

/** One submission: the dates answered now, each with its ranges (none = « pas disponible » that date). */
export const availabilitySubmissionSchema = z.object({
  days: z.array(daySchema).min(1, "Indiquez au moins une date.").max(AVAILABILITY_MAX_DAYS),
}).refine((v) => new Set(v.days.map((d) => d.date)).size === v.days.length, { message: "Une même date est indiquée deux fois." })

export type AvailabilitySubmission = z.infer<typeof availabilitySubmissionSchema>
export type DayAnswerInput = AvailabilitySubmission["days"][number]

/** « Pas disponible pendant tout l'événement »: every date answered, with no range. */
export function wholeEventUnavailable(dates: readonly string[]): DayAnswerInput[] {
  return dates.map((date) => ({ date, ranges: [] }))
}

// ── Wall-clock time in a zone ──────────────────────────────────────────────────────────────────

function wallClock(instant: number, timeZone: string): { date: string; time: string; offset: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(instant))
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00"
  const date = `${get("year")}-${get("month")}-${get("day")}`
  const time = `${get("hour")}:${get("minute")}`
  const asUtc = Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day")), Number(get("hour")), Number(get("minute")), Number(get("second")))
  return { date, time, offset: asUtc - (instant - (instant % 1000)) }
}

export type LocalTimeResolution =
  | { ok: true; instant: Date }
  | { ok: false; reason: "missing" | "repeated" }

/**
 * The real instant of `time` on `date` in `timeZone`, or why there is none: « missing » in the hour
 * skipped when clocks go forward, « repeated » in the hour lived twice when they go back. Both are
 * refused rather than guessed (Codex, #1146): the person picks a time that exists once.
 */
export function resolveLocalTime(date: string, time: string, timeZone: string): LocalTimeResolution {
  const [y, mo, d] = date.split("-").map(Number)
  const [h, mi] = time.split(":").map(Number)
  const naive = Date.UTC(y, mo - 1, d, h, mi)
  const first = naive - wallClock(naive, timeZone).offset
  const instant = naive - wallClock(first, timeZone).offset
  const wall = wallClock(instant, timeZone)
  if (wall.date !== date || wall.time !== time) return { ok: false, reason: "missing" }
  // Lived twice: the same wall time also exists one offset change earlier or later.
  const shift = wallClock(instant - 6 * 3600_000, timeZone).offset - wallClock(instant + 6 * 3600_000, timeZone).offset
  if (shift !== 0) {
    for (const other of [instant - shift, instant + shift]) {
      const w = wallClock(other, timeZone)
      if (w.date === date && w.time === time) return { ok: false, reason: "repeated" }
    }
  }
  return { ok: true, instant: new Date(instant) }
}

/** The calendar day after `date` (YYYY-MM-DD). */
export function nextDate(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10)
}

// ── Resolution and validation ─────────────────────────────────────────────────────────────────

export type ResolvedRange = { startTime: string; endTime: string; startsAt: Date; endsAt: Date }
export type ResolvedDay = { date: string; ranges: ResolvedRange[] }

export type AvailabilityCheck<T> = { ok: true; value: T } | { ok: false; error: string }

/** « 20:00 → 03:00 (lendemain) » for one range of a date. */
export function rangeLabel(r: { startTime: string; endTime: string }): string {
  return r.endTime < r.startTime ? `${r.startTime} → ${r.endTime} (lendemain)` : `${r.startTime} → ${r.endTime}`
}

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

function timeError(date: string, time: string, reason: "missing" | "repeated"): string {
  const day = lower(dayLabel(date))
  return reason === "missing"
    ? `${time} n'existe pas le ${day} : les horloges avancent d'une heure cette nuit-là : il faut choisir une autre heure.`
    : `${time} existe deux fois le ${day} : les horloges reculent d'une heure cette nuit-là : il faut choisir une heure avant ou après ce changement.`
}

/** One date's ranges as real instants, in time order; an end earlier than the start is the next day. */
export function resolveDay(day: DayAnswerInput, timeZone: string): AvailabilityCheck<ResolvedDay> {
  const ranges: ResolvedRange[] = []
  for (const r of day.ranges) {
    if (r.start === r.end) return { ok: false, error: `Une plage du ${lower(dayLabel(day.date))} commence et finit à ${r.start} : l'heure de fin doit être différente du début.` }
    const endDate = r.end < r.start ? nextDate(day.date) : day.date
    const start = resolveLocalTime(day.date, r.start, timeZone)
    if (!start.ok) return { ok: false, error: timeError(day.date, r.start, start.reason) }
    const end = resolveLocalTime(endDate, r.end, timeZone)
    if (!end.ok) return { ok: false, error: timeError(endDate, r.end, end.reason) }
    ranges.push({ startTime: r.start, endTime: r.end, startsAt: start.instant, endsAt: end.instant })
  }
  ranges.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  return { ok: true, value: { date: day.date, ranges } }
}

/**
 * The person's whole answer once this submission is applied (the dates submitted replace the ones
 * stored, the others stay): every date one of the event's, and no two ranges sharing time, on the
 * same date or across midnight (a night range of one date and an early range of the next). Ranges
 * that only touch (one ends at 14:00, the next starts at 14:00) are fine.
 */
export function checkAnswerSet(days: readonly ResolvedDay[], eventDates: readonly string[]): AvailabilityCheck<ResolvedDay[]> {
  const allowed = new Set(eventDates)
  const outside = days.find((d) => !allowed.has(d.date))
  if (outside) return { ok: false, error: `Le ${lower(dayLabel(outside.date))} ne fait pas partie de l'événement.` }
  const all = days.flatMap((d) => d.ranges.map((r) => ({ date: d.date, r }))).sort((a, b) => a.r.startsAt.getTime() - b.r.startsAt.getTime())
  for (let i = 1; i < all.length; i++) {
    const prev = all[i - 1], cur = all[i]
    if (cur.r.startsAt < prev.r.endsAt) {
      const where = prev.date === cur.date ? `le ${lower(dayLabel(cur.date))}` : `le ${lower(dayLabel(prev.date))} et le ${lower(dayLabel(cur.date))}`
      return { ok: false, error: `Deux plages se chevauchent ${where} (${rangeLabel(prev.r)} et ${rangeLabel(cur.r)}) : il faut les réunir en une seule.` }
    }
  }
  return { ok: true, value: [...days].sort((a, b) => a.date.localeCompare(b.date)) }
}

/** Resolves a submission and checks it against what stays stored for the other dates. */
export function applySubmission(submitted: readonly DayAnswerInput[], storedOthers: readonly ResolvedDay[], eventDates: readonly string[], timeZone: string): AvailabilityCheck<{ submitted: ResolvedDay[]; all: ResolvedDay[] }> {
  const resolved: ResolvedDay[] = []
  for (const day of submitted) {
    const r = resolveDay(day, timeZone)
    if (!r.ok) return r
    resolved.push(r.value)
  }
  const submittedDates = new Set(resolved.map((d) => d.date))
  const check = checkAnswerSet([...storedOthers.filter((d) => !submittedDates.has(d.date)), ...resolved], eventDates)
  if (!check.ok) return check
  return { ok: true, value: { submitted: resolved, all: check.value } }
}

// ── Where an answer stands ────────────────────────────────────────────────────────────────────

/** « Sans réponse », « Réponse partielle » (some dates unanswered), « Réponse complète », « Indisponible » (every date, no range). */
export type AnswerState = "none" | "partial" | "complete" | "unavailable"

export const ANSWER_STATE_LABELS: Record<AnswerState, string> = {
  none: "Sans réponse",
  partial: "Réponse partielle",
  complete: "Réponse complète",
  unavailable: "Indisponible",
}

/** Where a person's answer stands against the event's dates; a stored date outside them is ignored. */
export function answerState(eventDates: readonly string[], answered: readonly { date: string; rangeCount: number }[]): AnswerState {
  const wanted = new Set(eventDates)
  const days = answered.filter((d) => wanted.has(d.date))
  if (days.length === 0) return "none"
  if (new Set(days.map((d) => d.date)).size < wanted.size) return "partial"
  return days.every((d) => d.rangeCount === 0) ? "unavailable" : "complete"
}

// ── Member merge (#600) ───────────────────────────────────────────────────────────────────────

type StoredAnswer = { days: readonly { date: string; ranges: readonly { startsAt: Date | string; endsAt: Date | string }[] }[] }

/** Canonical form of an answer, to tell whether two records said the same thing. */
export function answerSignature(a: StoredAnswer): string {
  const iso = (d: Date | string) => new Date(d).toISOString()
  return [...a.days]
    .sort((x, y) => x.date.localeCompare(y.date))
    .map((d) => `${d.date}=${[...d.ranges].map((r) => `${iso(r.startsAt)}/${iso(r.endsAt)}`).sort().join(",")}`)
    .join(";")
}

/**
 * What a merge does with the two records' answers on one event (Codex, #1146: never unite them into
 * more availability than either gave):
 *   - "move": the kept record has no request on the event, or one with nothing answered while the
 *     absorbed record answered: the absorbed request goes to the kept record (the kept one's empty
 *     request, if any, is deleted first);
 *   - "keep": the absorbed record has nothing to add (nothing answered, or the same answers): its
 *     request is deleted;
 *   - "keep_review": both answered differently: the kept record's answers stay, flagged for review,
 *     and the absorbed record's request is deleted.
 */
export type AvailabilityMergeAction = "move" | "keep" | "keep_review"

export function availabilityMergeAction(keep: StoredAnswer | null, absorb: StoredAnswer | null): AvailabilityMergeAction {
  if (!absorb) return "keep"
  if (!keep) return "move"
  if (absorb.days.length === 0) return "keep"
  if (keep.days.length === 0) return "move"
  return answerSignature(keep) === answerSignature(absorb) ? "keep" : "keep_review"
}
