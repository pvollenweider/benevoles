// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { buildModel } from "../proposal-eligibility"
import { buildReport, stateLabel } from "../proposal-explanations"
import { preflight } from "../proposal-preflight"
import { validateAssignments } from "../proposal-proofs"
import { solveProposal } from "../proposal-solver"
import { FESTIVAL_DATES, pilotInput } from "./fixtures/proposal-pilot"

// The assignment proposal (#1172) on the representative pilot: 36 people, 11 days, 210 seats. The
// release gates of the benchmark (scripts/proposal-benchmark.ts), at a small budget to stay fast.
describe("pilot planning", () => {
  const input = pilotInput({ budget: { evaluations: 4_000, stagnation: 300 } })
  const out = solveProposal(input)
  const model = buildModel(input)
  const report = buildReport(model, out)

  it("passes the preflight as a partial proposal: three people never answered (D02)", () => {
    const r = preflight(input)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.counts).toMatchObject({ people: 36, answered: 33, seats: 210 })
  })

  it("never breaks a hard rule", () => {
    expect(validateAssignments(input, out.assignments)).toEqual([])
  })

  it("covers every minimum, every reserve and every seat", () => {
    expect(out.score.critical).toBe(0)
    expect(out.score.needs).toBe(0)
    expect(report.outcome).toBe("complete")
    expect(stateLabel(report)).toBe("Complet")
    expect(report.coverage).toMatchObject({ reserveSeats: 6, reserveFilled: 6, seats: 210, filled: 210 })
  })

  it("brings everyone with a target to it, and leaves the person without a target alone", () => {
    expect(out.score.shortfalls.every((s) => s === 0)).toBe(true)
    expect(report.people.find((p) => p.volunteerId === "p11")).toMatchObject({ targetMinutes: 0, generated: 0 })
  })

  it("keeps the licensed driver seats for licensed adults with a known birth date (C05 included)", () => {
    const drivers = out.assignments.filter((a) => a.shiftId.includes("chauffeur")).map((a) => a.volunteerId)
    expect(drivers).toHaveLength(FESTIVAL_DATES.length * 2)
    const licensed = new Set(input.people.filter((p) => p.tags.includes("Permis") && p.birthDate).map((p) => p.id))
    expect(drivers.every((id) => licensed.has(id))).toBe(true)
    // p03 wishes the driver seat but has no licence: never there.
    expect(drivers).not.toContain("p03")
    expect(drivers).not.toContain("p27")
  })

  it("never moves the fixed lead of truck 1", () => {
    expect(out.assignments.filter((a) => a.volunteerId === "p01" && a.shiftId.includes("camion1-jour"))).toEqual([])
  })

  it("is reproducible: same seed, same proposal", () => {
    expect(solveProposal(input).assignments).toEqual(out.assignments)
  })
})
