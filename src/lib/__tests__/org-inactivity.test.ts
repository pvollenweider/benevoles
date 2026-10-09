import { describe, it, expect } from "vitest"
import { assessInactivity, inactivityMode, inactivitySince, isMeaningfulWrite, type InactivityFacts } from "../org-inactivity"

const facts = (over: Partial<InactivityFacts> = {}): InactivityFacts => ({
  lastActivityAt: new Date("2025-01-15T10:00:00Z"), lastRetentionConfirmedAt: null, hasUpcomingEvent: false, everUsed: true, suspended: false, active: true, ...over,
})

describe("periodic check of inactive organisations (#811)", () => {
  it("runs in report mode unless switched off", () => {
    expect(inactivityMode({})).toBe("report")
    expect(inactivityMode({ ORG_INACTIVITY: "on" })).toBe("report")
    expect(inactivityMode({ ORG_INACTIVITY: " OFF " })).toBe("off")
  })

  it("asks first 18 months after the last activity or confirmation, whichever is later", () => {
    expect(assessInactivity(facts(), new Date("2026-07-14T00:00:00Z"))).toMatchObject({ state: "active", firstEmailAt: new Date("2026-07-15T10:00:00Z") })
    expect(inactivitySince(facts({ lastRetentionConfirmedAt: new Date("2025-06-01T00:00:00Z") }), new Date())).toEqual(new Date("2025-06-01T00:00:00Z"))
  })

  it("walks the steps: email, reminders, deactivation, erasure, with the next date", () => {
    const at = (day: string) => assessInactivity(facts(), new Date(day))
    expect(at("2026-07-16T00:00:00Z")).toMatchObject({ state: "due", step: "first", nextStep: { key: "second", at: new Date("2026-08-14T10:00:00Z") } })
    expect(at("2026-08-20T00:00:00Z")).toMatchObject({ step: "second" })
    expect(at("2026-09-20T00:00:00Z")).toMatchObject({ step: "last" })
    expect(at("2026-10-01T00:00:00Z")).toMatchObject({ step: "deactivate", nextStep: { key: "erase" } })
    expect(at("2027-01-01T00:00:00Z")).toMatchObject({ step: "erase", nextStep: null })
  })

  it("never deals with a suspended or deactivated space, nor one with an upcoming event", () => {
    const late = new Date("2028-01-01T00:00:00Z")
    expect(assessInactivity(facts({ suspended: true }), late)).toEqual({ state: "excluded", reason: "suspended" })
    expect(assessInactivity(facts({ active: false }), late)).toEqual({ state: "excluded", reason: "deactivated" })
    expect(assessInactivity(facts({ hasUpcomingEvent: true }), late)).toEqual({ state: "excluded", reason: "upcoming-event" })
  })

  it("counts the organisation's writes, never its logs or reads", () => {
    expect(isMeaningfulWrite("event", "update")).toBe(true)
    expect(isMeaningfulWrite("registration", "create")).toBe(true)
    expect(isMeaningfulWrite("eventLog", "create")).toBe(false)
    expect(isMeaningfulWrite("orgLog", "create")).toBe(false)
    expect(isMeaningfulWrite("event", "findMany")).toBe(false)
  })
})
