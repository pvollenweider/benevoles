// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { buildModel } from "../proposal-eligibility"
import { buildReport, gapSentence, stateLabel } from "../proposal-explanations"
import { compareScores, decidingLevel, personStats, type Score } from "../proposal-objectives"
import { preflight, PREFLIGHT_MESSAGES } from "../proposal-preflight"
import { certificates, validateAssignments } from "../proposal-proofs"
import { runProposalSearch, solveProposal, type ProposalAssignment } from "../proposal-solver"
import { exhaustiveBest, tInput, tPerson, tShift, DATES } from "./fixtures/proposal-tiny"

// The assignment proposal (#1172): the search, its goals and the framing scenarios it answers.
const [D1, D2, D3] = DATES
const H = 60
const onShift = (as: ProposalAssignment[], shiftId: string) => as.filter((a) => a.shiftId === shiftId).map((a) => a.volunteerId).sort()
const ofPerson = (as: ProposalAssignment[], personId: string) => as.filter((a) => a.volunteerId === personId).map((a) => a.shiftId).sort()

const zero: Score = { critical: 0, needs: 0, shortfalls: [], zeroTargetMinutes: 0, excess: 0, consecutive: 0, nights: 0, concentration: 0, avoided: 0, preferred: 0 }

describe("lexicographic goals", () => {
  it("never lets a lower goal make up for a higher one", () => {
    const worse = { ...zero, critical: 1 }
    const better = { ...zero, needs: 50, shortfalls: [1_000_000], consecutive: 9, avoided: 9 }
    expect(compareScores(better, worse)).toBeLessThan(0)
    expect(decidingLevel(better, worse)).toBe(1)
    expect(decidingLevel({ ...zero, needs: 1 }, zero)).toBe(2)
    expect(decidingLevel({ ...zero, shortfalls: [5] }, { ...zero, shortfalls: [4] })).toBe(3)
    expect(decidingLevel({ ...zero, concentration: 5 }, zero)).toBe(4)
    expect(decidingLevel({ ...zero, preferred: 1 }, zero)).toBe(5)
    expect(compareScores({ ...zero, preferred: 2 }, { ...zero, preferred: 1 })).toBeLessThan(0)
    // The worst-off person first: [50 %, 0] is worse than [40 %, 40 %].
    expect(compareScores({ ...zero, shortfalls: [400_000, 400_000] }, { ...zero, shortfalls: [500_000, 0] })).toBeLessThan(0)
  })

  it("counts rotation runs, night add-ons and concentration per person", () => {
    const shifts = [D1, D2, D3].flatMap((d, i) => [
      tShift(`x${i}`, d, "09:00", "13:00", { category: "X" }),
      tShift(`n${i}`, d, "23:00", "02:00", { category: "N", night: true }),
    ])
    const m = buildModel(tInput(shifts, [tPerson("a")], { rotation: { maxConsecutiveDays: 2, maxNightAddOns: 1 } }))
    const s = personStats(m, "a", ["x0", "x1", "x2", "n0", "n2"])
    expect(s.consecutive).toBe(1) // X three days in a row, one more than 2
    expect(s.nights).toBe(1) // two night add-ons, one more than 1
    expect(s.concentration).toBe(9 + 4)
  })
})

describe("the search against an exhaustive oracle (tiny cases)", () => {
  const cases: [string, ReturnType<typeof tInput>][] = [
    ["two targets on three shifts (C04)", tInput(
      [tShift("a", D1, "09:00", "13:00"), tShift("b", D2, "09:00", "13:00"), tShift("c", D3, "09:00", "13:00")],
      [tPerson("big", { targetMinutes: 8 * H }), tPerson("small", { targetMinutes: 4 * H })],
    )],
    ["rotation over three days", tInput(
      [D1, D2, D3].flatMap((d, i) => [tShift(`x${i}`, d, "09:00", "13:00", { category: "X", roleName: "X" }), tShift(`y${i}`, d, "15:00", "19:00", { category: "Y", roleName: "Y" })]),
      [tPerson("p", { targetMinutes: 12 * H }), tPerson("q", { targetMinutes: 12 * H })],
    )],
    ["a reserve and an ordinary shift at the same time", tInput(
      [tShift("renfort", D1, "12:00", "18:00", { capacity: 2, minVolunteers: 1, reserve: 1, roleName: "Renfort" }), tShift("bar", D1, "12:00", "18:00", { capacity: 3, minVolunteers: 1, roleName: "Bar" })],
      [tPerson("p1", { targetMinutes: 6 * H }), tPerson("p2", { targetMinutes: 6 * H }), tPerson("p3", { targetMinutes: 6 * H })],
    )],
    ["preferences after everything else", tInput(
      [tShift("bar", D1, "09:00", "13:00", { roleName: "Bar" }), tShift("parking", D1, "09:00", "13:00", { roleName: "Parking" })],
      [tPerson("p", { targetMinutes: 4 * H, prefer: ["Parking"] }), tPerson("q", { targetMinutes: 4 * H, avoid: ["Parking"] })],
    )],
  ]
  for (const [name, input] of cases) {
    it(`reaches the best score: ${name}`, () => {
      const oracle = exhaustiveBest(input)
      const out = solveProposal(input)
      expect(validateAssignments(input, out.assignments)).toEqual([])
      expect(compareScores(out.score, oracle.score)).toBe(0)
    })
  }

  it("C04: fairness against each person's own target, not equal hours", () => {
    const out = solveProposal(cases[0][1])
    expect(ofPerson(out.assignments, "big")).toHaveLength(2)
    expect(ofPerson(out.assignments, "small")).toHaveLength(1)
  })

  it("R09: a requested reserve is kept, not filled with leftovers", () => {
    const out = solveProposal(cases[2][1])
    expect(onShift(out.assignments, "renfort")).toHaveLength(1)
    expect(onShift(out.assignments, "bar")).toHaveLength(2)
  })

  it("level 5: preferences decide when nothing above does", () => {
    const out = solveProposal(cases[3][1])
    expect(onShift(out.assignments, "parking")).toEqual(["p"])
    expect(onShift(out.assignments, "bar")).toEqual(["q"])
  })
})

describe("framing scenarios", () => {
  it("C05: a preference never lifts a hard rule (the wished seat needs a tag the person lacks)", () => {
    const input = tInput([tShift("drive", D1, "09:00", "13:00", { roleName: "Chauffeur", reservedTags: ["Permis"] })], [
      tPerson("wishes", { prefer: ["Chauffeur"], targetMinutes: 4 * H }),
      tPerson("licensed", { tags: ["Permis"], avoid: ["Chauffeur"] }),
    ])
    const out = solveProposal(input)
    expect(onShift(out.assignments, "drive")).toEqual(["licensed"])
  })

  it("D01: nobody available refuses the computation with an action", () => {
    const r = preflight(tInput([tShift("s", D1, "09:00", "12:00")], [tPerson("a", { answer: null })]))
    expect(r).toMatchObject({ ok: false, code: "no_availability" })
    expect(PREFLIGHT_MESSAGES.no_availability).toContain("Recueillez")
  })

  it("D02: with part of the team answered, a partial proposal is possible and said so", () => {
    const r = preflight(tInput([tShift("s", D1, "09:00", "12:00")], [tPerson("a"), tPerson("b", { answer: null })]))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.partial).toBe(true)
      expect(r.notice).toContain("1 personne sur 2")
      expect(r.counts).toMatchObject({ people: 2, answered: 1, eligiblePeople: 1, seats: 1 })
    }
  })

  it("P14: no generation without a complete workload protection", () => {
    expect(preflight(tInput([tShift("s", D1, "09:00", "12:00")], [tPerson("a")], { policy: null }))).toMatchObject({ ok: false, code: "policy_missing" })
  })

  it("refuses when nothing is to fill, nobody is selected, or nobody passes the rules", () => {
    expect(preflight(tInput([tShift("s", D1, "09:00", "12:00", { held: 1 })], [tPerson("a")]))).toMatchObject({ ok: false, code: "no_needs" })
    expect(preflight(tInput([tShift("s", D1, "09:00", "12:00")], [tPerson("a", { inScope: false })]))).toMatchObject({ ok: false, code: "no_people" })
    expect(preflight(tInput([tShift("s", D1, "09:00", "12:00", { reservedTags: ["Permis"] })], [tPerson("a")]))).toMatchObject({ ok: false, code: "nobody_eligible" })
  })

  it("D03: not enough resources gives an explicit incomplete result, never a false proof", () => {
    // Each 6 h shift alone fits; both would make 12 h in one service day (10 h cap).
    const input = tInput([tShift("am", D1, "06:00", "12:00"), tShift("pm", D1, "13:00", "19:00")], [tPerson("a", { targetMinutes: 12 * H })])
    const out = solveProposal(input)
    expect(out.assignments).toHaveLength(1)
    const report = buildReport(buildModel(input), out)
    expect(report.certificates).toEqual([])
    expect(report.outcome).toBe("incomplete")
    expect(stateLabel(report)).toBe("Couverture partielle")
    expect(gapSentence(report.gaps[0])).toContain("la durée maximale par journée de service")
  })

  it("« impossible démontré » only with a certificate: a seat nobody can take, simultaneous needs above the people", () => {
    const lone = tInput([tShift("drive", D1, "09:00", "12:00", { reservedTags: ["Permis"] }), tShift("bar", D1, "14:00", "16:00")], [tPerson("a")])
    const r1 = buildReport(buildModel(lone), solveProposal(lone))
    expect(r1.outcome).toBe("proven_impossible")
    expect(r1.certificates).toEqual([{ kind: "shift", level: "minimum", shiftId: "drive", need: 1, eligible: 0 }])
    expect(stateLabel(r1)).toBe("Couverture complète impossible")

    const crowd = tInput([tShift("a", D1, "09:00", "12:00", { capacity: 2 }), tShift("b", D1, "10:00", "11:00", { capacity: 2 })], [tPerson("p"), tPerson("q"), tPerson("r")])
    expect(certificates(buildModel(crowd))).toEqual([{ kind: "simultaneous", level: "minimum", shiftIds: ["a", "b"], need: 4, eligible: 3 }])
  })

  it("R09: a reserve that cannot be kept is announced", () => {
    const input = tInput([tShift("renfort", D1, "12:00", "18:00", { capacity: 1, reserve: 1, roleName: "Renfort" }), tShift("bar", D1, "12:00", "18:00", { capacity: 1, roleName: "Bar" })], [tPerson("p", { targetMinutes: 6 * H })])
    const report = buildReport(buildModel(input), solveProposal(input))
    expect(report.coverage.reserveSeats).toBe(1)
    expect(report.outcome).toBe("proven_impossible")
    const gap = report.gaps.find((g) => g.reserveMissing > 0)
    if (gap) expect(gapSentence(gap)).toContain("de la réserve")
    else expect(report.coverage.reserveFilled).toBe(1)
  })

  it("never moves a fixed assignment and respects the places already held", () => {
    const fixed = tShift("lead", D1, "09:00", "15:00", { capacity: 3, held: 1 })
    const input = tInput([fixed], [tPerson("lead", { fixedShiftIds: ["lead"], liveShiftIds: ["lead"] }), tPerson("a"), tPerson("b"), tPerson("c")])
    const out = solveProposal(input)
    expect(onShift(out.assignments, "lead")).toHaveLength(2)
    expect(ofPerson(out.assignments, "lead")).toEqual([])
    expect(validateAssignments(input, out.assignments)).toEqual([])
  })

  it("bundles a mission that closes an idle gap the first one alone would leave", () => {
    // Fixed 08:00-10:00; 16:00-18:00 alone leaves 6 h of waiting (limit 3 h); with 12:30-14:30 in between it is fine.
    const shifts = [
      tShift("fix", D1, "08:00", "10:00", { inScope: false }),
      tShift("late", D1, "16:00", "18:00"),
      tShift("mid", D1, "12:30", "14:30", { capacity: 2 }),
    ]
    const input = tInput(shifts, [tPerson("p", { fixedShiftIds: ["fix"], liveShiftIds: ["fix"], targetMinutes: 6 * H }), tPerson("q", { answer: tPerson("q").answer, targetMinutes: 2 * H })])
    // q can only take the middle shift (not available at 16:00).
    input.people[1].answer = { requestId: "rq", revision: 1, days: [{ date: D1, ranges: [{ ...input.people[0].answer!.days[0].ranges[0], startTime: "12:00", endTime: "15:00", startsAt: new Date("2031-07-10T10:00:00Z"), endsAt: new Date("2031-07-10T13:00:00Z") }] }] }
    const out = solveProposal(input)
    expect(ofPerson(out.assignments, "p")).toEqual(["late", "mid"])
    expect(validateAssignments(input, out.assignments)).toEqual([])
  })
})

describe("reproducibility and interruption", () => {
  const input = tInput(
    [D1, D2, D3].flatMap((d, i) => [tShift(`m${i}`, d, "08:00", "12:00", { capacity: 2 }), tShift(`e${i}`, d, "17:00", "22:00", { capacity: 2 })]),
    ["a", "b", "c", "d"].map((id, i) => tPerson(id, { targetMinutes: (8 + i * 2) * H })),
    { budget: { evaluations: 2_000, stagnation: 50 } },
  )

  it("the same input, seed and budget give the same proposal, whatever the slicing", () => {
    const a = solveProposal(input, { slice: 1 })
    const b = solveProposal(input, { slice: 500 })
    expect(b.assignments).toEqual(a.assignments)
    expect(b.score).toEqual(a.score)
    expect(a).toMatchObject({ execution: "finished", solverVersion: "greedy-ls-1", prngVersion: "mulberry32-1", seed: 7 })
  })

  it("a deadline stops the search: « recherche interrompue », with a valid best proposal", () => {
    let t = 0
    const out = solveProposal(input, { clock: () => (t += 1_000), deadlineMs: 3_000, slice: 1 })
    expect(out).toMatchObject({ execution: "interrupted", stopReason: "deadline" })
    expect(validateAssignments(input, out.assignments)).toEqual([])
    expect(stateLabel({ outcome: "complete", execution: out.execution })).toBe("Calcul arrêté avant la fin")
  })

  it("D08: a cancellation stops it too, identifiably, and nothing else happens", async () => {
    let calls = 0
    const out = await runProposalSearch(input, { shouldStop: () => ++calls > 1, sliceMs: 0 })
    expect(out).toMatchObject({ execution: "interrupted", stopReason: "cancelled" })
    expect(validateAssignments(input, out.assignments)).toEqual([])
  })

  it("runs in slices that yield, and finishes like the synchronous run", async () => {
    const progress: number[] = []
    const out = await runProposalSearch(input, { sliceMs: 1, onProgress: (p) => { progress.push(p.iterations) } })
    expect(out.assignments).toEqual(solveProposal(input).assignments)
  })
})

describe("the independent validator", () => {
  it("catches every broken hard rule", () => {
    const shifts = [tShift("s1", D1, "09:00", "12:00", { reservedTags: ["Permis"] }), tShift("s2", D1, "11:00", "13:00"), tShift("s3", D1, "13:00", "23:30")]
    const input = tInput(shifts, [tPerson("a"), tPerson("b", { answer: null })])
    const codes = validateAssignments(input, [
      { shiftId: "s1", volunteerId: "a" }, { shiftId: "s2", volunteerId: "a" }, { shiftId: "s2", volunteerId: "b" }, { shiftId: "s3", volunteerId: "a" },
    ]).map((v) => v.code)
    expect(codes).toEqual(expect.arrayContaining(["reserved", "availability", "capacity", "overlap", "workload"]))
    expect(validateAssignments({ ...input, policy: null }, [])).toEqual([{ code: "policy_missing" }])
  })
})
