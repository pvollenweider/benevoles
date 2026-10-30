// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import {
  availabilityStamp, draftReviewState, draftShiftTerms, judgeDraftBatch, publicationRefusalText, selectionCanonical, MERGE_STAMP,
  type BatchDraft, type BatchInput, type BatchPerson, type BatchShift,
} from "../draft-assignments"
import { availabilityAckKey, shiftInterval, type AnswerForFit } from "../availability-assist"
import { localDateTimeToUtc } from "../time-zone"

// Draft assignments (#1146, lot C): the batch rules a publication applies, all or nothing.
const TZ = "Europe/Zurich"
const EVENT = "evt-1"
const ORG = "org-1"
const NOW = new Date("2031-07-01T08:00:00Z")
const DATES = ["2031-07-10", "2031-07-11", "2031-07-12"]

const shift = (id: string, start: string, end: string, extra: Partial<BatchShift> = {}): BatchShift => ({
  id, eventId: EVENT, roleName: "Bar", label: "Bar", date: new Date("2031-07-11T00:00:00Z"), startTime: start, endTime: end,
  status: "open", capacity: 3, occupied: 0, overlapAllowed: false, assignedOnly: false, minAge: null, reservedTags: [],
  locationDetails: null, latitude: null, longitude: null, ...extra,
})

const person = (id: string, firstName: string, lastName: string, extra: Partial<BatchPerson> = {}): BatchPerson => ({
  id, firstName, lastName, organizationId: ORG, active: true, erasedAt: null, mergedIntoId: null, birthDate: new Date("1990-05-01"), tags: [], held: [], answer: null, ...extra,
})

const draft = (id: string, s: BatchShift, p: BatchPerson, extra: Partial<BatchDraft> = {}): BatchDraft => ({
  id, shiftId: s.id, volunteerId: p.id, shiftTerms: draftShiftTerms(s), availabilityStamp: availabilityStamp(p.answer), ackKey: null, ...extra,
})

const input = (drafts: BatchDraft[], shifts: BatchShift[], people: BatchPerson[], extra: Partial<BatchInput> = {}): BatchInput => ({
  eventId: EVENT, organizationId: ORG, timeZone: TZ, availability: { timeZone: TZ, dates: DATES }, now: NOW,
  drafts, shifts: new Map(shifts.map((s) => [s.id, s])), people: new Map(people.map((p) => [p.id, p])),
  reserved: new Map(), limits: new Map(), ...extra,
})

const codes = (i: BatchInput) => judgeDraftBatch(i).problems.map((p) => p.code)

/** An answer: free on 2031-07-11 from `start` to `end`; the day before answered too (its night could reach the 11th). */
function answer(start: string, end: string, revision = 1, answered: string[] = ["2031-07-10", "2031-07-11"]): AnswerForFit {
  const day = new Date("2031-07-11T00:00:00Z")
  return {
    requestId: "req-1", revision,
    days: answered.map((date) => ({
      date,
      ranges: date === "2031-07-11" ? [{ startTime: start, endTime: end, startsAt: localDateTimeToUtc(day, start, TZ), endsAt: localDateTimeToUtc(day, end, TZ) }] : [],
    })),
  }
}

describe("draft review snapshot", () => {
  const bar = shift("s1", "10:00", "14:00")

  it("is stale when the shift's material terms change, not when its label does", () => {
    const terms = draftShiftTerms(bar)
    expect(draftReviewState({ shiftTerms: terms, availabilityStamp: "none" }, { shiftTerms: draftShiftTerms({ ...bar, label: "Bar du matin" } as BatchShift), availabilityStamp: "none" }).stale).toBe(false)
    const moved = draftReviewState({ shiftTerms: terms, availabilityStamp: "none" }, { shiftTerms: draftShiftTerms({ ...bar, startTime: "11:00" }), availabilityStamp: "none" })
    expect(moved).toEqual({ stale: true, shiftChanged: true, availabilityChanged: false })
  })

  it("is stale when the answer's revision or request changes, and after a merge", () => {
    expect(availabilityStamp(null)).toBe("none")
    expect(availabilityStamp({ requestId: "r", revision: 2 })).toBe("r:2")
    const review = { shiftTerms: "t", availabilityStamp: "r:2" }
    expect(draftReviewState(review, { shiftTerms: "t", availabilityStamp: "r:3" }).availabilityChanged).toBe(true)
    expect(draftReviewState(review, { shiftTerms: "t", availabilityStamp: "q:2" }).availabilityChanged).toBe(true)
    expect(draftReviewState({ ...review, availabilityStamp: MERGE_STAMP }, { shiftTerms: "t", availabilityStamp: "none" }).stale).toBe(true)
  })

  it("keeps a version prefix, so a later rule change reads older drafts as stale", () => {
    expect(draftShiftTerms(bar).startsWith("t1:")).toBe(true)
  })
})

describe("judgeDraftBatch", () => {
  const nadia = person("v-nadia", "Nadia", "Rochat")
  const luca = person("v-luca", "Luca", "Bianchi")

  it("accepts a clean batch, several people and shifts", () => {
    const a = shift("s1", "10:00", "14:00"), b = shift("s2", "15:00", "18:00")
    const verdict = judgeDraftBatch(input([draft("d1", a, nadia), draft("d2", b, nadia), draft("d3", a, luca)], [a, b], [nadia, luca]))
    expect(verdict.problems).toEqual([])
    expect(verdict.usable.get("v-nadia")?.map((u) => u.draftId)).toEqual(["d1", "d2"])
  })

  it("counts the whole batch against the capacity, with places already held", () => {
    const a = shift("s1", "10:00", "14:00", { capacity: 2, occupied: 1 })
    const problems = judgeDraftBatch(input([draft("d1", a, nadia), draft("d2", a, luca)], [a], [nadia, luca])).problems
    expect(problems.map((p) => p.code)).toEqual(["capacity"])
    expect(problems[0].message).toContain("Retirez-en 1")
  })

  it("refuses overlapping drafts of one person, and an overlap with a mission held", () => {
    const a = shift("s1", "10:00", "14:00"), b = shift("s2", "13:00", "16:00")
    expect(codes(input([draft("d1", a, nadia), draft("d2", b, nadia)], [a, b], [nadia]))).toEqual(["overlap"])
    const held = person("v-nadia", "Nadia", "Rochat", { held: [{ id: "r1", status: "active", shift: shift("s9", "12:00", "13:00") }] })
    expect(codes(input([draft("d1", a, held)], [a], [held]))).toEqual(["overlap"])
  })

  it("lets a cumulable poste overlap (#986), and ignores a cancelled mission held", () => {
    const a = shift("s1", "10:00", "14:00"), secours = shift("s2", "09:00", "17:00", { roleName: "Secours", label: "Secours", overlapAllowed: true })
    expect(codes(input([draft("d1", a, nadia), draft("d2", secours, nadia)], [a, secours], [nadia]))).toEqual([])
    const held = person("v-nadia", "Nadia", "Rochat", { held: [{ id: "r1", status: "active", shift: shift("s9", "12:00", "13:00", { status: "cancelled" }) }] })
    expect(codes(input([draft("d1", a, held)], [a], [held]))).toEqual([])
  })

  it("refuses a person already on the shift, whatever their live status", () => {
    const a = shift("s1", "10:00", "14:00")
    for (const status of ["active", "waiting", "offered", "requested"]) {
      const held = person("v-nadia", "Nadia", "Rochat", { held: [{ id: "r1", status, shift: a }] })
      expect(codes(input([draft("d1", a, held)], [a], [held]))).toEqual(["already_on_shift"])
    }
  })

  it("refuses a person who is no longer an active member of the organisation", () => {
    const a = shift("s1", "10:00", "14:00")
    for (const extra of [{ active: false }, { erasedAt: new Date() }, { mergedIntoId: "v-x" }, { organizationId: "org-2" }]) {
      const p = person("v-nadia", "Nadia", "Rochat", extra)
      expect(codes(input([draft("d1", a, p)], [a], [p]))).toEqual(["person_gone"])
    }
  })

  it("refuses a cancelled or finished shift", () => {
    const cancelled = shift("s1", "10:00", "14:00", { status: "cancelled" })
    expect(codes(input([draft("d1", cancelled, nadia)], [cancelled], [nadia]))).toEqual(["shift_cancelled"])
    const past = shift("s2", "10:00", "14:00", { date: new Date("2031-06-30T00:00:00Z") })
    expect(codes(input([draft("d1", past, nadia)], [past], [nadia]))).toEqual(["shift_ended"])
  })

  it("lets an ongoing shift through: only a finished one is refused", () => {
    const now = localDateTimeToUtc(new Date("2031-07-11T00:00:00Z"), "12:00", TZ)
    const a = shift("s1", "10:00", "14:00")
    expect(codes(input([draft("d1", a, nadia)], [a], [nadia], { now }))).toEqual([])
  })

  it("refuses a draft whose shift or answer changed since its review, even when it now fits", () => {
    const a = shift("s1", "10:00", "14:00")
    expect(codes(input([draft("d1", a, nadia, { shiftTerms: draftShiftTerms({ ...a, startTime: "09:00" }) })], [a], [nadia]))).toEqual(["shift_changed"])
    const free = person("v-nadia", "Nadia", "Rochat", { answer: answer("08:00", "20:00", 2) })
    expect(codes(input([draft("d1", a, free, { availabilityStamp: "req-1:1" })], [a], [free]))).toEqual(["availability_changed"])
  })

  it("refuses a minimum age not reached, or no birth date when one is needed (#192)", () => {
    const a = shift("s1", "10:00", "14:00", { minAge: 18 })
    const young = person("v-nadia", "Nadia", "Rochat", { birthDate: new Date("2015-01-01") })
    expect(codes(input([draft("d1", a, young)], [a], [young]))).toEqual(["min_age"])
    const unknown = person("v-nadia", "Nadia", "Rochat", { birthDate: null })
    expect(codes(input([draft("d1", a, unknown)], [a], [unknown]))).toEqual(["birthdate_missing"])
    expect(codes(input([draft("d1", a, nadia)], [a], [nadia]))).toEqual([])
  })

  it("refuses a poste reserved to tags the person lacks (#470), and lets an assigned-only one through", () => {
    const a = shift("s1", "10:00", "14:00", { roleName: "Sécurité", label: "Sécurité" })
    const reserved = new Map([["Sécurité", ["sécurité"]]])
    expect(codes(input([draft("d1", a, nadia)], [a], [nadia], { reserved }))).toEqual(["reserved"])
    const tagged = person("v-nadia", "Nadia", "Rochat", { tags: ["Sécurité"] })
    expect(codes(input([draft("d1", a, tagged)], [a], [tagged], { reserved }))).toEqual([])
    const assigned = shift("s2", "15:00", "16:00", { assignedOnly: true })
    expect(codes(input([draft("d2", assigned, nadia)], [assigned], [nadia]))).toEqual([])
  })

  it("counts the whole batch and what is held against the limit per person of a poste (#466)", () => {
    const a = shift("s1", "10:00", "11:00"), b = shift("s2", "12:00", "13:00")
    const limits = new Map([["Bar", 2]])
    expect(codes(input([draft("d1", a, nadia), draft("d2", b, nadia)], [a, b], [nadia], { limits }))).toEqual([])
    const held = person("v-nadia", "Nadia", "Rochat", { held: [{ id: "r1", status: "waiting", shift: shift("s9", "08:00", "09:00") }] })
    const problems = judgeDraftBatch(input([draft("d1", a, held), draft("d2", b, held)], [a, b], [held], { limits })).problems
    expect(problems.map((p) => p.code)).toEqual(["role_limit"])
    expect(problems[0].message).toContain("1 déjà prévu et 2 à publier")
  })

  describe("outside declared availability (owner decision 6)", () => {
    const a = shift("s1", "10:00", "14:00")
    const busy = person("v-nadia", "Nadia", "Rochat", { answer: answer("15:00", "18:00") })
    const key = availabilityAckKey({ eventId: EVENT, volunteerId: busy.id, shiftId: a.id, interval: shiftInterval(a, TZ), requestId: "req-1", revision: 1, timeZone: TZ })

    it("needs the draft's acknowledgement, bound to the current answer", () => {
      expect(codes(input([draft("d1", a, busy)], [a], [busy]))).toEqual(["ack_missing"])
      const verdict = judgeDraftBatch(input([draft("d1", a, busy, { ackKey: key })], [a], [busy]))
      expect(verdict.problems).toEqual([])
      expect(verdict.acknowledged).toEqual([expect.objectContaining({ volunteerId: busy.id, shiftId: a.id, requestId: "req-1", revision: 1, state: "outside" })])
    })

    it("never asks for unknown availability, nor for a person never asked", () => {
      const unanswered = person("v-nadia", "Nadia", "Rochat", { answer: answer("15:00", "18:00", 1, []) })
      expect(codes(input([draft("d1", a, unanswered)], [a], [unanswered]))).toEqual([])
      expect(codes(input([draft("d1", a, nadia)], [a], [nadia]))).toEqual([])
    })

    it("does not accept an acknowledgement given for another shift", () => {
      const b = shift("s2", "10:30", "13:00")
      expect(codes(input([draft("d1", b, busy, { ackKey: key })], [b], [busy]))).toEqual(["ack_missing"])
    })
  })

  it("lists every problem of every person at once", () => {
    const a = shift("s1", "10:00", "14:00", { capacity: 1 }), b = shift("s2", "12:00", "15:00")
    const gone = person("v-luca", "Luca", "Bianchi", { active: false })
    expect(codes(input([draft("d1", a, nadia), draft("d2", b, nadia), draft("d3", a, gone)], [a, b], [nadia, gone])).sort()).toEqual(["capacity", "overlap", "person_gone"])
  })
})

describe("words and canonical forms", () => {
  it("says how many problems and that nothing was published", () => {
    expect(publicationRefusalText([{ code: "capacity", message: "Bar : complet." }, { code: "overlap", message: "x" }])).toBe("Publication impossible : 2 points à corriger. Rien n'a été publié. Bar : complet.")
  })

  it("puts a selection in one order, so a retry hashes the same", () => {
    expect(selectionCanonical([{ id: "b", revision: 2 }, { id: "a", revision: 1 }])).toBe("a:1,b:2")
  })
})
