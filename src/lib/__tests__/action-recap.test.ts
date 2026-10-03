import { describe, it, expect } from "vitest"
import { acceptRequestRecap, bulkCancelRecap, dayLabel, bulkLeaderRecap, bulkResendRecap, deactivateMemberRecap, broadcastRecap, deleteMilestoneRecap, deleteOrgRecap, deletePageRecap, toggleOrgRecap, deleteRoleRecap, deleteShiftRecap, shiftWhen, logLinkFor, remindInvitedRecap, removeLeaderRecap } from "../action-recap"

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
      "Vous aurez 10 secondes pour annuler : rien n'est envoyé ni enregistré avant. Quitter la page valide le retrait.",
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

  it("milestone and page deletion", () => {
    expect(deleteMilestoneRecap("Fermer les inscriptions")).toMatchObject({ title: "Supprimer le jalon « Fermer les inscriptions » ?", danger: true })
    expect(deletePageRecap("Accès").title).toBe("Supprimer la page « Accès » ?")
  })

  it("organisation toggle, deletion and broadcast", () => {
    expect(toggleOrgRecap("Asso", true)).toMatchObject({ confirmLabel: "Désactiver", danger: true })
    expect(toggleOrgRecap("Asso", false)).toMatchObject({ confirmLabel: "Réactiver", danger: false })
    expect(deleteOrgRecap({ name: "Asso", events: 2, volunteers: 1, admins: 3 }).lines[0]).toBe("Toutes ses données sont effacées : 2 événements, 1 membre, 3 administrateurs, inscriptions et journaux.")
    expect(broadcastRecap(1).title).toBe("Envoyer cette communication à 1 administrateur ?")
  })

  // #587: in words, without the en dash read « tiret »; minutes and past midnight kept.
  it("formats the moment of a shift in words", () => {
    expect(shiftWhen("2026-07-04", "18:00", "23:00")).toBe("Samedi 4 juillet, de 18h à 23h")
    expect(shiftWhen("2026-07-04", "10:30", "12:15")).toBe("Samedi 4 juillet, de 10h30 à 12h15")
    expect(shiftWhen("2026-07-04", "22:00", "02:00")).toBe("Samedi 4 juillet, de 22h à 2h, jusqu'au lendemain")
    expect(shiftWhen("2026-07-04", "18:00", "23:00")).not.toMatch(/[–·]/)
  })

  it("shift and role deletion", () => {
    const s = deleteShiftRecap({ name: "Bar, Bar soir", when: "Samedi 4 juillet, de 18h à 23h", registered: 2 })
    expect(s.title).toBe("Supprimer le créneau « Bar, Bar soir » ?")
    expect(s.lines[0]).toBe("Samedi 4 juillet, de 18h à 23h.")
    expect(s.lines[1]).toBe("2 bénévoles inscrits : leurs inscriptions sont annulées et ils sont prévenus par email.")
    expect(deleteShiftRecap({ name: "Bar", when: "x", registered: 0 }).lines[1]).toBe("Personne n'est inscrit : aucun email.")
    expect(deleteRoleRecap({ role: "Bar", shifts: 3, registered: 1 }).lines[1]).toBe("1 bénévole inscrit : son inscription est annulée et il est prévenu par email.")
  })

  it("announces the undo window on a bulk removal", () => {
    expect(bulkCancelRecap({ people: 2, withEmail: 2, waitlisted: 0 }).lines.at(-1)).toMatch(/10 secondes pour annuler/)
  })

  it("links the log filtered from the action's day", () => {
    expect(logLinkFor("e1", new Date("2026-07-04T23:30:00Z"), "Europe/Zurich")).toBe("/admin/events/e1/log?since=2026-07-05")
    expect(logLinkFor("e1", new Date("2026-07-04T10:00:00Z"), "UTC")).toBe("/admin/events/e1/log?since=2026-07-04")
  })

  it("still exports dayLabel for its callers", () => {
    expect(dayLabel("2026-07-04")).toBe("Samedi 4 juillet")
  })

  // #582: no « inscrit·e », read « inscrit point e » by screen readers.
  it("accepting a request, without « ·e »", () => {
    const r = acceptRequestRecap({ name: "Chloé Roy", shift: "Bar, Soir", hasEmail: true })
    expect(r.lines[0]).toBe("La demande de Chloé Roy sur « Bar, Soir » devient une inscription confirmée.")
    expect(r.lines.join(" ")).not.toMatch(/·/)
  })
})
