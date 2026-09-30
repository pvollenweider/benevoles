import { describe, it, expect } from "vitest"
import { bulkCancelRecap, bulkLeaderRecap, bulkResendRecap, deactivateMemberRecap, deleteRoleRecap, deleteShiftRecap, shiftWhen, logLinkFor, remindInvitedRecap, removeLeaderRecap } from "../action-recap"

// Confirmation before sensitive actions (#379).
describe("action recaps", () => {
  it("cancel: people, emails, waitlist consequence, logged", () => {
    const r = bulkCancelRecap({ people: 3, withEmail: 2, waitlisted: 1 })
    expect(r.title).toBe("Retirer 3 bénévoles de leur créneau ?")
    expect(r.lines).toEqual([
      "3 inscriptions annulées. Les places sont libérées immédiatement.",
      "2 emails d'annulation envoyés aux personnes concernées.",
      "1 place libérée sera proposée à la liste d'attente.",
      "L'action est journalisée : vous la retrouverez dans le journal de l'événement.",
    ])
    expect(r.danger).toBe(true)
    expect(bulkCancelRecap({ people: 1, withEmail: 0, waitlisted: 0 }).lines[1]).toBe("Aucun email : personne n'a d'adresse.")
  })

  it("leaders, resend, remind", () => {
    expect(bulkLeaderRecap({ people: 2, withoutEmail: 1 }).lines).toContain("1 personne ignorée : pas d'adresse email.")
    expect(bulkLeaderRecap({ people: 1, withoutEmail: 0 }).lines).toHaveLength(3)
    expect(bulkResendRecap({ people: 4 }).title).toBe("Renvoyer leur lien personnel à 4 bénévoles ?")
    expect(remindInvitedRecap({ people: 1 }).lines[0]).toBe("1 email de relance envoyé.")
  })

  it("member deactivation and leader removal", () => {
    expect(deactivateMemberRecap("Zoé Roy")).toMatchObject({ title: "Désactiver Zoé Roy ?", danger: true, confirmLabel: "Désactiver" })
    expect(removeLeaderRecap("Léa", "Bar").title).toBe("Retirer Léa des responsables de « Bar » ?")
  })

  it("formats the moment of a shift", () => {
    expect(shiftWhen("2026-07-04", "18:00", "23:00")).toBe("Samedi 4 juillet, 18:00–23:00")
  })

  it("shift and role deletion", () => {
    const s = deleteShiftRecap({ name: "Bar · Bar soir", when: "Samedi 4 juillet, 18:00–23:00", registered: 2 })
    expect(s.title).toBe("Supprimer le créneau « Bar · Bar soir » ?")
    expect(s.lines[1]).toBe("2 bénévoles inscrits : leurs inscriptions sont annulées et ils sont prévenus par email.")
    expect(deleteShiftRecap({ name: "Bar", when: "x", registered: 0 }).lines[1]).toBe("Personne n'est inscrit : aucun email.")
    expect(deleteRoleRecap({ role: "Bar", shifts: 3, registered: 1 }).lines[1]).toBe("1 bénévole inscrit : son inscription est annulée et il est prévenu par email.")
  })

  it("links the log filtered from the action's day", () => {
    expect(logLinkFor("e1", new Date("2026-07-04T23:30:00Z"), "Europe/Zurich")).toBe("/admin/events/e1/log?since=2026-07-05")
    expect(logLinkFor("e1", new Date("2026-07-04T10:00:00Z"), "UTC")).toBe("/admin/events/e1/log?since=2026-07-04")
  })
})
