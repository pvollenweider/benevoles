// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import {
  ANSWER_STATE_LABELS,
  answerState,
  applySubmission,
  availabilityDates,
  availabilityMergeAction,
  availabilitySubmissionSchema,
  checkAnswerSet,
  nextDate,
  rangeLabel,
  resolveDay,
  resolveLocalTime,
  wholeEventUnavailable,
  type ResolvedDay,
} from "../event-availability"

const TZ = "Europe/Zurich"
const day = (s: string) => new Date(`${s}T00:00:00Z`)
const hours = (d: ResolvedDay, i = 0) => (d.ranges[i].endsAt.getTime() - d.ranges[i].startsAt.getTime()) / 3_600_000
const resolved = (date: string, ranges: [string, string][]): ResolvedDay => {
  const r = resolveDay({ date, ranges: ranges.map(([start, end]) => ({ start, end })) }, TZ)
  if (!r.ok) throw new Error(r.error)
  return r.value
}

describe("availabilityDates", () => {
  it("lists every civil date of the event, both ends included, across a month", () => {
    expect(availabilityDates(day("2026-07-30"), day("2026-08-02"))).toEqual(["2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"])
  })
  it("gives the single date of a one-day event", () => {
    expect(availabilityDates(day("2026-07-04"), day("2026-07-04"))).toEqual(["2026-07-04"])
  })
  it("gives the pilot's eleven dates (set-up, festival, teardown)", () => {
    expect(availabilityDates(day("2026-07-06"), day("2026-07-16"))).toHaveLength(11)
  })
})

describe("availabilitySubmissionSchema", () => {
  it("accepts dates with ranges and a date with no range (pas disponible)", () => {
    const r = availabilitySubmissionSchema.safeParse({ days: [{ date: "2026-07-10", ranges: [{ start: "14:00", end: "20:00" }] }, { date: "2026-07-11", ranges: [] }] })
    expect(r.success).toBe(true)
  })
  it("refuses the same date twice", () => {
    const r = availabilitySubmissionSchema.safeParse({ days: [{ date: "2026-07-10", ranges: [] }, { date: "2026-07-10", ranges: [] }] })
    expect(r.success).toBe(false)
  })
  it("refuses a time that is not HH:MM and an impossible date", () => {
    expect(availabilitySubmissionSchema.safeParse({ days: [{ date: "2026-07-10", ranges: [{ start: "24:00", end: "02:00" }] }] }).success).toBe(false)
    expect(availabilitySubmissionSchema.safeParse({ days: [{ date: "2026-02-30", ranges: [] }] }).success).toBe(false)
  })
  it("refuses more than six ranges on one date and an empty submission", () => {
    const ranges = Array.from({ length: 7 }, (_, i) => ({ start: `0${i}:00`, end: `0${i}:30` }))
    expect(availabilitySubmissionSchema.safeParse({ days: [{ date: "2026-07-10", ranges }] }).success).toBe(false)
    expect(availabilitySubmissionSchema.safeParse({ days: [] }).success).toBe(false)
  })
})

describe("resolveLocalTime", () => {
  it("gives the instant in the zone, summer and winter", () => {
    expect(resolveLocalTime("2026-07-10", "14:00", TZ)).toEqual({ ok: true, instant: new Date("2026-07-10T12:00:00Z") })
    expect(resolveLocalTime("2026-12-10", "14:00", TZ)).toEqual({ ok: true, instant: new Date("2026-12-10T13:00:00Z") })
  })
  it("refuses a time skipped when clocks go forward", () => {
    expect(resolveLocalTime("2026-03-29", "02:30", TZ)).toEqual({ ok: false, reason: "missing" })
  })
  it("refuses a time lived twice when clocks go back", () => {
    expect(resolveLocalTime("2026-10-25", "02:30", TZ)).toEqual({ ok: false, reason: "repeated" })
  })
  it("accepts the hours just around a change", () => {
    expect(resolveLocalTime("2026-10-25", "03:00", TZ).ok).toBe(true)
    expect(resolveLocalTime("2026-10-25", "01:59", TZ).ok).toBe(true)
    expect(resolveLocalTime("2026-03-29", "03:00", TZ).ok).toBe(true)
  })
})

describe("resolveDay", () => {
  it("resolves ranges to instants in time order", () => {
    const d = resolved("2026-07-10", [["20:00", "23:00"], ["08:00", "14:00"]])
    expect(d.ranges.map((r) => r.startTime)).toEqual(["08:00", "20:00"])
    expect(d.ranges[0].startsAt).toEqual(new Date("2026-07-10T06:00:00Z"))
  })
  it("reads an end earlier than the start as the next morning (20:00 → 03:00)", () => {
    const d = resolved("2026-07-10", [["20:00", "03:00"]])
    expect(d.ranges[0].endsAt).toEqual(new Date("2026-07-11T01:00:00Z"))
    expect(hours(d)).toBe(7)
  })
  it("keeps the real length of a night across a clock change", () => {
    expect(hours(resolved("2026-10-24", [["22:00", "06:00"]]))).toBe(9)
    expect(hours(resolved("2026-03-28", [["22:00", "06:00"]]))).toBe(7)
  })
  it("refuses an empty range", () => {
    const r = resolveDay({ date: "2026-07-10", ranges: [{ start: "10:00", end: "10:00" }] }, TZ)
    expect(r).toEqual({ ok: false, error: expect.stringContaining("commence et finit à 10:00") })
  })
  it("refuses an end inside the hour lived twice, on the next date", () => {
    const r = resolveDay({ date: "2026-10-24", ranges: [{ start: "22:00", end: "02:30" }] }, TZ)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("existe deux fois le dimanche 25 octobre")
  })
  it("says nothing with « tu » or « vous » (shared by volunteers and organisers)", () => {
    const r = resolveDay({ date: "2026-03-29", ranges: [{ start: "02:15", end: "05:00" }] }, TZ)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).not.toMatch(/\b(tu|vous|choisissez|choisis)\b/i)
  })
})

describe("checkAnswerSet", () => {
  const dates = ["2026-07-10", "2026-07-11"]
  it("refuses a date outside the event", () => {
    const r = checkAnswerSet([resolved("2026-07-12", [])], dates)
    expect(r).toEqual({ ok: false, error: "Le dimanche 12 juillet ne fait pas partie de l'événement." })
  })
  it("refuses two ranges sharing time on one date", () => {
    const r = checkAnswerSet([resolved("2026-07-10", [["08:00", "14:00"], ["13:00", "18:00"]])], dates)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("se chevauchent le vendredi 10 juillet")
  })
  it("refuses a night range running into an early range of the next date", () => {
    const r = checkAnswerSet([resolved("2026-07-10", [["20:00", "03:00"]]), resolved("2026-07-11", [["01:00", "05:00"]])], dates)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain("le vendredi 10 juillet et le samedi 11 juillet")
  })
  it("accepts ranges that only touch, and a night range before a « pas disponible » date", () => {
    expect(checkAnswerSet([resolved("2026-07-10", [["08:00", "14:00"], ["14:00", "20:00"]])], dates).ok).toBe(true)
    expect(checkAnswerSet([resolved("2026-07-10", [["20:00", "03:00"]]), resolved("2026-07-11", [])], dates).ok).toBe(true)
  })
  it("accepts a last-night range ending after the event's last date", () => {
    expect(checkAnswerSet([resolved("2026-07-11", [["22:00", "04:00"]])], dates).ok).toBe(true)
  })
})

describe("applySubmission", () => {
  const dates = ["2026-07-10", "2026-07-11", "2026-07-12"]
  it("replaces the dates submitted and keeps the others", () => {
    const stored = [resolved("2026-07-10", [["08:00", "12:00"]]), resolved("2026-07-11", [])]
    const r = applySubmission([{ date: "2026-07-11", ranges: [{ start: "14:00", end: "20:00" }] }], stored, dates, TZ)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.submitted.map((d) => d.date)).toEqual(["2026-07-11"])
      expect(r.value.all.map((d) => [d.date, d.ranges.length])).toEqual([["2026-07-10", 1], ["2026-07-11", 1]])
    }
  })
  it("checks the new answer against the dates kept", () => {
    const stored = [resolved("2026-07-11", [["01:00", "05:00"]])]
    const r = applySubmission([{ date: "2026-07-10", ranges: [{ start: "20:00", end: "03:00" }] }], stored, dates, TZ)
    expect(r.ok).toBe(false)
  })
  it("is not fooled by a stored range of a date being replaced", () => {
    const stored = [resolved("2026-07-11", [["01:00", "05:00"]])]
    const r = applySubmission([{ date: "2026-07-10", ranges: [{ start: "20:00", end: "03:00" }] }, { date: "2026-07-11", ranges: [] }], stored, dates, TZ)
    expect(r.ok).toBe(true)
  })
})

describe("answerState", () => {
  const dates = ["2026-07-10", "2026-07-11"]
  it("is « Sans réponse » with nothing answered, dates outside the event ignored", () => {
    expect(answerState(dates, [])).toBe("none")
    expect(answerState(dates, [{ date: "2026-07-20", rangeCount: 2 }])).toBe("none")
  })
  it("is « Réponse partielle » while a date is unanswered", () => {
    expect(answerState(dates, [{ date: "2026-07-10", rangeCount: 0 }])).toBe("partial")
  })
  it("is « Réponse complète » once every date is answered with some range", () => {
    expect(answerState(dates, [{ date: "2026-07-10", rangeCount: 0 }, { date: "2026-07-11", rangeCount: 1 }])).toBe("complete")
  })
  it("is « Indisponible » when every date is « pas disponible »", () => {
    const days = wholeEventUnavailable(dates).map((d) => ({ date: d.date, rangeCount: d.ranges.length }))
    expect(answerState(dates, days)).toBe("unavailable")
    expect(ANSWER_STATE_LABELS.unavailable).toBe("Indisponible")
  })
  it("leaves a date added to the event later unknown", () => {
    const answered = wholeEventUnavailable(dates).map((d) => ({ date: d.date, rangeCount: 0 }))
    expect(answerState([...dates, "2026-07-12"], answered)).toBe("partial")
  })
})

describe("availabilityMergeAction", () => {
  const a = { days: [{ date: "2026-07-10", ranges: [{ startsAt: "2026-07-10T06:00:00Z", endsAt: "2026-07-10T12:00:00Z" }] }] }
  const b = { days: [{ date: "2026-07-10", ranges: [] }] }
  const empty = { days: [] }
  it("moves the absorbed answer when the kept record has none", () => {
    expect(availabilityMergeAction(null, a)).toBe("move")
    expect(availabilityMergeAction(null, empty)).toBe("move")
    expect(availabilityMergeAction(empty, a)).toBe("move")
  })
  it("keeps the kept answer when the absorbed one adds nothing", () => {
    expect(availabilityMergeAction(a, null)).toBe("keep")
    expect(availabilityMergeAction(a, empty)).toBe("keep")
    expect(availabilityMergeAction(a, { days: [{ date: "2026-07-10", ranges: [{ startsAt: new Date("2026-07-10T06:00:00Z"), endsAt: new Date("2026-07-10T12:00:00Z") }] }] })).toBe("keep")
  })
  it("flags for review, never unites, when both answered differently", () => {
    expect(availabilityMergeAction(a, b)).toBe("keep_review")
  })
})

describe("labels", () => {
  it("shows the next morning on an overnight range", () => {
    expect(rangeLabel({ startTime: "20:00", endTime: "03:00" })).toBe("20:00 → 03:00 (lendemain)")
    expect(rangeLabel({ startTime: "08:00", endTime: "14:00" })).toBe("08:00 → 14:00")
  })
  it("gives the next calendar day across a month", () => {
    expect(nextDate("2026-07-31")).toBe("2026-08-01")
  })
})
