import { describe, it, expect } from "vitest"
import {
  addConflictMessage,
  charterAcceptanceLabel,
  cancelAnnouncement, heldAnnouncement, undoneAnnouncement,
  filterRegistrations,
  fmtHour,
  leaderAnnouncement,
  leaderDesignatedAnnouncement,
  leaderRemovedAnnouncement,
  leaderRoleOptions,
  listCountAnnouncement,
  manualAddAnnouncement,
  overlappingShiftIds,
  registrationsSummary,
  resendAnnouncement,
  shiftsOfEmail,
  type ShiftRef,
} from "../registrations-list"

const shift = (id: string, over: Partial<ShiftRef> = {}): ShiftRef => ({
  id, roleName: "Bar", label: "Bar", date: "2030-06-01", startTime: "10:00", endTime: "12:00", capacity: 5, registrationCount: 0, ...over,
})
const reg = (id: string, s: ShiftRef, v: { id: string; first: string; last: string; email: string | null }) => ({
  id, shift: s, volunteer: { id: v.id, firstName: v.first, lastName: v.last, email: v.email },
})

const bar = shift("s-bar")
const accueil = shift("s-acc", { roleName: "Accueil", label: "Accueil", startTime: "11:00", endTime: "13:00" })
const late = shift("s-late", { startTime: "14:00", endTime: "16:00" })
const alice = { id: "v1", first: "Alice", last: "Martin", email: "alice@x.ch" }
const bob = { id: "v2", first: "Bob", last: "Durand", email: null }
const regs = [reg("r1", bar, alice), reg("r2", accueil, alice), reg("r3", late, bob)]

describe("filterRegistrations", () => {
  it("by name or email, case-insensitive", () => {
    expect(filterRegistrations(regs, { search: "MARTIN", role: "", shiftId: "" }).map((r) => r.id)).toEqual(["r1", "r2"])
    expect(filterRegistrations(regs, { search: "alice@", role: "", shiftId: "" })).toHaveLength(2)
  })

  it("ignores accents (#390)", () => {
    const zoe = { ...regs[0], id: "z", volunteer: { ...regs[0].volunteer, firstName: "Zoé", lastName: "Roy" } }
    expect(filterRegistrations([zoe], { search: "zoe", role: "", shiftId: "" }).map((r) => r.id)).toEqual(["z"])
    expect(filterRegistrations([zoe], { search: "Zoé", role: "", shiftId: "" })).toHaveLength(1)
  })

  it("by role and by shift, combined with search", () => {
    expect(filterRegistrations(regs, { search: "", role: "Accueil", shiftId: "" }).map((r) => r.id)).toEqual(["r2"])
    expect(filterRegistrations(regs, { search: "bob", role: "Bar", shiftId: "s-late" }).map((r) => r.id)).toEqual(["r3"])
    expect(filterRegistrations(regs, { search: "", role: "", shiftId: "" })).toHaveLength(3)
  })
})

describe("adding someone by hand", () => {
  it("finds the shifts of an email, normalized", () => {
    expect(shiftsOfEmail(regs, " ALICE@x.ch ")?.map((s) => s.id)).toEqual(["s-bar", "s-acc"])
    expect(shiftsOfEmail(regs, "nobody@x.ch")).toBeUndefined()
    expect(shiftsOfEmail(regs, "")).toBeUndefined()
  })

  it("explains a duplicate or an overlap", () => {
    const held = [bar]
    expect(addConflictMessage(bar, held)).toContain("déjà inscrit à ce créneau")
    expect(addConflictMessage(accueil, held)).toContain("plage horaire")
    expect(addConflictMessage(late, held)).toBeNull()
    expect(addConflictMessage(null, held)).toBeNull()
  })

  it("marks overlapping shifts, not the ones already held", () => {
    expect(overlappingShiftIds([bar, accueil, late], [bar])).toEqual(new Set(["s-acc"]))
    expect(overlappingShiftIds([bar, accueil], undefined)).toEqual(new Set())
  })
})

describe("leaders and announcements", () => {
  it("roles a volunteer can lead", () => {
    expect(leaderRoleOptions(regs, "v1")).toEqual(["Bar", "Accueil"])
  })

  it("formats hours", () => {
    expect(fmtHour("10:00")).toBe("10h")
    expect(fmtHour("09:30")).toBe("9h30")
  })

  it("bulk messages, singular and plural", () => {
    expect(cancelAnnouncement(1, 0)).toBe("1 bénévole retiré.")
    expect(cancelAnnouncement(2, 1)).toBe("2 bénévoles retirés, 1 échec.")
    expect(leaderAnnouncement(2, 0, 1)).toBe("2 responsables ajoutés. 1 ignoré (pas d'email).")
    expect(leaderAnnouncement(0, 3, 0)).toBe("3 échecs.")
    expect(resendAnnouncement(1, 0)).toBe("Lien renvoyé à 1 bénévole.")
    expect(resendAnnouncement(3, 2)).toBe("Lien renvoyé à 3 bénévoles, 2 échecs.")
  })

  // #555, #574: a registration added by hand is announced, with its shift spelt out, without
  // « ·e » or the middle dot that screen readers read aloud.
  it("manual addition, with or without a label distinct from the role", () => {
    expect(manualAddAnnouncement("Chloé Roy", bar)).toBe("Inscription de Chloé Roy ajoutée : Bar, sam. 1 juin, de 10h à 12h.")
    const soir = manualAddAnnouncement("Chloé Roy", shift("s", { label: "Soir", startTime: "18:30", endTime: "20:00" }))
    expect(soir).toBe("Inscription de Chloé Roy ajoutée : Bar, Soir, sam. 1 juin, de 18h30 à 20h.")
    expect(soir).not.toMatch(/·/)
  })

  it("sector leader designation, the same for everyone", () => {
    const text = leaderDesignatedAnnouncement("Chloé Roy", "Bar")
    expect(text).toBe("Chloé Roy est maintenant responsable de « Bar », invitation envoyée par email.")
    expect(text).not.toMatch(/·/)
  })

  it("sector leader removal, without « ·e »", () => {
    const text = leaderRemovedAnnouncement("Chloé Roy", "Bar")
    expect(text).toBe("Chloé Roy n'est plus responsable de « Bar ».")
    expect(text).not.toMatch(/·/)
  })

  it("rows left by the filters, singular and plural", () => {
    expect(listCountAnnouncement(0)).toBe("0 inscription affichée")
    expect(listCountAnnouncement(1)).toBe("1 inscription affichée")
    expect(listCountAnnouncement(2)).toBe("2 inscriptions affichées")
  })
})

describe("undo window wording (#379)", () => {
  it("says how long is left and what cancelling keeps", () => {
    expect(heldAnnouncement(3, 10)).toBe("3 bénévoles seront retirés dans 10 secondes. « Annuler le retrait » pour les garder.")
    expect(heldAnnouncement(1, 4)).toBe("1 bénévole sera retiré dans 4 secondes. « Annuler le retrait » pour le garder.")
    expect(undoneAnnouncement(2)).toBe("Retrait annulé : les 2 bénévoles restent inscrits, aucun email envoyé.")
    expect(undoneAnnouncement(1)).toBe("Retrait annulé : le bénévole reste inscrit, aucun email envoyé.")
  })
})

// #582: the counts under the page heading, with real plurals and commas (no « (s) », no « · »).
describe("registrationsSummary", () => {
  it("active registrations alone, singular, plural and zero", () => {
    expect(registrationsSummary({ active: 0, waiting: 0, requested: 0 })).toBe("Aucune inscription active")
    expect(registrationsSummary({ active: 1, waiting: 0, requested: 0 })).toBe("1 inscription active")
    expect(registrationsSummary({ active: 3, waiting: 0, requested: 0 })).toBe("3 inscriptions actives")
  })

  it("adds the waiting list and the requests only when there are any", () => {
    expect(registrationsSummary({ active: 3, waiting: 2, requested: 1 })).toBe("3 inscriptions actives, 2 en liste d'attente, 1 demande à traiter")
    expect(registrationsSummary({ active: 1, waiting: 0, requested: 2 })).toBe("1 inscription active, 2 demandes à traiter")
    expect(registrationsSummary({ active: 0, waiting: 1, requested: 0 })).toBe("Aucune inscription active, 1 en liste d'attente")
  })

  it("has no middle dot nor bracketed plural", () => {
    expect(registrationsSummary({ active: 2, waiting: 2, requested: 2 })).not.toMatch(/[·()]/)
  })
})

describe("charterAcceptanceLabel (#569)", () => {
  const acceptedAt = new Date("2026-10-05T12:32:00Z")

  it("words the date and hour in the organization's time zone, and says the text is current", () => {
    expect(charterAcceptanceLabel({ acceptedAt, hash: "abc", currentHash: "abc", timeZone: "Europe/Zurich" }))
      .toBe("Convention acceptée le 5 octobre 2026 à 14h32 (version en vigueur)")
  })

  it("does not depend on the viewer's zone: the same instant reads differently in another organization's zone", () => {
    expect(charterAcceptanceLabel({ acceptedAt, hash: "abc", currentHash: "abc", timeZone: "America/New_York" }))
      .toBe("Convention acceptée le 5 octobre 2026 à 8h32 (version en vigueur)")
  })

  it("tells an older text apart by the start of its hash", () => {
    expect(charterAcceptanceLabel({ acceptedAt, hash: "3fa9c1e2deadbeef", currentHash: "abc", timeZone: "Europe/Zurich" }))
      .toBe("Convention acceptée le 5 octobre 2026 à 14h32 (version précédente, empreinte 3fa9c1e2)")
  })

  it("crosses midnight with the zone, not the server", () => {
    expect(charterAcceptanceLabel({ acceptedAt: new Date("2026-10-05T22:30:00Z"), hash: null, currentHash: "abc", timeZone: "Europe/Zurich" }))
      .toBe("Convention acceptée le 6 octobre 2026 à 0h30")
  })
})
