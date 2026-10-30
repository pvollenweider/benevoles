// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import {
  assessCandidate, availabilityAckChanges, availabilityAckKey, committedHoursText, judgeAvailabilityAcks, sameNameHints, filterCandidates, fitDetail, shiftFit, shiftInterval, sortCandidates,
  type AnswerForFit, type AssistContext, type CandidateInput, type HeldMission,
} from "../availability-assist"
import { activePolicy, buildPolicy, type WorkloadPolicyValues } from "../workload-policy"
import { workloadModeOf } from "../workload-view"

const TZ = "Europe/Zurich"
const DATES = ["2030-07-10", "2030-07-11", "2030-07-12"]
// 2030-07: CEST, UTC+2.
const at = (date: string, time: string) => new Date(`${date}T${time}:00+02:00`)
const range = (date: string, start: string, end: string, endDate = date) => ({ startTime: start, endTime: end, startsAt: at(date, start), endsAt: at(endDate, end) })
const answer = (days: AnswerForFit["days"], revision = 1): AnswerForFit => ({ requestId: "req-1", revision, days })
const shift = (date: string, startTime: string, endTime: string, id = "s1") => ({ id, date, startTime, endTime })
const fitOf = (s: ReturnType<typeof shift>, a: AnswerForFit | null) => shiftFit(shiftInterval(s, TZ), a, DATES, TZ)

describe("shiftFit (#1146, lot B)", () => {
  it("is full when one range covers the shift, and needs no acknowledgement", () => {
    const f = fitOf(shift("2030-07-11", "14:00", "20:00"), answer([{ date: "2030-07-10", ranges: [] }, { date: "2030-07-11", ranges: [range("2030-07-11", "12:00", "22:00")] }]))
    expect(f).toMatchObject({ state: "full", totalMinutes: 360, coveredMinutes: 360, outsideMinutes: 0, unknownMinutes: 0, needsAck: false })
    expect(f.ranges).toEqual([{ date: "2030-07-11", startTime: "12:00", endTime: "22:00" }])
  })

  it("is full across two touching ranges, the night one ending the next morning", () => {
    const a = answer([
      { date: "2030-07-10", ranges: [range("2030-07-10", "20:00", "00:00", "2030-07-11")] },
      { date: "2030-07-11", ranges: [range("2030-07-11", "00:00", "04:00")] },
    ])
    expect(fitOf(shift("2030-07-10", "22:00", "03:00"), a).state).toBe("full")
  })

  it("counts declared unavailability once the shift's date and the date before are answered", () => {
    const a = answer([{ date: "2030-07-10", ranges: [] }, { date: "2030-07-11", ranges: [range("2030-07-11", "09:00", "12:00")] }])
    const f = fitOf(shift("2030-07-11", "10:00", "16:00"), a)
    expect(f).toMatchObject({ state: "partial", coveredMinutes: 120, outsideMinutes: 240, unknownMinutes: 0, needsAck: true })
    expect(fitDetail(f)).toBe("Libre 2 h sur 6 h, pas disponible 4 h. Plages indiquées : de 09:00 à 12:00.")
  })

  it("is outside when nothing is covered and the dates are answered « pas disponible »", () => {
    const a = answer([{ date: "2030-07-10", ranges: [] }, { date: "2030-07-11", ranges: [] }])
    expect(fitOf(shift("2030-07-11", "14:00", "20:00"), a)).toMatchObject({ state: "outside", outsideMinutes: 360, needsAck: true })
  })

  it("treats the first event date as having no previous date to wait for", () => {
    const a = answer([{ date: "2030-07-10", ranges: [] }])
    expect(fitOf(shift("2030-07-10", "08:00", "12:00"), a)).toMatchObject({ state: "outside", needsAck: true })
  })

  it("stays unknown when the date before is unanswered: its night range could still run into the shift", () => {
    // The 11th says « pas disponible », the 10th never answered: a range of the 10th may end late on the 11th.
    const a = answer([{ date: "2030-07-11", ranges: [] }])
    expect(fitOf(shift("2030-07-11", "01:00", "03:00"), a)).toMatchObject({ state: "unknown", outsideMinutes: 0, unknownMinutes: 120, needsAck: false })
  })

  it("is unknown for a person never asked, and for an unanswered date", () => {
    expect(fitOf(shift("2030-07-11", "14:00", "20:00"), null)).toMatchObject({ state: "unknown", needsAck: false })
    expect(fitOf(shift("2030-07-12", "14:00", "20:00"), answer([{ date: "2030-07-10", ranges: [] }]))).toMatchObject({ state: "unknown", needsAck: false })
  })

  it("splits a night shift at midnight: the part on an unanswered date stays unknown", () => {
    // 10th: free 18:00-22:00; 11th unanswered. Shift 20:00 → 02:00: 2 h covered, 2 h refused (10th), 2 h unknown (11th).
    const a = answer([{ date: "2030-07-09", ranges: [] }, { date: "2030-07-10", ranges: [range("2030-07-10", "18:00", "22:00")] }])
    const f = shiftFit(shiftInterval(shift("2030-07-10", "20:00", "02:00"), TZ), a, ["2030-07-09", ...DATES], TZ)
    expect(f).toMatchObject({ state: "partial", coveredMinutes: 120, outsideMinutes: 120, unknownMinutes: 120, needsAck: true })
    expect(fitDetail(f)).toBe("Libre 2 h sur 6 h, pas disponible 2 h, sans réponse 2 h. Plages indiquées : de 18:00 à 22:00.")
  })

  it("ignores answers on dates outside the event", () => {
    const a = answer([{ date: "2030-07-20", ranges: [] }])
    expect(fitOf(shift("2030-07-11", "14:00", "20:00"), a).state).toBe("unknown")
  })

  it("handles the autumn clock change: the repeated hour is counted once, in real minutes", () => {
    // 2030-10-27 03:00 CEST → 02:00 CET: 00:00 → 04:00 lasts 5 real hours.
    const dates = ["2030-10-26", "2030-10-27"]
    const a: AnswerForFit = { requestId: "r", revision: 1, days: [{ date: "2030-10-26", ranges: [] }, { date: "2030-10-27", ranges: [] }] }
    const f = shiftFit(shiftInterval(shift("2030-10-27", "00:00", "04:00"), TZ), a, dates, TZ)
    expect(f).toMatchObject({ state: "outside", totalMinutes: 300, outsideMinutes: 300 })
  })
})

describe("availabilityAckKey", () => {
  it("changes with the revision, the request and the shift's hours", () => {
    const base = { eventId: "e", volunteerId: "v", shiftId: "s", interval: { start: 1, end: 2 }, requestId: "r", revision: 3, timeZone: TZ }
    const key = availabilityAckKey(base)
    expect(availabilityAckKey({ ...base })).toBe(key)
    expect(availabilityAckKey({ ...base, revision: 4 })).not.toBe(key)
    expect(availabilityAckKey({ ...base, requestId: "r2" })).not.toBe(key)
    expect(availabilityAckKey({ ...base, interval: { start: 1, end: 3 } })).not.toBe(key)
    expect(availabilityAckKey({ ...base, volunteerId: "w" })).not.toBe(key)
  })
})

// ── Candidates ────────────────────────────────────────────────────────────────

const EVENT = { startDate: "2030-07-10", endDate: "2030-07-12" }
const values: WorkloadPolicyValues = {
  maxContinuousMinutes: 360, minBreakMinutes: 30, maxDailyMinutes: 600, maxEventMinutes: 2400, minRestMinutes: 600, maxIdleGapMinutes: 300, serviceDayStart: "06:00",
  offDay: { apply: false }, meal: { apply: false }, travel: { apply: false }, minors: { apply: false },
} as WorkloadPolicyValues
const policy = activePolicy(buildPolicy(values, TZ), EVENT)
const protectedCtx = (s = { ...shift("2030-07-11", "14:00", "20:00"), name: "Bar" }): AssistContext => ({
  eventId: "evt", shift: s, eventDates: DATES, timeZone: TZ, gate: { kind: "on", policy }, mode: { kind: "policy", policy },
})
const warningsCtx = (s = { ...shift("2030-07-11", "14:00", "20:00"), name: "Bar" }): AssistContext => ({
  eventId: "evt", shift: s, eventDates: DATES, timeZone: TZ, gate: { kind: "off" }, mode: workloadModeOf({ workloadProtectionEnabled: false, ...EVENT }, TZ),
})
const held = (id: string, date: string, start: string, end: string, kind: HeldMission["kind"] = "confirmed"): HeldMission => ({ id, date, startTime: start, endTime: end, kind, name: `Poste ${id}` })
const person = (lastName: string, extra: Partial<CandidateInput> = {}): CandidateInput => ({ volunteerId: `v-${lastName}`, firstName: "Léa", lastName, answer: null, held: [], ...extra })

describe("assessCandidate", () => {
  it("adds up confirmed and pending hours apart from drafts, and the hours of the same day", () => {
    const row = assessCandidate(warningsCtx(), person("Favre", {
      held: [held("a", "2030-07-11", "08:00", "12:00"), held("b", "2030-07-10", "08:00", "10:00", "pending"), held("c", "2030-07-12", "08:00", "11:00", "draft")],
    }))
    expect(row.minutes).toEqual({ confirmed: 240, pending: 120, draft: 180, committed: 360, sameDay: 240 })
    expect(row.sameDayLabel).toBe("le jeudi 11 juillet")
    // Drafts (#1146, lot C) said apart, never as committed.
    expect(committedHoursText(row.minutes)).toBe("Déjà prévu sur l'événement : 4 h confirmées, 2 h en attente de validation ; 3 h en brouillon, pas encore publiées")
  })

  it("names missions back to back without a break and missions that overlap", () => {
    const row = assessCandidate(warningsCtx(), person("Rochat", { held: [held("a", "2030-07-11", "10:00", "14:00"), held("b", "2030-07-11", "19:00", "23:00")] }))
    expect(row.backToBack).toEqual(["Poste a"])
    expect(row.overlaps).toEqual(["Poste b"])
  })

  it("asks for an acknowledgement only when some minutes are declared unavailable", () => {
    const refused = assessCandidate(warningsCtx(), person("Bonvin", { answer: answer([{ date: "2030-07-10", ranges: [] }, { date: "2030-07-11", ranges: [] }], 4) }))
    expect(refused.fit.state).toBe("outside")
    expect(refused.ackKey).toContain("|req-1|4|")
    expect(assessCandidate(warningsCtx(), person("Bonvin")).ackKey).toBeNull()
  })

  it("uses the workload protection's own verdict: a new finding makes the person not eligible", () => {
    // Already 10:00-14:00 the same service day: 14:00-20:00 would make 10 h in a row (limit 6 h).
    const row = assessCandidate(protectedCtx(), person("Morel", { held: [held("a", "2030-07-11", "10:00", "14:00")] }))
    expect(row.eligible).toBe(false)
    expect(row.workload[0]).toMatch(/missions d'affilée/)
    expect(row.sameDayLabel).toBe("la journée de service du jeudi 11 juillet")
  })

  it("is eligible without findings under protection, and drafts are never judged as duty", () => {
    const row = assessCandidate(protectedCtx(), person("Morel", { held: [held("a", "2030-07-11", "10:00", "14:00", "draft")] }))
    expect(row.eligible).toBe(true)
    expect(row.workload).toEqual([])
  })

  it("refuses without a birth date when the event protects minors", () => {
    const minors = activePolicy(buildPolicy({ ...values, minors: { apply: true, maxContinuousMinutes: 240, minBreakMinutes: 30, maxDailyMinutes: 480, minRestMinutes: 720 } } as WorkloadPolicyValues, TZ), EVENT)
    const ctx = { ...protectedCtx(), gate: { kind: "on" as const, policy: minors }, mode: { kind: "policy" as const, policy: minors } }
    const row = assessCandidate(ctx, person("Gerber", { person: { birthDate: null } }))
    expect(row.eligible).toBe(false)
    expect(row.workload[0]).toMatch(/date de naissance/)
  })

  it("refuses everyone while the policy is incomplete", () => {
    const row = assessCandidate({ ...protectedCtx(), gate: { kind: "incomplete" }, mode: { kind: "incomplete" } }, person("Perrin"))
    expect(row.eligible).toBe(false)
    expect(row.workload[0]).toMatch(/incomplète/)
  })

  it("gives non-blocking #465 warnings on an unprotected event", () => {
    const row = assessCandidate(warningsCtx({ ...shift("2030-07-11", "12:00", "20:00"), name: "Bar" }), person("Meyer", { held: [held("a", "2030-07-11", "06:00", "12:00")] }))
    expect(row.eligible).toBe(true)
    expect(row.workload.length).toBeGreaterThan(0)
  })
})

describe("review flags on the cards", () => {
  it("says why an answer needs another look, a change after a publication included (#1146, lot C)", () => {
    const ctx = warningsCtx()
    expect(assessCandidate(ctx, person("Morel", { reviewReason: "published" })).reviewTexts).toEqual(["À revoir : disponibilités modifiées après la publication des affectations."])
    expect(assessCandidate(ctx, person("Morel", { reviewReason: "merge" })).reviewTexts).toEqual(["À revoir : deux fiches fusionnées avaient répondu différemment."])
    expect(assessCandidate(ctx, person("Morel")).reviewTexts).toEqual([])
  })
})

describe("sortCandidates and filterCandidates", () => {
  const ctx = warningsCtx()
  const free = answer([{ date: "2030-07-10", ranges: [] }, { date: "2030-07-11", ranges: [range("2030-07-11", "08:00", "22:00")] }])
  const none = answer([{ date: "2030-07-10", ranges: [] }, { date: "2030-07-11", ranges: [] }])
  const rows = [
    assessCandidate(ctx, person("Zbinden", { answer: free, held: [held("a", "2030-07-12", "08:00", "16:00")] })),
    assessCandidate(ctx, person("Aebi", { answer: none })),
    assessCandidate(ctx, person("Muller", { answer: free })),
    assessCandidate(ctx, person("Blanc")),
  ]

  it("orders by name by default, deterministically", () => {
    expect(sortCandidates(rows, "name").map((r) => r.lastName)).toEqual(["Aebi", "Blanc", "Muller", "Zbinden"])
  })

  it("spreads the load: availability first, then fewer hours, then name", () => {
    expect(sortCandidates(rows, "spread").map((r) => r.lastName)).toEqual(["Muller", "Zbinden", "Blanc", "Aebi"])
  })

  it("puts people who can be added before those the protection would refuse", () => {
    const refused = { ...rows[2], volunteerId: "v-x", lastName: "Aaron", eligible: false }
    expect(sortCandidates([refused, rows[1]], "spread").map((r) => r.lastName)).toEqual(["Aebi", "Aaron"])
  })

  it("keeps only people free for the whole shift when asked", () => {
    expect(filterCandidates(rows, true).map((r) => r.lastName)).toEqual(["Zbinden", "Muller"])
    expect(filterCandidates(rows, false)).toHaveLength(4)
  })
})

describe("judgeAvailabilityAcks: evidence of an acknowledgement (#1146, lot B)", () => {
  const a = answer([{ date: "2030-07-10", ranges: [] }, { date: "2030-07-11", ranges: [range("2030-07-11", "09:00", "15:00")] }], 4)
  const bar = { ...shift("2030-07-11", "14:00", "20:00"), name: "Bar" }
  const base = { eventId: "e1", volunteerId: "v1", shifts: [bar], answer: a, eventDates: DATES, timeZone: TZ }

  it("names the person in what is missing, and keeps the server's evidence for what was given", () => {
    const missing = judgeAvailabilityAcks({ ...base, acks: [] })
    expect(missing.missing).toEqual([expect.objectContaining({ volunteerId: "v1", shiftId: "s1", state: "partial" })])
    const key = missing.missing[0].key
    const given = judgeAvailabilityAcks({ ...base, acks: [key] })
    expect(given.missing).toEqual([])
    expect(given.acknowledged).toEqual([{
      volunteerId: "v1", shiftId: "s1", key, requestId: "req-1", revision: 4, interval: shiftInterval(bar, TZ), timeZone: TZ,
      state: "partial", totalMinutes: 360, coveredMinutes: 60, outsideMinutes: 300, unknownMinutes: 0,
    }])
  })

  it("writes versioned evidence, never a range, and the shift unchanged so the journal names it", () => {
    const [ack] = judgeAvailabilityAcks({ ...base, acks: [judgeAvailabilityAcks({ ...base, acks: [] }).missing[0].key] }).acknowledged
    const changes = availabilityAckChanges(ack, "swap")
    expect(changes).toEqual({
      shiftId: { from: "s1", to: "s1" },
      availabilityAck: { from: null, to: {
        v: 1, via: "swap", requestId: "req-1", revision: 4, shiftStart: "2030-07-11T12:00:00.000Z", shiftEnd: "2030-07-11T18:00:00.000Z", timeZone: TZ,
        state: "partial", totalMinutes: 360, coveredMinutes: 60, outsideMinutes: 300, unknownMinutes: 0,
      } },
    })
    expect(JSON.stringify(changes)).not.toContain("09:00")
  })
})

describe("sameNameHints (#1146, lot B)", () => {
  const p = (id: string, firstName: string, lastName: string, email: string | null) => ({ id, firstName, lastName, email })

  it("says nothing for a name listed once", () => {
    expect(sameNameHints([p("1", "Nadia", "Rochat", "n@example.org"), p("2", "Léa", "Rochat", null)]).size).toBe(0)
  })

  it("tells homonyms apart by their email, or « sans email », whatever the case and spaces", () => {
    const hints = sameNameHints([p("1", "Nadia", "Rochat", "nadia.rochat@example.org"), p("2", " nadia ", "ROCHAT", null), p("3", "Marc", "Favre", null)])
    expect(Object.fromEntries(hints)).toEqual({ 1: "nadia.rochat@example.org", 2: "sans email" })
  })

  it("numbers what is still shared, in a stable order", () => {
    const hints = sameNameHints([p("b", "Nadia", "Rochat", null), p("a", "Nadia", "Rochat", null), p("c", "Nadia", "Rochat", "n@example.org")])
    expect(Object.fromEntries(hints)).toEqual({ a: "sans email, fiche 1 sur 2", b: "sans email, fiche 2 sur 2", c: "n@example.org" })
  })
})
