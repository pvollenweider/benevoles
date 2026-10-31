// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { anotherSeed, canonicalConfig, changedParts, choicesKey, DEFAULT_PROPOSAL_SEED, configProblem, configShiftIds, inputParts, proposalConfigSchema, scrubPersonFromRun, staleSentence, stableStringify, type ProposalConfig } from "../proposal-config"
import { tInput, tPerson, tShift, DATES } from "./fixtures/proposal-tiny"

// The assignment proposal (#1172): a run's choices, their canonical form, fingerprints and scrubbing.
const base = (extra: Partial<ProposalConfig> = {}): ProposalConfig => proposalConfigSchema.parse({
  scope: { shiftIds: ["s2", "s1"], volunteerIds: ["b", "a"] },
  rotation: { maxConsecutiveDays: 2, maxNightAddOns: 2 },
  seed: 1172,
  ...extra,
})

describe("configuration", () => {
  it("fills the optional lists and bounds every number", () => {
    const c = base()
    expect(c).toMatchObject({ reserve: [], nightShiftIds: [], categories: [], preferences: [] })
    expect(proposalConfigSchema.safeParse({ ...c, seed: -1 }).success).toBe(false)
    // The seed is optional: the page no longer sends one (owner decision 2026-10-31).
    const { seed: _seed, ...withoutSeed } = c
    void _seed
    expect(proposalConfigSchema.safeParse(withoutSeed).success).toBe(true)
    expect(proposalConfigSchema.safeParse({ ...c, budget: { evaluations: 10 } }).success).toBe(false)
    expect(proposalConfigSchema.safeParse({ ...c, categories: [{ key: "Bad Key", name: "X", shiftIds: ["s1"] }] }).success).toBe(false)
  })

  it("refuses duplicates, a reserve outside the scope, a shift in two categories and contradictory wishes", () => {
    expect(configProblem(base())).toBeNull()
    expect(configProblem(base({ scope: { shiftIds: ["s1", "s1"], volunteerIds: ["a"] } }))).toMatch(/deux fois/)
    expect(configProblem(base({ reserve: [{ shiftId: "s9", count: 1 }] }))).toMatch(/pas dans la sélection/)
    expect(configProblem(base({ categories: [{ key: "a", name: "Scènes", shiftIds: ["s1"] }, { key: "b", name: "Parking", shiftIds: ["s1"] }] }))).toMatch(/deux catégories/)
    expect(configProblem(base({ categories: [{ key: "a", name: "Scènes", shiftIds: ["s1"] }, { key: "b", name: "scènes", shiftIds: ["s2"] }] }))).toMatch(/même nom/)
    expect(configProblem(base({ preferences: [{ volunteerId: "z", prefer: ["Bar"], avoid: [] }] }))).toMatch(/pas dans la sélection/)
    expect(configProblem(base({ preferences: [{ volunteerId: "a", prefer: ["Bar"], avoid: ["Bar"] }] }))).toMatch(/à la fois/)
  })

  it("names every shift it uses, and has one canonical form whatever the order", () => {
    const c = base({ nightShiftIds: ["n1"], categories: [{ key: "x", name: "X", shiftIds: ["o1"] }] })
    expect(configShiftIds(c)).toEqual(["n1", "o1", "s1", "s2"])
    const shuffled = base({ scope: { shiftIds: ["s1", "s2"], volunteerIds: ["a", "b"] }, nightShiftIds: ["n1"], categories: [{ key: "x", name: "X", shiftIds: ["o1"] }] })
    expect(canonicalConfig(shuffled)).toBe(canonicalConfig(c))
    expect(canonicalConfig(base({ seed: 1 }))).not.toBe(canonicalConfig(base()))
    expect(canonicalConfig(base({ seed: undefined }))).not.toBe(canonicalConfig(base()))
    expect(stableStringify({ b: 1, a: { d: new Date("2031-01-01T00:00:00Z"), c: [2, 1] } })).toBe('{"a":{"c":[2,1],"d":"2031-01-01T00:00:00.000Z"},"b":1}')
  })
})

describe("internal seed (owner decision 2026-10-31, Codex)", () => {
  it("gives a first proposal a fixed seed, never one from ids, time or chance", () => {
    expect(DEFAULT_PROPOSAL_SEED).toBe(2026)
  })

  it("compares choices without the seed, the budget at its effective value", () => {
    expect(choicesKey(base({ seed: 1 }))).toBe(choicesKey(base({ seed: 99 })))
    expect(choicesKey(base({ seed: undefined }))).toBe(choicesKey(base()))
    expect(choicesKey(base({ budget: { evaluations: 20_000 } }))).toBe(choicesKey(base()))
    expect(choicesKey(base({ budget: { evaluations: 500 } }))).not.toBe(choicesKey(base()))
    expect(choicesKey(base({ rotation: { maxConsecutiveDays: 3, maxNightAddOns: 2 } }))).not.toBe(choicesKey(base()))
    expect(choicesKey(base({ scope: { shiftIds: ["s1"], volunteerIds: ["a", "b"] } }))).not.toBe(choicesKey(base()))
  })

  it("takes the next seed of the sequence not yet tried for these choices, deterministically", () => {
    expect(anotherSeed([])).toBe(2027)
    expect(anotherSeed([2026])).toBe(2027)
    expect(anotherSeed([2026, 2027])).toBe(2028)
    // Viewing the first run again and asking once more never redoes a seed already tried.
    expect(anotherSeed([2026, 2027, 2028, 2030])).toBe(2029)
    expect(anotherSeed(new Set([2027]))).toBe(2028)
    expect(anotherSeed([2026, 2027])).toBe(anotherSeed([2027, 2026]))
  })
})

describe("fingerprints", () => {
  const input = tInput([tShift("s1", DATES[0], "09:00", "12:00")], [tPerson("a", { targetMinutes: 60 })])

  it("ignore the reference time, the seed and the budget, and say what changed", () => {
    const before = inputParts(input)
    expect(inputParts({ ...input, now: "2031-07-09T00:00:00.000Z", seed: 9, budget: { evaluations: 1, stagnation: 1 } })).toEqual(before)
    const moreHeld = inputParts({ ...input, shifts: [{ ...input.shifts[0], held: 1 }] })
    expect(changedParts(before, moreHeld)).toEqual(["commitments"])
    const target = inputParts({ ...input, people: [{ ...input.people[0], targetMinutes: 120 }] })
    expect(changedParts(before, target)).toEqual(["targets"])
    const later = inputParts({ ...input, shifts: [{ ...input.shifts[0], endTime: "13:00" }] })
    expect(changedParts(before, later)).toEqual(["shifts"])
    const noAnswer = inputParts({ ...input, people: [{ ...input.people[0], answer: null }] })
    expect(changedParts(before, noAnswer)).toEqual(["availability"])
    expect(staleSentence([])).toBeNull()
    expect(staleSentence(["availability", "targets"])).toBe("Proposition périmée : des disponibilités ont changé, des objectifs d'heures ont changé. Relancez une proposition pour en tenir compte ; la publication vérifie de toute façon chaque règle.")
  })
})

describe("scrubbing a person from a run", () => {
  it("removes them everywhere and keeps the others", () => {
    const run = {
      configuration: { scope: { shiftIds: ["s1"], volunteerIds: ["a", "b"] }, preferences: [{ volunteerId: "a", prefer: ["Bar"], avoid: [] }] },
      snapshot: { people: [{ id: "a" }, { id: "b" }] },
      result: { assignments: [{ shiftId: "s1", volunteerId: "a" }, { shiftId: "s1", volunteerId: "b" }], report: { assignments: [{ volunteerId: "a" }], people: [{ volunteerId: "a" }, { volunteerId: "b" }], gaps: [{ shiftId: "s2", missing: 1 }], onlyOne: true } },
      written: { created: [{ draftId: "d1", volunteerId: "a" }], dropped: [{ volunteerId: "b", reason: "capacity" }] },
      progress: { evaluations: 10 },
    }
    const out = scrubPersonFromRun(run, "a")
    expect(JSON.stringify(out)).not.toContain('"a"')
    expect(out.result).toMatchObject({ assignments: [{ volunteerId: "b" }], report: { gaps: [{ shiftId: "s2", missing: 1 }], people: [{ volunteerId: "b" }] } })
    expect(out.written).toMatchObject({ dropped: [{ volunteerId: "b" }] })
    // The proof that no other assignment exists held on the whole input only.
    expect((out.result as { report: object }).report).not.toHaveProperty("onlyOne")
    expect(scrubPersonFromRun({ configuration: null, snapshot: null, result: null, written: null, progress: null }, "a")).toEqual({ configuration: null, snapshot: null, result: null, written: null, progress: null })
  })
})
