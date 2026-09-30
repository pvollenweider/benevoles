import { describe, it, expect } from "vitest"
import { WITHDRAWABLE_STATUSES, planVolunteerWithdraw, withdrawCopy } from "../volunteer-withdraw"

describe("planVolunteerWithdraw", () => {
  it("lets every live status be withdrawn", () => {
    expect([...WITHDRAWABLE_STATUSES]).toEqual(["active", "waiting", "offered", "requested"])
    for (const s of WITHDRAWABLE_STATUSES) expect(planVolunteerWithdraw(s)).not.toBeNull()
  })

  it("releases a spot for a place, a request and an offered spot", () => {
    expect(planVolunteerWithdraw("active")).toEqual({ releasesSpot: true })
    expect(planVolunteerWithdraw("requested")).toEqual({ releasesSpot: true })
    expect(planVolunteerWithdraw("offered")).toEqual({ releasesSpot: true })
  })

  it("releases nothing when leaving the waitlist", () => {
    expect(planVolunteerWithdraw("waiting")).toEqual({ releasesSpot: false })
  })

  it("refuses statuses that are no longer live", () => {
    for (const s of ["cancelled", "refused", "expired", ""]) expect(planVolunteerWithdraw(s)).toBeNull()
  })
})

describe("withdrawCopy", () => {
  it("says « Quitter la liste d'attente » for a waitlist entry", () => {
    const c = withdrawCopy("waiting", "Bar")
    expect(c.button).toBe("Quitter la liste d'attente")
    expect(c.ariaLabel).toBe("Quitter la liste d'attente du créneau Bar")
    expect(c.confirmTitle).toBe("Quitter la liste d'attente ?")
    expect(c.confirmButton).toBe("Oui, quitter")
  })

  it("says the offered spot goes to the next person", () => {
    const c = withdrawCopy("offered", "Bar")
    expect(c.button).toBe("Refuser la place")
    expect(c.confirmBefore + "Bar" + c.confirmAfter).toContain("passe à la personne suivante")
  })

  it("keeps « Annuler » for a confirmed place, and names the shift", () => {
    const c = withdrawCopy("active", "Bar")
    expect(c.button).toBe("Annuler")
    expect(c.ariaLabel).toBe("Annuler le créneau Bar")
    expect(c.confirmBefore + "Bar" + c.confirmAfter).toBe("Tu veux annuler le créneau Bar ?")
    expect(c.confirmButton).toBe("Oui, annuler")
  })

  it("offers to withdraw a pending request", () => {
    expect(withdrawCopy("requested", "Navette").button).toBe("Retirer ma demande")
  })
})
