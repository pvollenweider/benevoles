// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { buildModel } from "../proposal-eligibility"
import { assignmentSentence, buildReport, gapSentence, personSentence, stateLabel, stateSentence, type GapReport } from "../proposal-explanations"
import { solveProposal } from "../proposal-solver"
import { localDateTimeToUtc } from "../time-zone"
import { localParts } from "../workload-policy"
import { tInput, tPerson, tShift, DATES } from "./fixtures/proposal-tiny"

// The assignment proposal (#1172): the reasons stored with a run and the sentences shown.
const [D1, D2] = DATES
const H = 60

describe("report", () => {
  const input = tInput(
    [
      tShift("renfort", D1, "12:00", "18:00", { capacity: 2, minVolunteers: 1, reserve: 1, roleName: "Renfort", category: "renfort" }),
      tShift("bar", D2, "09:00", "13:00", { roleName: "Bar", category: "bar" }),
      tShift("drive", D2, "14:00", "18:00", { roleName: "Chauffeur", reservedTags: ["Permis"] }),
    ],
    [tPerson("p", { targetMinutes: 10 * H, prefer: ["Bar"] }), tPerson("q", { targetMinutes: 6 * H })],
  )
  const report = buildReport(buildModel(input), solveProposal(input))

  it("explains each assignment with the goal it served", () => {
    const renfort = report.assignments.filter((a) => a.shiftId === "renfort")
    expect(renfort.map((a) => a.seat)).toEqual(renfort.length === 2 ? ["reserve", "need"] : ["reserve"])
    const bar = report.assignments.find((a) => a.shiftId === "bar")!
    expect(bar).toMatchObject({ volunteerId: "p", preferred: true, otherCategoryThanDayBefore: true })
    expect(assignmentSentence(bar)).toContain("Poste souhaité.")
    expect(assignmentSentence(bar)).toContain("Autre activité que la veille.")
    expect(assignmentSentence(renfort[0])).toContain("Place de la réserve demandée.")
  })

  it("explains each empty seat, and proves it when nobody can take it", () => {
    expect(report.gaps).toHaveLength(1)
    const gap = report.gaps[0]
    expect(gap).toMatchObject({ shiftId: "drive", missing: 1, missingCritical: 1, eligible: 0, excluded: { reserved: 2 }, proven: true })
    expect(gapSentence(gap)).toBe("1 place reste sans personne, dont 1 place du minimum. Parmi les personnes choisies, 2 n'ont pas l'étiquette requise. Impossible à pourvoir : il n'y a pas assez de personnes pouvant prendre ce créneau.")
    expect(report.outcome).toBe("proven_impossible")
    expect(report.coverage).toMatchObject({ reserveSeats: 1, reserveFilled: 1 })
  })

  it("gives each person's target against what is planned", () => {
    const p = report.people.find((x) => x.volunteerId === "p")!
    expect(p.targetMinutes).toBe(10 * H)
    expect(personSentence({ ...p, plannedMinutes: 8 * H, gapMinutes: -2 * H })).toBe("8 h prévues pour un objectif de 10 h : 2 h sous l'objectif.")
    expect(personSentence({ ...p, targetMinutes: 0, plannedMinutes: 4 * H, gapMinutes: 4 * H })).toBe("4 h prévues, sans objectif d'heures.")
  })
})

describe("words", () => {
  it("says nobody's availability covers the shift when that is the only reason", () => {
    const g: GapReport = { shiftId: "s", missing: 2, missingCritical: 0, reserveMissing: 0, eligible: 0, excluded: { no_answer: 1, availability_partial: 3 }, blocked: {}, workloadRules: {}, proven: true }
    expect(gapSentence(g)).toBe("2 places restent sans personne. Aucune disponibilité ne couvre entièrement ce créneau. Impossible à pourvoir : il n'y a pas assez de personnes pouvant prendre ce créneau.")
  })

  it("names what blocks the available people here, and a search that stopped first", () => {
    const g: GapReport = { shiftId: "s", missing: 1, missingCritical: 0, reserveMissing: 1, eligible: 4, excluded: {}, blocked: { overlap: 1, workload: 2, addable: 1 }, workloadRules: { daily: 2, rest: 1 }, proven: false }
    expect(gapSentence(g)).toBe("1 place reste sans personne et 1 place de la réserve. Parmi les 4 personnes disponibles sur tout le créneau, 1 a une autre mission proposée à la même heure, 2 dépasseraient la durée maximale par journée de service, le repos entre deux journées de service. Aucune affectation supplémentaire trouvée dans le temps de calcul.")
  })

  it("labels the four states and never claims an optimum", () => {
    expect(stateLabel({ outcome: "complete", execution: "finished" })).toBe("Toutes les places couvertes")
    expect(stateLabel({ outcome: "incomplete", execution: "finished" })).toBe("Couverture partielle")
    expect(stateLabel({ outcome: "proven_impossible", execution: "finished" })).toBe("Couverture complète impossible")
    expect(stateLabel({ outcome: "complete", execution: "interrupted" })).toBe("Calcul arrêté avant la fin")
    for (const outcome of ["complete", "incomplete", "proven_impossible"] as const) {
      expect(stateSentence({ outcome, execution: "finished", stopReason: "budget" })).not.toMatch(/optimal|meilleure possible/i)
    }
    expect(stateSentence({ outcome: "complete", execution: "interrupted", stopReason: "cancelled" })).toContain("Vous avez arrêté la recherche")
  })
})

describe("memoised time zone arithmetic (the search's speed-up)", () => {
  it("gives the same instants and local parts as before, across a daylight saving change, called again and again", () => {
    // 2031-03-30: clocks go forward in Zurich at 02:00; 2031-10-26: back at 03:00.
    const cases: [string, string, string][] = [["2031-03-30", "01:30", "2031-03-30T00:30:00.000Z"], ["2031-03-30", "03:30", "2031-03-30T01:30:00.000Z"], ["2031-10-26", "02:30", "2031-10-26T01:30:00.000Z"], ["2031-10-26", "04:00", "2031-10-26T03:00:00.000Z"]]
    for (let round = 0; round < 3; round++) {
      for (const [date, hhmm, iso] of cases) expect(localDateTimeToUtc(new Date(`${date}T00:00:00Z`), hhmm, "Europe/Zurich").toISOString()).toBe(iso)
    }
    const first = localParts(Date.parse("2031-10-26T01:30:00.000Z"), "Europe/Zurich")
    first.minutes = -1 // a caller changing its copy never changes the memo
    expect(localParts(Date.parse("2031-10-26T01:30:00.000Z"), "Europe/Zurich")).toEqual({ date: "2031-10-26", minutes: 2 * 60 + 30 })
    expect(() => localDateTimeToUtc(new Date("2031-01-01T00:00:00Z"), "10:00", "Not/AZone")).toThrow()
  })
})
