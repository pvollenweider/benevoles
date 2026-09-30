import { describe, it, expect } from "vitest"
import { bulkCancelRecap, bulkLeaderRecap, bulkResendRecap, logLinkFor, remindInvitedRecap } from "../action-recap"

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

  it("links the log filtered from the action's day", () => {
    expect(logLinkFor("e1", new Date("2026-07-04T23:30:00Z"), "Europe/Zurich")).toBe("/admin/events/e1/log?since=2026-07-05")
    expect(logLinkFor("e1", new Date("2026-07-04T10:00:00Z"), "UTC")).toBe("/admin/events/e1/log?since=2026-07-04")
  })
})
