import { describe, it, expect } from "vitest"
import { offerDeadline, WAITLIST_OFFER_HOURS, WAITLIST_SHORT, WAITLIST_STEPS, waitlistLabel } from "../waitlist-copy"

// The waitlist explained (#374): five points, always the same, and the 24 h everywhere.
describe("waitlist copy", () => {
  it("covers the five points the volunteer needs, with the offer duration", () => {
    expect(WAITLIST_STEPS).toHaveLength(5)
    expect(WAITLIST_STEPS[0]).toContain("pas encore confirmée")
    expect(WAITLIST_STEPS[1]).toContain("ordre")
    expect(WAITLIST_STEPS[2]).toContain(`${WAITLIST_OFFER_HOURS} heures`)
    expect(WAITLIST_STEPS[3]).toContain("clique sur le lien")
    expect(WAITLIST_STEPS[4]).toContain("personne suivante")
    expect(WAITLIST_STEPS[4]).toContain(`${WAITLIST_OFFER_HOURS} heures`)
    expect(WAITLIST_SHORT).toContain("24 heures")
  })

  it("labels a registration's state, nothing for a firm one", () => {
    expect(waitlistLabel({ status: "waiting", waitingPosition: 3 })).toBe("Liste d'attente · position 3")
    expect(waitlistLabel({ status: "waiting", waitingPosition: null })).toBe("Liste d'attente")
    expect(waitlistLabel({ status: "offered" })).toBe("Une place t'est proposée")
    expect(waitlistLabel({ status: "active" })).toBeNull()
  })

  it("words the offer deadline in the organization's time zone", () => {
    expect(offerDeadline("2026-07-04T10:30:00Z", "Europe/Zurich")).toBe("Confirme avant samedi 4 juillet à 12:30, sinon la place passe à la personne suivante.")
    expect(offerDeadline(null, "Europe/Zurich")).toBeNull()
    expect(offerDeadline("nope", "Europe/Zurich")).toBeNull()
  })
})
