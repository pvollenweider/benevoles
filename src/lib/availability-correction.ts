// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { shiftFit, shiftInterval, type AnswerForFit } from "./availability-assist"
import { shiftEndsAt } from "./cancel-deadline"
import { answersOpen } from "./event-availability-text"

/**
 * Availability changed after a publication (#1146, lot C; owner decisions of 2026-10-30). Pure.
 *
 * - Correction: a person with a live registration created by publishing drafts (`admin_draft`) may
 *   correct their availability from their link after the deadline, until the end of the event's
 *   last live shift (a night shift's real end, the next morning). Nothing when collection is off:
 *   the links stay revoked. A correction never moves or cancels anyone.
 * - Notification: any real change of such a person's answer flags it « à revoir » (persistent,
 *   `AvailabilityRequest.reviewReason`) and joins a 10-minute digest to the organisation's owners and
 *   organisers, never sector leaders; stronger words when a mission ends up outside the new answer.
 */

// The review reasons and their words live with the page's other words (client-safe).
export { REVIEW_MERGE, REVIEW_PUBLISHED, reviewReasons, withReviewReason, reviewReasonTexts } from "./event-availability-text"

type LiveShift = { date: Date | string; startTime: string; endTime: string; status: string }

/** The end of the event's last live shift, in the organisation's zone, or null without any. */
export function correctionUntil(shifts: readonly LiveShift[], timeZone: string): Date | null {
  let last: number | null = null
  for (const s of shifts) {
    if (s.status === "cancelled") continue
    const end = shiftEndsAt(s, timeZone).getTime()
    if (last === null || end > last) last = end
  }
  return last === null ? null : new Date(last)
}

export type EditWindow = {
  /** Whether the person may change their answers from their link now. */
  open: boolean
  /** Open only through the correction after publication (the deadline has passed). */
  viaCorrection: boolean
  /** They hold a mission given by a publication: the page says corrections cancel nothing. */
  published: boolean
  until: Date | null
}

/** Whether the link may write: before the deadline, or as a correction after a publication. */
export function answersEditable(p: { deadline: Date | string | null; published: boolean; until: Date | null; now: Date }): EditWindow {
  if (answersOpen(p.deadline, p.now)) return { open: true, viaCorrection: false, published: p.published, until: p.until }
  const correction = p.published && !!p.until && p.now.getTime() < p.until.getTime()
  return { open: correction, viaCorrection: correction, published: p.published, until: p.until }
}

type DayLike = { date: string; ranges: readonly { startTime: string; endTime: string }[] }

const canonical = (d: DayLike | undefined) => (d ? d.ranges.map((r) => `${r.startTime}-${r.endTime}`).sort().join(",") || "none" : "unknown")

/** Whether the dates sent change what was stored (an identical save is not a change). */
export function answerChanged(before: readonly DayLike[], sent: readonly DayLike[]): boolean {
  const old = new Map(before.map((d) => [d.date, d]))
  return sent.some((d) => canonical(old.get(d.date)) !== canonical(d))
}

export type Mission = { id: string; name: string; date: Date | string; startTime: string; endTime: string }

/** The missions that are outside the new answer and were not before (declared unavailable minutes). */
export function newlyOutside(missions: readonly Mission[], before: AnswerForFit | null, after: AnswerForFit | null, eventDates: readonly string[], timeZone: string): Mission[] {
  return missions.filter((m) => {
    const interval = shiftInterval(m, timeZone)
    const was = shiftFit(interval, before, eventDates, timeZone).outsideMinutes > 0
    const is = shiftFit(interval, after, eventDates, timeZone).outsideMinutes > 0
    return is && !was
  })
}

// ── Words ─────────────────────────────────────────────────────────────────────────────────────

// The person's words live with the page's other words (client-safe): src/lib/event-availability-text.ts.
export { CORRECTION_NOTICE, CORRECTION_SAVED_TEXT, correctionDeadlineSentence } from "./event-availability-text"
