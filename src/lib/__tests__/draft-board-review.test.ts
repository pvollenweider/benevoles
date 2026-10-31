// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { buildBoard, currentAckKey, draftOptions, type BoardDraft, type BoardInput, type BoardPerson, type BoardShift } from "../draft-board"
import { availabilityStamp, currentStampFor, draftAvailabilityStamp, draftShiftTerms, judgeDraftBatch, reachDates, type BatchPerson } from "../draft-assignments"
import { shiftInterval, type AnswerForFit } from "../availability-assist"
import { localDateTimeToUtc } from "../time-zone"

// Independent review of the draft screens (#1146): staleness per date, outside missions after a
// publication, coverage, short markers, order and counts.
const TZ = "Europe/Zurich"
const EVENT = "evt-1"
const NOW = new Date("2031-07-01T08:00:00Z")
const DATES = ["2031-07-10", "2031-07-11", "2031-07-12"]
const AV = { timeZone: TZ, dates: DATES }
const N = " "

const shift = (id: string, date: string, start: string, end: string, extra: Partial<BoardShift> = {}): BoardShift => ({
  id, eventId: EVENT, roleName: "Bar", label: "Bar", date: new Date(`${date}T00:00:00Z`), startTime: start, endTime: end, status: "open",
  capacity: 3, occupied: 0, overlapAllowed: false, assignedOnly: false, minAge: null, reservedTags: [], locationDetails: null, latitude: null, longitude: null,
  mealOnTheGo: false, placeId: null, placeName: null, ...extra,
})
const range = (date: string, start: string, end: string) => ({
  startTime: start, endTime: end,
  startsAt: localDateTimeToUtc(new Date(`${date}T00:00:00Z`), start, TZ),
  endsAt: localDateTimeToUtc(new Date(`${end <= start ? new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : date}T00:00:00Z`), end, TZ),
})
/** An answer: per date, its ranges ([] = not available); a date left out = no answer. */
const answer = (days: Record<string, [string, string][]>, revision = 1): AnswerForFit => ({
  requestId: "req-n", revision,
  days: Object.entries(days).map(([date, ranges]) => ({ date, ranges: ranges.map(([a, b]) => range(date, a, b)) })),
})
const person = (id: string, firstName: string, lastName: string, extra: Partial<BoardPerson> = {}): BoardPerson => ({
  id, firstName, lastName, email: `${id}@example.org`, organizationId: "org", active: true, erasedAt: null, mergedIntoId: null, birthDate: new Date("1990-01-01"), tags: [],
  held: [], answer: null, sameNameHint: null, reviewReason: null, ...extra,
})
const draftOf = (id: string, s: BoardShift, p: BoardPerson, extra: Partial<BoardDraft> = {}): BoardDraft => ({
  id, revision: 1, shiftId: s.id, volunteerId: p.id, source: "manual", shiftTerms: draftShiftTerms(s), availabilityStamp: draftAvailabilityStamp(p.answer, s, TZ), ackKey: null, ...extra,
})
const input = (people: BoardPerson[], shifts: BoardShift[], drafts: BoardDraft[], extra: Partial<BoardInput> = {}): BoardInput => ({
  eventId: EVENT, organizationId: "org", timeZone: TZ, availability: AV, now: NOW, gate: { kind: "off" },
  shifts: new Map(shifts.map((s) => [s.id, s])), people, drafts, reserved: new Map(), limits: new Map(), ...extra,
})

describe("the review snapshot, per date (P2 #13)", () => {
  const day1 = shift("s1", "2031-07-10", "10:00", "14:00")
  const night = shift("s2", "2031-07-11", "22:00", "02:00")

  it("reaches the day before, the shift's dates and the next morning of a night shift", () => {
    expect(reachDates(shiftInterval(day1, TZ), TZ)).toEqual(["2031-07-09", "2031-07-10"])
    expect(reachDates(shiftInterval(night, TZ), TZ)).toEqual(["2031-07-10", "2031-07-11", "2031-07-12"])
    // Ending exactly at midnight: the last minute is still the same date.
    expect(reachDates(shiftInterval(shift("s3", "2031-07-11", "20:00", "00:00"), TZ), TZ)).toEqual(["2031-07-10", "2031-07-11"])
  })

  it("leaves a draft alone when another date changes, and marks it « à revoir » when its own changes", () => {
    const before = person("v-n", "Nadia", "Rochat", { answer: answer({ "2031-07-10": [["09:00", "18:00"]], "2031-07-12": [] }) })
    const d = draftOf("d1", day1, before)
    // Another date, far from the shift, answered meanwhile (a new revision).
    const other = { ...before, answer: answer({ "2031-07-10": [["09:00", "18:00"]], "2031-07-12": [["10:00", "12:00"]] }, 2) }
    const kept = buildBoard(input([other], [day1], [d]))
    expect(kept.summary.stale).toBe(0)
    expect(kept.summary.problems).toEqual([])
    // Its own date changed: « à revoir », publication refused.
    const own = { ...before, answer: answer({ "2031-07-10": [["09:00", "13:00"]], "2031-07-12": [] }, 3) }
    const stale = buildBoard(input([own], [day1], [d]))
    expect(stale.summary.stale).toBe(1)
    expect(stale.summary.problems.map((p) => p.code)).toEqual(["availability_changed"])
    expect(stale.rows[0].cells[0].items[0].draft?.staleText).toBe(`À revoir${N}: ses disponibilités de ces heures ont changé depuis le brouillon.`)
  })

  it("ignores the day before's daytime ranges, which can never reach the shift", () => {
    const sat = shift("s6", "2031-07-11", "18:00", "22:00")
    const before = person("v-n", "Nadia", "Rochat", { answer: answer({ "2031-07-10": [["17:00", "23:00"]], "2031-07-11": [["17:00", "23:00"]] }) })
    const d = draftOf("d1", sat, before)
    const changed = { ...before, answer: answer({ "2031-07-10": [["08:00", "12:00"]], "2031-07-11": [["17:00", "23:00"]] }, 2) }
    expect(buildBoard(input([changed], [sat], [d])).summary.stale).toBe(0)
    // Unanswered, the day before turns declared minutes into unknown ones: that change counts.
    const unanswered = { ...before, answer: answer({ "2031-07-11": [["17:00", "23:00"]] }, 3) }
    expect(buildBoard(input([unanswered], [sat], [d])).summary.stale).toBe(1)
  })

  it("watches the day before too: a night range of the day before can cover the shift", () => {
    const before = person("v-n", "Nadia", "Rochat", { answer: answer({ "2031-07-10": [["20:00", "03:00"]], "2031-07-11": [] }) })
    const early = shift("s5", "2031-07-11", "01:00", "02:00")
    const d = draftOf("d1", early, before)
    const changed = { ...before, answer: answer({ "2031-07-10": [["20:00", "23:00"]], "2031-07-11": [] }, 2) }
    expect(buildBoard(input([changed], [early], [d])).summary.stale).toBe(1)
  })

  it("keeps the acknowledgement bound to the answer's revision (owner decision 6): another date changed, the confirmation is asked again", () => {
    const busy = person("v-n", "Nadia", "Rochat", { answer: answer({ "2031-07-10": [["15:00", "18:00"]], "2031-07-09": [] }) })
    const acked = draftOf("d1", day1, busy, { ackKey: currentAckKey(EVENT, busy.id, day1, busy.answer, AV) })
    expect(buildBoard(input([busy], [day1], [acked])).summary).toMatchObject({ stale: 0, ackMissing: 0 })
    const other = { ...busy, answer: answer({ "2031-07-10": [["15:00", "18:00"]], "2031-07-09": [], "2031-07-12": [["09:00", "10:00"]] }, 2) }
    const board = buildBoard(input([other], [day1], [acked]))
    expect(board.summary).toMatchObject({ stale: 0, ackMissing: 1 })
    expect(board.summary.problems.map((p) => p.code)).toEqual(["ack_missing"])
  })

  it("compares a draft stamped before the review the old way (request and revision)", () => {
    const p = person("v-n", "Nadia", "Rochat", { answer: answer({ "2031-07-10": [["09:00", "18:00"]] }, 4) })
    const legacy = availabilityStamp(p.answer && { requestId: p.answer.requestId, revision: p.answer.revision })
    expect(legacy).toBe("req-n:4")
    expect(currentStampFor(legacy, p.answer, day1, TZ)).toBe(legacy)
    expect(currentStampFor("req-n:3", p.answer, day1, TZ)).toBe("req-n:4")
    expect(currentStampFor("merge", p.answer, day1, TZ)).toBe("req-n:4")
    expect(draftAvailabilityStamp(p.answer, day1, TZ)).toBe("a2:req-n:2031-07-09=?;2031-07-10=09:00-18:00")
    expect(draftAvailabilityStamp(null, day1, TZ)).toBe("none")
    expect(buildBoard(input([p], [day1], [draftOf("d1", day1, p, { availabilityStamp: "req-n:3" })])).summary.stale).toBe(1)
    expect(buildBoard(input([p], [day1], [draftOf("d1", day1, p, { availabilityStamp: "req-n:4" })])).summary.stale).toBe(0)
  })
})

describe("missions outside a corrected answer (P1 #4)", () => {
  const bar = shift("s1", "2031-07-11", "10:00", "14:00")
  const late = shift("s2", "2031-07-11", "18:00", "20:00")
  const corrected = answer({ "2031-07-10": [], "2031-07-11": [["16:00", "22:00"]] }, 3)

  it("marks only the missions now outside, of a person flagged after a publication, and lists them in the summary", () => {
    const lea = person("v-l", "Léa", "Müller", { reviewReason: "published", answer: corrected, held: [{ id: "r1", status: "active", shift: bar }, { id: "r2", status: "requested", shift: late }] })
    const board = buildBoard(input([lea], [bar, late], []))
    const [first, second] = board.rows[0].cells[1].items
    expect(first).toMatchObject({ registrationId: "r1", review: `À revoir${N}: actuellement en dehors de ses disponibilités corrigées.` })
    expect(second.review).toBeNull()
    expect(board.summary.toReview).toEqual([{ volunteerId: "v-l", date: "2031-07-11", name: "Bar", time: "de 10h à 14h" }])
    expect(board.rows[0].seenRevision).toBe(3)
  })

  it("says nothing more without the flag: a mission acknowledged outside stays a plain fit", () => {
    const lea = person("v-l", "Léa", "Müller", { reviewReason: "merge", answer: corrected, held: [{ id: "r1", status: "active", shift: bar }] })
    const board = buildBoard(input([lea], [bar], []))
    expect(board.rows[0].cells[1].items[0].review).toBeNull()
    expect(board.rows[0].cells[1].items[0].fit).toBe("outside")
    expect(board.summary.toReview).toEqual([])
    // Still flagged (a merge): « Marquer comme vu » is offered at the answer's revision.
    expect(board.rows[0].seenRevision).toBe(3)
    expect(buildBoard(input([person("v-x", "Ana", "Amrein")], [bar], [])).rows[0].seenRevision).toBeNull()
  })
})

describe("coverage, markers, order and counts", () => {
  it("counts the places still to fill per shift, after the drafts, never letting an overfull shift hide another", () => {
    const full = shift("s1", "2031-07-11", "10:00", "14:00", { capacity: 1, occupied: 1 })
    const open = shift("s2", "2031-07-11", "15:00", "18:00", { capacity: 3, occupied: 0 })
    const off = shift("s3", "2031-07-11", "08:00", "09:00", { status: "cancelled" })
    const a = person("v-a", "Ana", "Amrein"), b = person("v-b", "Luca", "Bianchi")
    const board = buildBoard(input([a, b], [full, open, off], [draftOf("d1", full, a), draftOf("d2", open, b)]))
    const day = board.summary.coverage.find((c) => c.date === "2031-07-11")!
    expect(day.missing).toBe(2)
    expect(day.shifts).toEqual([{ shiftId: "s2", name: "Bar", time: "de 15h à 18h", missing: 2 }])
    expect(board.summary.coverage.map((c) => c.date)).toEqual(board.dates)
  })

  it("puts short markers in the cell and the row, names the people on an overfull shift, and drops the name from the summary text", () => {
    const tight = shift("s1", "2031-07-11", "10:00", "14:00", { capacity: 1 })
    const a = person("v-a", "Ana", "Amrein"), b = person("v-b", "Luca", "Bianchi")
    const board = buildBoard(input([a, b], [tight], [draftOf("d1", tight, a), draftOf("d2", tight, b)]))
    const capacity = board.summary.problems.find((p) => p.code === "capacity")!
    expect(capacity.message).toContain("(Ana Amrein, Luca Bianchi)")
    expect(capacity.date).toBe("2031-07-11")
    expect(board.rows[0].cells[1].items[0].draft?.markers).toEqual([`Bloque la publication${N}: places`])
  })

  it("sorts a cell's items by start time, « 9h » before « 14h »", () => {
    const morning = shift("s1", "2031-07-11", "09:00", "10:00"), afternoon = shift("s2", "2031-07-11", "14:00", "15:00")
    const a = person("v-a", "Ana", "Amrein")
    const board = buildBoard(input([a], [afternoon, morning], [draftOf("d2", afternoon, a), draftOf("d1", morning, a)]))
    expect(board.rows[0].cells[1].items.map((i) => i.time)).toEqual(["de 9h à 10h", "de 14h à 15h"])
  })

  it("counts the people with a draft and no email (the publication tells them nothing)", () => {
    const s = shift("s1", "2031-07-11", "10:00", "14:00")
    const a = person("v-a", "Ana", "Amrein", { email: null }), b = person("v-b", "Luca", "Bianchi"), c = person("v-c", "Zoé", "Cuche", { email: " " })
    expect(buildBoard(input([a, b, c], [s], [draftOf("d1", s, a), draftOf("d2", s, b)])).summary.withoutEmail).toBe(1)
  })

  it("counts other people's drafts on each option, never the person's own", () => {
    const s = shift("s1", "2031-07-11", "10:00", "14:00")
    const a = person("v-a", "Ana", "Amrein")
    const options = draftOptions({ eventId: EVENT, date: "2031-07-11", person: a, drafts: [draftOf("d1", s, a)], shifts: [s], availability: AV, gate: { kind: "off" }, draftsOn: new Map([["s1", 3]]) })
    expect(options[0].drafted).toBe(2)
    expect(draftOptions({ eventId: EVENT, date: "2031-07-11", person: a, drafts: [], shifts: [s], availability: AV, gate: { kind: "off" } })[0].drafted).toBe(0)
  })

  it("names a person no longer active in the refusal, and gives each person's problem without their name", () => {
    const s = shift("s1", "2031-07-11", "10:00", "14:00")
    const gone: BatchPerson = { ...person("v-g", "Emma", "Johansson"), active: false }
    const verdict = judgeDraftBatch({ eventId: EVENT, organizationId: "org", timeZone: TZ, availability: AV, now: NOW, drafts: [draftOf("d1", s, gone as BoardPerson)], shifts: new Map([["s1", s]]), people: new Map([["v-g", gone]]), reserved: new Map(), limits: new Map() })
    expect(verdict.problems[0].message).toBe(`Emma Johansson n'est plus membre actif de l'organisation${N}: retirez ses affectations en brouillon.`)
    expect(verdict.problems[0].short).toBe(`N'est plus membre actif de l'organisation${N}: retirez ses affectations en brouillon.`)
    const unknown = judgeDraftBatch({ eventId: EVENT, organizationId: "org", timeZone: TZ, availability: AV, now: NOW, drafts: [draftOf("d1", s, gone as BoardPerson)], shifts: new Map([["s1", s]]), people: new Map(), reserved: new Map(), limits: new Map() })
    expect(unknown.problems[0].message).toMatch(/^Une personne n'est plus membre actif/)
  })
})
