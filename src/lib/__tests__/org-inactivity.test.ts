import { describe, it, expect } from "vitest"
import { assessInactivity, erasureDate, erasureDue, ERASURE_AFTER_DEACTIVATION_DAYS, INACTIVITY_STEPS, inactivityMode, inactivitySince, inactivityStatusText, isMeaningfulWrite, isPostponeMonths, postponedUntil, type InactivityFacts } from "../org-inactivity"

const facts = (over: Partial<InactivityFacts> = {}): InactivityFacts => ({
  lastActivityAt: new Date("2025-01-15T10:00:00Z"), lastRetentionConfirmedAt: null, hasUpcomingEvent: false, everUsed: true, suspended: false, active: true, postponedUntil: null, exempt: false, ...over,
})

describe("periodic check of inactive organisations (#811)", () => {
  it("runs in report mode unless switched off", () => {
    expect(inactivityMode({})).toBe("report")
    expect(inactivityMode({ ORG_INACTIVITY: "on" })).toBe("on")
    expect(inactivityMode({ ORG_INACTIVITY: "yes" })).toBe("report")
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

  it("says how far the procedure went, and when a space was deactivated", () => {
    const now = new Date("2027-07-01T00:00:00Z")
    const day = (d: Date) => d.toISOString().slice(0, 10)
    const procedure = {
      due: true,
      noticeAt: new Date("2027-06-01T02:00:00Z"),
      steps: [
        { step: "first" as const, queuedAt: new Date("2027-06-01T02:00:00Z"), confirmedAt: new Date("2027-06-01T02:00:05Z"), recipients: 1, plannedAt: new Date("2027-08-14T22:00:00Z") },
        { step: "second" as const, queuedAt: new Date("2027-07-01T02:00:00Z"), confirmedAt: null, recipients: 1, plannedAt: new Date("2027-08-14T22:00:00Z") },
      ],
      waiting: 1,
      plannedAt: new Date("2027-08-14T22:00:00Z"),
      timeZone: "Europe/Zurich",
    }
    const at = new Date("2027-07-01T03:00:00Z")
    // Dates in the organisation's zone: the planned date is midnight in Zurich.
    const zurich = (d: Date) => d.toLocaleDateString("fr-CA", { timeZone: "Europe/Zurich" })
    expect(inactivityStatusText({ lastActivityAt: facts().lastActivityAt, postponedUntil: null, assessment: assessInactivity(facts(), at), procedure }, "on", at, zurich))
      .toBe("Dernière activité : le 2025-01-15. 1er message « Souhaitez-vous conserver votre espace ? » : envoyé le 2027-06-01 ; 2e rappel : en file d'attente depuis le 2027-07-01. Sans réponse d'ici le 2027-08-14 inclus, désactivation au plus tôt le 2027-08-15.")
    // Blocked: said as such, with what to do; in report mode the procedure is paused.
    const blocked = { ...procedure, waiting: 0 }
    expect(inactivityStatusText({ lastActivityAt: facts().lastActivityAt, postponedUntil: null, assessment: assessInactivity(facts(), at), procedure: blocked }, "report", at, zurich))
      .toBe("Dernière activité : le 2025-01-15. Procédure bloquée : aucune copie acceptée par le serveur d'envoi (envois échoués ou annulés). Pas de désactivation tant que c'est le cas (une acceptation tardive fait reprendre la procédure) : à traiter manuellement (vérifier les adresses des administrateurs, les contacter autrement, reporter la vérification ou l'exclure). 1er message « Souhaitez-vous conserver votre espace ? » : envoyé le 2027-06-01 ; 2e rappel : bloqué (en file d'attente depuis le 2027-07-01). Désactivation au plus tôt le 2027-08-15, une fois débloquée. Mode observation : la procédure est en pause, rien de plus n'est envoyé ni désactivé.")
    // An older procedure (no steps): never resumes on its own, so no promise of a resumption.
    const legacy = { ...procedure, steps: [], waiting: 0, plannedAt: null }
    const legacyText = inactivityStatusText({ lastActivityAt: facts().lastActivityAt, postponedUntil: null, assessment: assessInactivity(facts(), at), procedure: legacy }, "on", at, zurich)
    expect(legacyText).toBe("Dernière activité : le 2025-01-15. Procédure bloquée : commencée avant le suivi des envois, aucun de ses messages n'est prouvé. Jamais de désactivation automatique pour elle : à traiter manuellement (vérifier les adresses des administrateurs, les contacter autrement, reporter la vérification ou l'exclure). Elle ne pourrait de toute façon pas être désactivée avant le 2027-08-16.")
    expect(inactivityStatusText({ lastActivityAt: null, postponedUntil: null, assessment: { state: "excluded", reason: "deactivated" }, deactivatedAt: new Date("2027-08-15T03:00:00Z") }, "on", now, day))
      .toBe("Dernière activité : jamais mesurée. Désactivée faute de réponse le 2027-08-15 ; ses administrateurs peuvent la réactiver depuis la page de connexion.")
  })
})

// #811 rollout 3, observation only: when a space deactivated for inactivity would be erased.
describe("erasure date after an automatic deactivation", () => {
  it("is 90 days after the deactivation, the gap between the « deactivate » and « erase » steps", () => {
    const steps = Object.fromEntries(INACTIVITY_STEPS.map((s) => [s.key, s.days]))
    expect(ERASURE_AFTER_DEACTIVATION_DAYS).toBe(steps.erase - steps.deactivate)
    expect(erasureDate(new Date("2026-10-01T00:00:00Z")).toISOString()).toBe("2026-12-30T00:00:00.000Z")
  })

  it("is due only once that date has come", () => {
    const deactivated = new Date("2026-10-01T00:00:00Z")
    expect(erasureDue(deactivated, new Date("2026-12-29T23:59:59Z"))).toBe(false)
    expect(erasureDue(deactivated, new Date("2026-12-30T00:00:00Z"))).toBe(true)
  })
})
