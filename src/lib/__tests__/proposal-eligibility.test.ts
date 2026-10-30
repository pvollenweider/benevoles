// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { buildModel } from "../proposal-eligibility"
import { suggestedTargetMinutes, inputProblem, categoryOf } from "../proposal-input"
import { createPrng, normaliseSeed } from "../proposal-prng"
import { allDay, freeRange, tInput, tPerson, tShift, DATES } from "./fixtures/proposal-tiny"

// The assignment proposal (#1172): static eligibility, the rules no other generated mission can lift.
const D = DATES[0]
const exclusionOf = (shiftId: string, personId: string, input: ReturnType<typeof tInput>) => buildModel(input).exclusions.get(shiftId)!.get(personId)

describe("static eligibility", () => {
  it("never treats a missing or partial answer as available (C01, C02)", () => {
    const s = tShift("s1", D, "09:00", "12:00")
    const input = tInput([s], [
      tPerson("none", { answer: null }),
      tPerson("part", { answer: { requestId: "r", revision: 1, days: [{ date: D, ranges: [freeRange(D, "10:00", "12:00")] }] } }),
      tPerson("away", { answer: { requestId: "r2", revision: 1, days: [{ date: D, ranges: [] }] } }),
      tPerson("other", { answer: allDay("other", [DATES[1]]) }),
      tPerson("ok"),
    ])
    const m = buildModel(input)
    expect(m.candidates.get("s1")).toEqual(["ok"])
    expect(m.exclusions.get("s1")!.get("none")!.code).toBe("no_answer")
    expect(m.exclusions.get("s1")!.get("part")!.code).toBe("availability_partial")
    expect(m.exclusions.get("s1")!.get("away")!.code).toBe("availability_outside")
    expect(m.exclusions.get("s1")!.get("other")!.code).toBe("availability_unknown")
  })

  it("excludes the person already on the shift, too young, without the tag or at the poste's limit", () => {
    const s = tShift("s1", D, "09:00", "12:00", { roleName: "Chauffeur", minAge: 18, reservedTags: ["Permis"], maxPerVolunteer: 1 })
    const held = tShift("h1", DATES[1], "09:00", "12:00", { roleName: "Chauffeur", inScope: false })
    const input = tInput([s, held], [
      tPerson("on", { tags: ["Permis"], liveShiftIds: ["s1"] }),
      tPerson("nobirth", { tags: ["Permis"], birthDate: null }),
      tPerson("young", { tags: ["Permis"], birthDate: "2016-01-01" }),
      tPerson("notag"),
      tPerson("limit", { tags: ["Permis"], liveShiftIds: ["h1"] }),
      tPerson("ok", { tags: ["Permis"] }),
    ])
    expect(buildModel(input).candidates.get("s1")).toEqual(["ok"])
    expect(exclusionOf("s1", "on", input)!.code).toBe("already_on_shift")
    expect(exclusionOf("s1", "nobirth", input)!.code).toBe("birthdate_missing")
    expect(exclusionOf("s1", "young", input)!.code).toBe("min_age")
    expect(exclusionOf("s1", "notag", input)!.code).toBe("reserved")
    expect(exclusionOf("s1", "limit", input)!.code).toBe("role_limit")
  })

  it("keeps fixed missions as inputs: an overlap or a lasting workload rule excludes, an idle gap does not", () => {
    const fixed = tShift("fix", D, "08:00", "14:00", { inScope: false })
    const clash = tShift("clash", D, "13:00", "15:00")
    const long = tShift("long", D, "14:30", "20:30")
    const later = tShift("later", D, "20:00", "22:00")
    const input = tInput([fixed, clash, long, later], [tPerson("a", { fixedShiftIds: ["fix"], liveShiftIds: ["fix"] })])
    const m = buildModel(input)
    expect(m.exclusions.get("clash")!.get("a")).toEqual({ code: "overlap", withShiftId: "fix" })
    // 6 h + 6 h in one service day: over the 10 h daily cap, whatever else is added.
    expect(m.exclusions.get("long")!.get("a")!.code).toBe("workload")
    expect(m.exclusions.get("long")!.get("a")!.rules).toContain("daily")
    // 08:00-14:00 then 20:00: a 6 h wait, more than 3 h, but a mission in between could close it.
    expect(m.candidates.get("later")).toEqual(["a"])
  })

  it("excludes everywhere a person whose fixed schedule already breaks a lasting rule", () => {
    const f1 = tShift("f1", D, "06:00", "12:00", { inScope: false })
    const f2 = tShift("f2", D, "12:30", "18:30", { inScope: false })
    const open = tShift("o1", DATES[2], "09:00", "11:00")
    const input = tInput([f1, f2, open], [tPerson("a", { fixedShiftIds: ["f1", "f2"], liveShiftIds: ["f1", "f2"] })])
    expect(exclusionOf("o1", "a", input)).toEqual({ code: "workload_existing", rules: ["daily"] })
  })

  it("needs a birth date when the event protects minors", () => {
    const input = tInput([tShift("s1", D, "09:00", "12:00")], [tPerson("a", { birthDate: null })])
    input.policy = { ...input.policy!, minors: { apply: true, maxContinuousMinutes: 270, minBreakMinutes: 30, maxDailyMinutes: 480, minRestMinutes: 720 }, version: 5 }
    expect(exclusionOf("s1", "a", input)!.code).toBe("workload_birthdate")
  })

  it("opens only seats not held and shifts not over; the critical minimum includes the reserve", () => {
    const shifts = [
      tShift("past", "2031-06-30", "09:00", "12:00", { capacity: 2 }),
      tShift("full", D, "09:00", "12:00", { capacity: 2, held: 2 }),
      tShift("min", D, "13:00", "15:00", { capacity: 4, minVolunteers: 2, held: 1 }),
      tShift("res", D, "16:00", "18:00", { capacity: 3, minVolunteers: 1, reserve: 2 }),
      tShift("cap", DATES[1], "09:00", "12:00", { capacity: 3 }),
    ]
    const m = buildModel(tInput(shifts, [tPerson("a")], { availability: { timeZone: "Europe/Zurich", dates: ["2031-06-30", ...DATES] } }))
    expect(m.open.map((s) => s.id)).toEqual(["min", "res", "cap"])
    expect(Object.fromEntries(m.critical)).toEqual({ min: 1, res: 2, cap: 3 })
    expect(Object.fromEntries(m.free)).toEqual({ min: 3, res: 3, cap: 3 })
  })

  it("computes eligibility step by step, the same as all at once", async () => {
    const { startModel } = await import("../proposal-eligibility")
    const input = tInput([tShift("s1", D, "09:00", "12:00"), tShift("s2", DATES[1], "09:00", "12:00")], [tPerson("a"), tPerson("b", { answer: null })])
    const m = startModel(input)
    expect(m.ready()).toBe(false)
    const steps = [...m.prepare()].length
    expect(steps).toBe(2)
    expect(m.ready()).toBe(true)
    expect(m.candidates).toEqual(buildModel(input).candidates)
  })
})

describe("input helpers", () => {
  it("suggests 6 h per chosen date with some declared range, capped by the event maximum", () => {
    const answer = { requestId: "r", revision: 1, days: [{ date: DATES[0], ranges: [freeRange(DATES[0], "09:00", "10:00")] }, { date: DATES[1], ranges: [] }, { date: DATES[2], ranges: [freeRange(DATES[2], "18:00", "02:00")] }] }
    expect(suggestedTargetMinutes(answer, DATES, null)).toBe(12 * 60)
    expect(suggestedTargetMinutes(answer, DATES, 10 * 60)).toBe(10 * 60)
    expect(suggestedTargetMinutes(answer, [DATES[1]], null)).toBe(0)
    expect(suggestedTargetMinutes(null, DATES, null)).toBe(0)
  })

  it("uses the poste as its own rotation category, never a name match", () => {
    expect(categoryOf({ category: null, roleName: "Bar" })).toBe("poste:Bar")
    expect(categoryOf({ category: "cat-1", roleName: "Bar" })).toBe("cat-1")
  })

  it("refuses a malformed input", () => {
    const ok = tInput([tShift("s1", D, "09:00", "12:00")], [tPerson("a")])
    expect(inputProblem(ok)).toBeNull()
    expect(inputProblem({ ...ok, shifts: [...ok.shifts, ok.shifts[0]] })).toBe("duplicate_shift")
    expect(inputProblem({ ...ok, people: [tPerson("a", { fixedShiftIds: ["nope"] })] })).toBe("unknown_fixed_shift")
    expect(inputProblem({ ...ok, shifts: [tShift("s1", D, "09:00", "12:00", { reserve: 3 })] })).toBe("reserve")
    expect(inputProblem({ ...ok, budget: { evaluations: 10, stagnation: 0 } })).toBe("budget")
  })
})

describe("seeded generator", () => {
  it("gives the same sequence for the same seed, another for another seed", () => {
    const a = createPrng(42), b = createPrng(42), c = createPrng(43)
    const seq = (p: ReturnType<typeof createPrng>) => Array.from({ length: 5 }, () => p.next())
    const sa = seq(a)
    expect(seq(b)).toEqual(sa)
    expect(seq(c)).not.toEqual(sa)
    expect(sa.every((x) => x >= 0 && x < 1)).toBe(true)
    const p = createPrng(1)
    for (let i = 0; i < 100; i++) expect(p.int(3)).toBeLessThan(3)
    expect(normaliseSeed(-1)).toBe(4294967295)
    expect(normaliseSeed(Number.NaN)).toBe(0)
  })
})
