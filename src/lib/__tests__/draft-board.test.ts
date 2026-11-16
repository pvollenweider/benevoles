// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { availabilityWords, buildBoard, cellAnchor, currentAckKey, draftOptions, type BoardDraft, type BoardInput, type BoardPerson, type BoardShift } from "../draft-board"
import { availabilityStamp, draftShiftTerms } from "../draft-assignments"
import type { AnswerForFit } from "../availability-assist"
import { buildPolicy } from "../workload-policy"
import { workloadGateOf } from "../workload-guard"
import { localDateTimeToUtc } from "../time-zone"

// The review screen of draft assignments (#1146, lot C): the person × day grid and its summary.
const TZ = "Europe/Zurich"
const EVENT = "evt-1"
const NOW = new Date("2031-07-01T08:00:00Z")
const DATES = ["2031-07-10", "2031-07-11"]
const AV = { timeZone: TZ, dates: DATES }

const shift = (id: string, date: string, start: string, end: string, extra: Partial<BoardShift> = {}): BoardShift => ({
  id, eventId: EVENT, roleName: "Bar", label: "Bar", date: new Date(`${date}T00:00:00Z`), startTime: start, endTime: end, status: "open",
  capacity: 3, occupied: 0, overlapAllowed: false, assignedOnly: false, minAge: null, reservedTags: [], locationDetails: null, latitude: null, longitude: null,
  mealOnTheGo: false, placeId: null, placeName: null, ...extra,
})
const answer = (start: string, end: string, revision = 1): AnswerForFit => ({
  requestId: "req-n", revision,
  days: [{ date: "2031-07-10", ranges: [] }, { date: "2031-07-11", ranges: [{ startTime: start, endTime: end, startsAt: localDateTimeToUtc(new Date("2031-07-11T00:00:00Z"), start, TZ), endsAt: localDateTimeToUtc(new Date(end <= start ? "2031-07-12T00:00:00Z" : "2031-07-11T00:00:00Z"), end, TZ) }] }],
})
const person = (id: string, firstName: string, lastName: string, extra: Partial<BoardPerson> = {}): BoardPerson => ({
  id, firstName, lastName, email: null, organizationId: "org", active: true, erasedAt: null, mergedIntoId: null, birthDate: new Date("1990-01-01"), tags: [],
  held: [], answer: null, sameNameHint: null, reviewReason: null, ...extra,
})
const draft = (id: string, s: BoardShift, p: BoardPerson, extra: Partial<BoardDraft> = {}): BoardDraft => ({
  id, revision: 1, shiftId: s.id, volunteerId: p.id, source: "manual", shiftTerms: draftShiftTerms(s), availabilityStamp: availabilityStamp(p.answer), ackKey: null, ...extra,
})
const input = (people: BoardPerson[], shifts: BoardShift[], drafts: BoardDraft[], extra: Partial<BoardInput> = {}): BoardInput => ({
  eventId: EVENT, organizationId: "org", timeZone: TZ, availability: AV, now: NOW, gate: { kind: "off" },
  shifts: new Map(shifts.map((s) => [s.id, s])), people, drafts, reserved: new Map(), limits: new Map(), ...extra,
})

describe("availabilityWords", () => {
  it("says the answer of a date in words", () => {
    const a = answer("20:00", "03:00")
    expect(availabilityWords(a, "2031-07-11")).toEqual({ text: "Libre de 20h à 3h le lendemain", kind: "ranges" })
    expect(availabilityWords(a, "2031-07-10")).toEqual({ text: "Pas disponible", kind: "unavailable" })
    expect(availabilityWords(a, "2031-07-12").kind).toBe("unknown")
    expect(availabilityWords(null, "2031-07-11").text).toBe("Sans réponse")
  })
})

describe("buildBoard", () => {
  const bar = shift("s1", "2031-07-11", "10:00", "14:00")
  const night = shift("s2", "2031-07-11", "22:00", "02:00", { roleName: "Nuit", label: "Nuit" })

  it("puts missions and drafts in the person's cell of their date, committed and draft hours apart", () => {
    const nadia = person("v-n", "Nadia", "Rochat", { answer: answer("09:00", "03:00"), held: [{ id: "r1", status: "active", shift: bar }] })
    const board = buildBoard(input([nadia], [bar, night], [draft("d1", night, nadia)]))
    expect(board.dates).toEqual(DATES)
    const row = board.rows[0]
    expect(row.committedMinutes).toBe(240)
    expect(row.draftMinutes).toBe(240)
    const cell = row.cells.find((c) => c.date === "2031-07-11")!
    expect(cell.items.map((i) => [i.kind, i.name])).toEqual([["confirmed", "Bar"], ["draft", "Nuit"]])
    expect(cell.items[1].time).toBe("de 22h à 2h, jusqu'au lendemain")
    expect(board.summary).toMatchObject({ drafts: 1, people: 1, stale: 0, ackMissing: 0, problems: [] })
    expect(board.summary.selection).toEqual([{ id: "d1", revision: 1 }])
  })

  it("counts the confirmations still to give, and drafts to review", () => {
    const busy = person("v-n", "Nadia", "Rochat", { answer: answer("15:00", "18:00") })
    const board = buildBoard(input([busy], [bar], [draft("d1", bar, busy)]))
    const item = board.rows[0].cells[1].items[0]
    expect(item.draft).toMatchObject({ acked: false, stale: false })
    expect(item.draft?.ackKey).toBe(currentAckKey(EVENT, busy.id, bar, busy.answer, AV))
    expect(board.summary.ackMissing).toBe(1)
    expect(board.summary.problems.map((p) => p.code)).toEqual(["ack_missing"])
    expect(board.summary.problems[0].anchor).toBe(cellAnchor(busy.id, "2031-07-11"))

    const acked = buildBoard(input([busy], [bar], [draft("d1", bar, busy, { ackKey: currentAckKey(EVENT, busy.id, bar, busy.answer, AV) })]))
    expect(acked.summary).toMatchObject({ ackMissing: 0, problems: [] })

    const stale = buildBoard(input([busy], [bar], [draft("d1", bar, busy, { availabilityStamp: "req-n:0" })]))
    expect(stale.summary.stale).toBe(1)
    expect(stale.rows[0].cells[1].items[0].draft?.staleText).toBe("À revoir : ses disponibilités de ces heures ont changé depuis le brouillon.")
  })

  it("judges the workload protection on the projection with every draft, as a finding of the row", () => {
    const gate = workloadGateOf({ workloadProtectionEnabled: true, workloadPolicy: buildPolicy({ serviceDayStart: "06:00", maxContinuousMinutes: 6 * 60, minBreakMinutes: 30, maxDailyMinutes: 8 * 60, maxEventMinutes: 40 * 60, minRestMinutes: 10 * 60, maxIdleGapMinutes: 4 * 60 }, TZ), startDate: "2031-07-10", endDate: "2031-07-11" })
    expect(gate.kind).toBe("on")
    const evening = shift("s3", "2031-07-11", "15:00", "20:00", { roleName: "Accueil", label: "Accueil" })
    const nadia = person("v-n", "Nadia", "Rochat", { held: [{ id: "r1", status: "active", shift: bar }] })
    // 4 h confirmed + 5 h drafted: over 8 h that service day; neither alone is.
    const board = buildBoard(input([nadia], [bar, evening], [draft("d1", evening, nadia)], { gate }))
    expect(board.rows[0].findings.length).toBeGreaterThan(0)
    expect(board.summary.problems.find((p) => p.code === "workload")).toMatchObject({ volunteerId: "v-n", anchor: "row-v-n" })
    expect(buildBoard(input([nadia], [bar, evening], [], { gate })).rows[0].findings).toEqual([])
  })

  it("shows the organisers' review flags", () => {
    const flagged = person("v-n", "Nadia", "Rochat", { reviewReason: "published" })
    expect(buildBoard(input([flagged], [bar], [])).rows[0].reviewTexts).toEqual(["À revoir : disponibilités modifiées après la publication des affectations."])
  })

  it("adds a column for a mission outside the event's dates, and sorts people by name", () => {
    const later = shift("s9", "2031-07-14", "10:00", "12:00")
    const a = person("v-a", "Luca", "Bianchi"), b = person("v-b", "Ana", "Amrein", { held: [{ id: "r", status: "active", shift: later }] })
    const board = buildBoard(input([a, b], [later], []))
    expect(board.dates).toEqual([...DATES, "2031-07-14"])
    expect(board.rows.map((r) => r.lastName)).toEqual(["Amrein", "Bianchi"])
  })
})

describe("draftOptions", () => {
  const bar = shift("s1", "2031-07-11", "10:00", "14:00")
  const night = shift("s2", "2031-07-11", "22:00", "02:00", { roleName: "Nuit", label: "Nuit" })
  const other = shift("s3", "2031-07-10", "10:00", "12:00")
  const off = shift("s4", "2031-07-11", "08:00", "09:00", { status: "cancelled" })

  it("lists the date's live shifts in time order, with fit, acknowledgement and what is already taken", () => {
    const nadia = person("v-n", "Nadia", "Rochat", { answer: answer("09:00", "16:00"), held: [{ id: "r1", status: "waiting", shift: bar }] })
    const options = draftOptions({ eventId: EVENT, date: "2031-07-11", person: nadia, drafts: [], shifts: [night, other, off, bar], availability: AV, gate: { kind: "off" } })
    expect(options.map((o) => [o.shiftId, o.taken])).toEqual([["s1", "registered"], ["s2", null]])
    expect(options[1]).toMatchObject({ fit: "outside", fitLabel: "Pas disponible à ces heures" })
    expect(options[1].ackKey).toBeTruthy()
  })

  it("marks a shift already drafted, and says the workload protection would refuse it", () => {
    const nadia = person("v-n", "Nadia", "Rochat")
    const options = draftOptions({ eventId: EVENT, date: "2031-07-11", person: nadia, drafts: [draft("d1", bar, nadia)], shifts: [bar, night], availability: AV, gate: { kind: "incomplete" } })
    expect(options[0].taken).toBe("draft")
    expect(options[1].workload.length).toBe(1)
  })
})
