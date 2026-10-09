import { describe, it, expect } from "vitest"
import { pastEventCutoff, pastEventSummary, pastEventTotals, type PastEventObservation } from "../past-event-retention"

const row = (over: Partial<PastEventObservation>): PastEventObservation => ({ organizationId: "o", organizationName: "O", events: 0, registrations: 0, members: 0, membersOnlyOld: 0, answers: 0, invites: 0, sectorLeaders: 0, ...over })

describe("past events, observation mode (#813)", () => {
  it("cuts three calendar years back, a 29 February included", () => {
    expect(pastEventCutoff(new Date("2026-10-09T03:00:00Z")).toISOString()).toBe("2023-10-09T03:00:00.000Z")
    expect(pastEventCutoff(new Date("2028-02-29T12:00:00Z")).toISOString()).toBe("2025-03-01T12:00:00.000Z")
  })

  it("adds up the organisations, and says nothing is changed", () => {
    const totals = pastEventTotals([row({ organizationId: "a", events: 2, registrations: 40, members: 30, membersOnlyOld: 12 }), row({ organizationId: "b", events: 1, registrations: 1, members: 1 })])
    expect(totals).toMatchObject({ organizations: 2, events: 3, registrations: 41, members: 31, membersOnlyOld: 12 })
    expect(pastEventSummary(totals)).toBe("3 événements terminés depuis plus de 3 ans dans 2 organisations : 41 inscriptions de 31 membres seraient anonymisées (aucune modification pour l'instant).")
    expect(pastEventSummary(pastEventTotals([]))).toBe("Aucun événement terminé depuis plus de 3 ans.")
  })
})
