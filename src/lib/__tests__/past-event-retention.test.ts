import { describe, it, expect } from "vitest"
import { PAST_EVENT_NOTICE_DAYS, pastEventCutoff, pastEventRetentionMode, pastEventStep, pastEventSummary, pastEventTotals, type PastEventObservation } from "../past-event-retention"

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

describe("past events, enforcement (#813, phase 2)", () => {
  it("only enforces with PAST_EVENT_RETENTION=enforce", () => {
    expect(pastEventRetentionMode({})).toBe("observe")
    expect(pastEventRetentionMode({ PAST_EVENT_RETENTION: "observe" })).toBe("observe")
    expect(pastEventRetentionMode({ PAST_EVENT_RETENTION: "on" })).toBe("observe")
    expect(pastEventRetentionMode({ PAST_EVENT_RETENTION: " Enforce " })).toBe("enforce")
  })

  it("says what is left to do once enforced", () => {
    const totals = pastEventTotals([row({ events: 1, registrations: 2, members: 2 })])
    expect(pastEventSummary(totals, "enforce")).toBe("1 événement terminé depuis plus de 3 ans dans 1 organisation : 2 inscriptions de 2 membres restent à anonymiser (préavis de 30 jours, puis un lot par mois).")
  })

  const day = (iso: string) => new Date(iso)

  it("does nothing for an organisation with no event concerned", () => {
    expect(pastEventStep({ concernedEvents: 0, noticeAt: null, batchAt: null }, day("2026-10-10T02:00:00Z"))).toEqual({ kind: "none" })
    expect(pastEventStep({ concernedEvents: 0, noticeAt: day("2026-01-01T02:00:00Z"), batchAt: null }, day("2026-10-10T02:00:00Z"))).toEqual({ kind: "none" })
  })

  it("sends the notice first, the first batch 30 days later", () => {
    const now = day("2026-10-10T02:00:00Z")
    expect(PAST_EVENT_NOTICE_DAYS).toBe(30)
    expect(pastEventStep({ concernedEvents: 3, noticeAt: null, batchAt: null }, now)).toEqual({ kind: "notice", firstBatchOn: day("2026-11-09T02:00:00Z") })
  })

  it("waits the 30 days after the notice, then runs the first batch", () => {
    const noticeAt = day("2026-10-10T02:00:00Z")
    expect(pastEventStep({ concernedEvents: 3, noticeAt, batchAt: null }, day("2026-11-09T01:59:59Z"))).toEqual({ kind: "wait", until: day("2026-11-09T02:00:00Z") })
    expect(pastEventStep({ concernedEvents: 3, noticeAt, batchAt: null }, day("2026-11-09T02:00:00Z"))).toEqual({ kind: "batch" })
  })

  it("then runs at most one batch per calendar month, with no new notice", () => {
    const noticeAt = day("2026-10-10T02:00:00Z")
    const batchAt = day("2026-11-09T02:00:00Z")
    expect(pastEventStep({ concernedEvents: 1, noticeAt, batchAt }, day("2026-11-30T02:00:00Z"))).toEqual({ kind: "wait", until: day("2026-12-01T00:00:00Z") })
    expect(pastEventStep({ concernedEvents: 1, noticeAt, batchAt }, day("2026-12-01T02:00:00Z"))).toEqual({ kind: "batch" })
    // Across a year end.
    expect(pastEventStep({ concernedEvents: 1, noticeAt, batchAt: day("2026-12-15T02:00:00Z") }, day("2027-01-01T02:00:00Z"))).toEqual({ kind: "batch" })
  })
})
