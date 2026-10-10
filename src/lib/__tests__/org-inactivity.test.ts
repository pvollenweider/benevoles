import { describe, it, expect } from "vitest"
import { assessInactivity, inactivityMode, inactivitySince, inactivityStatusText, isMeaningfulWrite, isPostponeMonths, postponedUntil, type InactivityFacts } from "../org-inactivity"

const facts = (over: Partial<InactivityFacts> = {}): InactivityFacts => ({
  lastActivityAt: new Date("2025-01-15T10:00:00Z"), lastRetentionConfirmedAt: null, hasUpcomingEvent: false, everUsed: true, suspended: false, active: true, postponedUntil: null, exempt: false, ...over,
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

  it("waits for the operator's postponement, and never runs for an exempt organisation (#811)", () => {
    const late = new Date("2026-08-20T00:00:00Z")
    const until = new Date("2027-02-20T00:00:00Z")
    expect(assessInactivity(facts({ postponedUntil: until }), late)).toMatchObject({ state: "active", firstEmailAt: until })
    // An old postponement, earlier than the schedule, changes nothing.
    expect(assessInactivity(facts({ postponedUntil: new Date("2025-03-01T00:00:00Z") }), late)).toMatchObject({ state: "due", step: "second" })
    expect(assessInactivity(facts({ exempt: true }), late)).toEqual({ state: "excluded", reason: "exempt" })
    // A suspension still comes first: the operator's exclusion does not hide it.
    expect(assessInactivity(facts({ exempt: true, suspended: true }), late)).toEqual({ state: "excluded", reason: "suspended" })
  })

  it("postpones by 3, 6 or 12 months from today only", () => {
    expect(postponedUntil(new Date("2026-10-10T08:00:00Z"), 6)).toEqual(new Date("2027-04-10T08:00:00Z"))
    expect([3, 6, 12].every(isPostponeMonths)).toBe(true)
    expect([0, 1, 24, "6", null].some(isPostponeMonths)).toBe(false)
  })

  it("says where an organisation stands, in words", () => {
    const now = new Date("2026-08-20T00:00:00Z")
    const day = (d: Date) => d.toISOString().slice(0, 10)
    const text = (over: Partial<InactivityFacts>, mode: "off" | "report" = "report") => {
      const f = facts(over)
      return inactivityStatusText({ lastActivityAt: f.lastActivityAt, postponedUntil: f.postponedUntil, assessment: assessInactivity(f, now) }, mode, now, day)
    }
    expect(text({})).toBe("Dernière activité : le 2025-01-15. Premier email dû le 2026-07-15 ; étape atteinte : 2e rappel. Mode observation : rien n'est envoyé.")
    expect(text({ postponedUntil: new Date("2027-02-20T00:00:00Z") })).toBe("Dernière activité : le 2025-01-15. Reporté jusqu'au 2027-02-20. Premier email « Souhaitez-vous conserver votre espace ? » prévu le 2027-02-20.")
    expect(text({ exempt: true })).toBe("Dernière activité : le 2025-01-15. Elle ne sera jamais désactivée automatiquement.")
    expect(text({ hasUpcomingEvent: true })).toContain("Un événement est à venir ou en cours")
    expect(text({ lastActivityAt: null }, "off")).toBe("Dernière activité : jamais mesurée. La vérification est désactivée (ORG_INACTIVITY=off).")
  })
})
