// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import {
  answerChanged, answersEditable, correctionDeadlineSentence, correctionUntil, newlyOutside, reviewReasons, reviewReasonTexts, withReviewReason,
  CORRECTION_NOTICE, REVIEW_MERGE, REVIEW_PUBLISHED,
} from "../availability-correction"
import type { AnswerForFit } from "../availability-assist"
import { localDateTimeToUtc } from "../time-zone"

// Availability corrected after a publication (#1146, lot C; owner decisions of 2026-10-30).
const TZ = "Europe/Zurich"
const DATES = ["2031-07-10", "2031-07-11", "2031-07-12"]
const at = (date: string, time: string) => localDateTimeToUtc(new Date(`${date}T00:00:00Z`), time, TZ)

describe("review reasons", () => {
  it("adds the publication's reason without losing a merge's, once", () => {
    expect(withReviewReason(null, REVIEW_PUBLISHED)).toBe("published")
    expect(withReviewReason("merge", REVIEW_PUBLISHED)).toBe("merge,published")
    expect(withReviewReason("merge,published", REVIEW_PUBLISHED)).toBe("merge,published")
    expect(reviewReasons(" published , ,merge")).toEqual([REVIEW_MERGE, REVIEW_PUBLISHED])
  })

  it("says each reason in words", () => {
    expect(reviewReasonTexts("merge,published")).toEqual([
      "À revoir : deux fiches fusionnées avaient répondu différemment.",
      "À revoir : disponibilités modifiées après la publication des affectations.",
    ])
    expect(reviewReasonTexts(null)).toEqual([])
  })
})

describe("the correction window", () => {
  const shifts = [
    { date: new Date("2031-07-11T00:00:00Z"), startTime: "10:00", endTime: "14:00", status: "open" },
    { date: new Date("2031-07-12T00:00:00Z"), startTime: "22:00", endTime: "03:00", status: "open" },
    { date: new Date("2031-07-13T00:00:00Z"), startTime: "10:00", endTime: "14:00", status: "cancelled" },
  ]

  it("ends with the event's last live shift, a night shift's real end included", () => {
    expect(correctionUntil(shifts, TZ)?.toISOString()).toBe(at("2031-07-13", "03:00").toISOString())
    expect(correctionUntil([], TZ)).toBeNull()
  })

  it("is open before the deadline for everyone, after it only for a published mission, until the end", () => {
    const until = at("2031-07-13", "03:00")
    const deadline = at("2031-07-01", "23:59")
    expect(answersEditable({ deadline, published: false, until: null, now: at("2031-06-30", "12:00") })).toMatchObject({ open: true, viaCorrection: false })
    expect(answersEditable({ deadline, published: false, until: null, now: at("2031-07-05", "12:00") })).toMatchObject({ open: false })
    expect(answersEditable({ deadline, published: true, until, now: at("2031-07-05", "12:00") })).toMatchObject({ open: true, viaCorrection: true, published: true })
    expect(answersEditable({ deadline, published: true, until, now: at("2031-07-13", "02:59") }).open).toBe(true)
    expect(answersEditable({ deadline, published: true, until, now: at("2031-07-13", "03:00") }).open).toBe(false)
    expect(answersEditable({ deadline: null, published: true, until, now: at("2031-07-20", "12:00") })).toMatchObject({ open: true, viaCorrection: false })
  })
})

describe("what changed", () => {
  it("tells a real change from the same answer sent again", () => {
    const before = [{ date: "2031-07-11", ranges: [{ startTime: "09:00", endTime: "12:00" }] }]
    expect(answerChanged(before, [{ date: "2031-07-11", ranges: [{ startTime: "09:00", endTime: "12:00" }] }])).toBe(false)
    expect(answerChanged(before, [{ date: "2031-07-11", ranges: [{ startTime: "09:00", endTime: "13:00" }] }])).toBe(true)
    expect(answerChanged(before, [{ date: "2031-07-11", ranges: [] }])).toBe(true)
    expect(answerChanged(before, [{ date: "2031-07-12", ranges: [] }])).toBe(true)
  })

  const answer = (revision: number, start: string, end: string): AnswerForFit => ({
    requestId: "req-1", revision,
    days: [{ date: "2031-07-10", ranges: [] }, { date: "2031-07-11", ranges: [{ startTime: start, endTime: end, startsAt: at("2031-07-11", start), endsAt: at("2031-07-11", end) }] }],
  })
  const bar = { id: "s1", name: "Bar", date: new Date("2031-07-11T00:00:00Z"), startTime: "10:00", endTime: "14:00" }
  const accueil = { id: "s2", name: "Accueil", date: new Date("2031-07-11T00:00:00Z"), startTime: "15:00", endTime: "16:00" }

  it("lists only the missions newly outside the answer", () => {
    expect(newlyOutside([bar, accueil], answer(1, "09:00", "17:00"), answer(2, "14:00", "17:00"), DATES, TZ).map((m) => m.id)).toEqual(["s1"])
    // Already outside before: no stronger warning a second time.
    expect(newlyOutside([bar], answer(1, "15:00", "17:00"), answer(2, "16:00", "17:00"), DATES, TZ)).toEqual([])
    // A first answer judged against nothing.
    expect(newlyOutside([bar], null, answer(1, "15:00", "17:00"), DATES, TZ).map((m) => m.id)).toEqual(["s1"])
  })
})

describe("words for the person", () => {
  it("says a correction cancels nothing, and until when it is possible", () => {
    expect(CORRECTION_NOTICE).toContain("ne modifie ni n'annule tes missions")
    expect(correctionDeadlineSentence(at("2031-07-13", "03:00"), TZ)).toContain("tu peux encore corriger tes disponibilités jusqu'au")
  })
})
