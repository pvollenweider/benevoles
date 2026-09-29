import { describe, it, expect } from "vitest"
import { canPublish, reviewChecks, wizardHrefs, WIZARD_STEPS, type ReviewFacts } from "../event-wizard"

const facts: ReviewFacts = {
  id: "evt-1", title: "Fête", startDate: "2026-07-04", endDate: "2026-07-05", location: "Place du village",
  confirmationMessage: "Merci !", publicInstructions: null, publicStatus: "draft",
  shiftCount: 6, roleCount: 2, capacity: 14, leaderCount: 0,
}

describe("event wizard", () => {
  it("has three steps and knows where each one lives", () => {
    expect(WIZARD_STEPS.map((s) => s.label)).toEqual(["Informations", "Postes et créneaux", "Vérification et publication"])
    expect(wizardHrefs(null)[1]).toBe("/admin/events/new")
    expect(wizardHrefs("e")[2]).toBe("/admin/events/e/shifts?wizard=1")
    expect(wizardHrefs("e")[3]).toBe("/admin/events/e/review")
    expect(wizardHrefs("e").exit).toBe("/admin/events/e")
  })

  it("lists the required checks first and words them from the facts", () => {
    const checks = reviewChecks(facts)
    expect(checks.map((c) => [c.id, c.ok, c.required])).toEqual([
      ["dates", true, true], ["shifts", true, true], ["location", true, false], ["confirmation", true, false], ["instructions", false, false], ["leaders", false, false],
    ])
    expect(checks[0].label).toBe("Dates : 2 jours à partir du 4 juillet 2026")
    expect(checks[1].label).toBe("6 créneaux, 2 postes, 14 places")
    expect(checks[2].label).toBe("Lieu : Place du village")
    expect(canPublish(checks)).toBe(true)
  })

  it("blocks publication without shifts, not without optional details", () => {
    const checks = reviewChecks({ ...facts, shiftCount: 0, roleCount: 0, capacity: 0, location: null, confirmationMessage: null })
    expect(checks[1].label).toBe("Aucun créneau")
    expect(checks[1].hint).toMatch(/rien à choisir/)
    expect(canPublish(checks)).toBe(false)
    expect(canPublish(reviewChecks({ ...facts, location: null, confirmationMessage: null }))).toBe(true)
  })
})
