// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { droppedSentence, formatHours, formToConfig, freshSeed, parseHours, posteChoicesFrom, runStateLabel, scopeShiftIds, type PageShift, type ProposalForm } from "../proposal-view"

// The page « Proposition d'affectations » (#1172): the form turned into a run's configuration.
const shifts: PageShift[] = [
  { id: "a1", roleName: "Camion 1", date: "2031-07-07", capacity: 3, open: true },
  { id: "a2", roleName: "Camion 1", date: "2031-07-08", capacity: 3, open: true },
  { id: "b1", roleName: "Camion 2", date: "2031-07-07", capacity: 2, open: true },
  { id: "n1", roleName: "Nuit", date: "2031-07-07", capacity: 2, open: true },
  { id: "r1", roleName: "Renfort", date: "2031-07-07", capacity: 1, open: true },
  { id: "old", roleName: "Camion 1", date: "2031-07-01", capacity: 3, open: false },
]
const form = (extra: Partial<ProposalForm> = {}): ProposalForm => ({
  dates: ["2031-07-07"],
  postes: ["Camion 1", "Camion 2", "Nuit", "Renfort"],
  people: [
    { volunteerId: "p1", included: true, targetHours: "12", prefer: "Camion 1", avoid: "" },
    { volunteerId: "p2", included: true, targetHours: "7,5", prefer: "", avoid: "Nuit" },
    { volunteerId: "p3", included: false, targetHours: "", prefer: "", avoid: "" },
  ],
  posteChoices: [
    { roleName: "Camion 1", category: "Camions", night: false, reserve: 0 },
    { roleName: "Camion 2", category: " camions ", night: false, reserve: 0 },
    { roleName: "Nuit", category: "", night: true, reserve: 0 },
    { roleName: "Renfort", category: "", night: false, reserve: 1 },
  ],
  maxConsecutiveDays: "2",
  maxNightAddOns: "2",
  seed: "1172",
  ...extra,
})

describe("form to configuration", () => {
  it("resolves the scope, categories over the whole event, night add-ons, the reserve capped by capacity, targets and wishes", () => {
    const r = formToConfig(form(), shifts)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.config.scope).toEqual({ shiftIds: ["a1", "b1", "n1", "r1"], volunteerIds: ["p1", "p2"] })
    // « Camions » and « camions » are one category, with every shift of both postes, in scope or not.
    expect(r.config.categories).toEqual([{ key: "c1", name: "Camions", shiftIds: ["a1", "a2", "b1", "old"] }])
    expect(r.config.nightShiftIds).toEqual(["n1"])
    expect(r.config.reserve).toEqual([{ shiftId: "r1", count: 1 }])
    expect(r.config.rotation).toEqual({ maxConsecutiveDays: 2, maxNightAddOns: 2 })
    expect(r.config.preferences).toEqual([{ volunteerId: "p1", prefer: ["Camion 1"], avoid: [] }, { volunteerId: "p2", prefer: [], avoid: ["Nuit"] }])
    expect(r.config.seed).toBe(1172)
    expect(r.targets).toEqual([{ volunteerId: "p1", targetMinutes: 720 }, { volunteerId: "p2", targetMinutes: 450 }])
  })

  it("lists every problem with the field to fix", () => {
    const r = formToConfig(form({ dates: [], seed: "x", maxConsecutiveDays: "0", people: [{ volunteerId: "p1", included: true, targetHours: "beaucoup", prefer: "Nuit", avoid: "Nuit" }] }), shifts)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.problems.map((p) => p.field)).toEqual(["proposal-dates", "target-p1", "avoid-p1", "proposal-consecutive", "proposal-seed"])
    expect(formToConfig(form({ people: [] }), shifts)).toMatchObject({ ok: false, problems: [{ field: "proposal-people" }] })
    expect(formToConfig(form({ dates: ["2031-07-01"] }), shifts)).toMatchObject({ ok: false, problems: [{ field: "proposal-postes", message: expect.stringContaining("Aucun créneau") }] })
  })

  it("names the person in each message, and checks the reserve against the poste's capacity", () => {
    const r = formToConfig(form({ people: [{ volunteerId: "p1", included: true, targetHours: "?", prefer: "", avoid: "" }], posteChoices: [{ roleName: "Renfort", category: "", night: false, reserve: 2 }, { roleName: "Nuit", category: "", night: false, reserve: 0, reserveText: "deux" }] }), shifts, (id) => (id === "p1" ? "Léa Favre" : ""))
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.problems).toEqual([
      { field: "target-p1", message: "Léa Favre : indiquez un objectif en heures (0 pour aucun objectif), par exemple 12 ou 7,5." },
      { field: "reserve-0", message: "Renfort : indiquez une réserve entre 0 et 1." },
      { field: "reserve-1", message: "Nuit : indiquez une réserve entre 0 et 2." },
    ])
  })

  it("allows no rotation limit (empty fields)", () => {
    const r = formToConfig(form({ maxConsecutiveDays: "", maxNightAddOns: "" }), shifts)
    expect(r.ok && r.config.rotation).toEqual({ maxConsecutiveDays: null, maxNightAddOns: null })
  })

  it("prefills poste choices from a previous run", () => {
    const r = formToConfig(form(), shifts)
    if (!r.ok) throw new Error("form")
    expect(posteChoicesFrom(r.config, shifts, ["Camion 1", "Camion 2", "Nuit", "Renfort", "Nouveau"])).toEqual([
      { roleName: "Camion 1", category: "Camions", night: false, reserve: 0 },
      { roleName: "Camion 2", category: "Camions", night: false, reserve: 0 },
      { roleName: "Nuit", category: "", night: true, reserve: 0 },
      { roleName: "Renfort", category: "", night: false, reserve: 1 },
      { roleName: "Nouveau", category: "", night: false, reserve: 0 },
    ])
    expect(posteChoicesFrom(null, shifts, ["Nuit"])).toEqual([{ roleName: "Nuit", category: "", night: false, reserve: 0 }])
  })
})

describe("helpers", () => {
  it("reads and writes hours in French", () => {
    expect(parseHours("7,5")).toBe(450)
    expect(parseHours(" 12 ")).toBe(720)
    expect(parseHours("0")).toBe(0)
    expect(parseHours("-1")).toBeNull()
    expect(parseHours("")).toBeNull()
    expect(parseHours("800")).toBeNull()
    expect(formatHours(450)).toBe("7,5")
    expect(formatHours(360)).toBe("6")
    expect(formatHours(20)).toBe("0,33")
  })

  it("keeps only open shifts in the scope", () => {
    expect(scopeShiftIds(shifts, ["2031-07-01", "2031-07-08"], ["Camion 1"])).toEqual(["a2"])
  })

  it("names the states and the drops", () => {
    expect(runStateLabel({ status: "queued", outcome: null })).toBe("En attente")
    expect(runStateLabel({ status: "running", outcome: null })).toBe("Calcul en cours")
    expect(runStateLabel({ status: "interrupted", outcome: "complete" })).toBe("Recherche interrompue")
    expect(runStateLabel({ status: "finished", outcome: "complete" })).toBe("Complet")
    expect(runStateLabel({ status: "finished", outcome: "incomplete" })).toBe("Incomplet")
    expect(runStateLabel({ status: "finished", outcome: "proven_impossible" })).toBe("Impossible démontré")
    expect(runStateLabel({ status: "failed", outcome: null })).toBe("Échec du calcul")
    expect(droppedSentence([])).toBeNull()
    expect(droppedSentence([{ reason: "availability" }, { reason: "capacity" }, { reason: "availability" }])).toBe("3 affectations écartées à l'écriture, les données ayant changé pendant le calcul : disponibilités changées (2), plus de place (1).")
    expect(freshSeed(() => 0.5)).toBe(500000)
  })
})
