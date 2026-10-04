import { describe, it, expect } from "vitest"
import {
  WITHDRAWABLE_STATUSES, WITHDRAWAL_MESSAGE_MAX, planVolunteerWithdraw, withdrawCopy, withdrawDoneMessage,
  withdrawFailureMessage, withdrawRequestSchema, withdrawalMessageHint,
} from "../volunteer-withdraw"

describe("planVolunteerWithdraw", () => {
  it("lets every live status be withdrawn", () => {
    expect([...WITHDRAWABLE_STATUSES]).toEqual(["active", "waiting", "offered", "requested"])
    for (const s of WITHDRAWABLE_STATUSES) expect(planVolunteerWithdraw(s)).not.toBeNull()
  })

  it("releases a spot for a place, a request and an offered spot", () => {
    expect(planVolunteerWithdraw("active")).toEqual({ releasesSpot: true, notifiesOrganizers: true })
    expect(planVolunteerWithdraw("requested")).toEqual({ releasesSpot: true, notifiesOrganizers: true })
    expect(planVolunteerWithdraw("offered")).toEqual({ releasesSpot: true, notifiesOrganizers: false })
  })

  it("releases nothing when leaving the waitlist", () => {
    expect(planVolunteerWithdraw("waiting")).toEqual({ releasesSpot: false, notifiesOrganizers: false })
  })

  it("notifies organizers only for a confirmed place or a pending request (#559)", () => {
    expect(planVolunteerWithdraw("active")!.notifiesOrganizers).toBe(true)
    expect(planVolunteerWithdraw("requested")!.notifiesOrganizers).toBe(true)
    expect(planVolunteerWithdraw("waiting")!.notifiesOrganizers).toBe(false)
    expect(planVolunteerWithdraw("offered")!.notifiesOrganizers).toBe(false)
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

// The shift as /my receives it: the calendar day is an ISO timestamp at midnight UTC.
const bar = { label: "Bar", date: "2026-07-04T00:00:00.000Z", startTime: "10:00", endTime: "12:00" }

describe("withdrawDoneMessage", () => {
  it("says the shift was cancelled, in words", () => {
    expect(withdrawDoneMessage("active", bar)).toBe("Créneau annulé : Bar, samedi 4 juillet, de 10h à 12h.")
  })

  it("says the volunteer left the waitlist", () => {
    expect(withdrawDoneMessage("waiting", bar)).toBe("Tu as quitté la liste d'attente : Bar, samedi 4 juillet, de 10h à 12h.")
  })

  it("says a refused spot goes to the next person", () => {
    expect(withdrawDoneMessage("offered", bar)).toBe("Place refusée : Bar, samedi 4 juillet, de 10h à 12h. Elle passe à la personne suivante.")
  })

  it("says the request was withdrawn", () => {
    expect(withdrawDoneMessage("requested", bar)).toBe("Demande retirée : Bar, samedi 4 juillet, de 10h à 12h.")
  })

  it("names the shift by its label, not its role, and reads minutes", () => {
    const s = { label: "Bar du soir", date: "2026-07-05", startTime: "18:30", endTime: "23:00" }
    expect(withdrawDoneMessage("active", s)).toBe("Créneau annulé : Bar du soir, dimanche 5 juillet, de 18h30 à 23h.")
  })
})

describe("withdrawFailureMessage", () => {
  it("says the connection failed and nothing was cancelled", () => {
    expect(withdrawFailureMessage({ network: true })).toBe("La connexion a échoué : l'annulation n'a peut-être pas été enregistrée. Recharge la page pour vérifier.")
  })

  it("asks to reload when the registration is already gone (404)", () => {
    expect(withdrawFailureMessage({ status: 404 })).toBe("Ce créneau était déjà annulé ou n'existe plus. Recharge la page pour voir tes inscriptions à jour.")
  })

  it("says to wait an hour when rate limited (429)", () => {
    expect(withdrawFailureMessage({ status: 429 })).toBe("Trop de tentatives : rien n'a été annulé. Réessaie dans une heure.")
  })

  it("says nothing was cancelled on a server error", () => {
    expect(withdrawFailureMessage({ status: 500 })).toBe("L'annulation n'a pas abouti : rien n'a été annulé. Réessaie dans un moment.")
  })
})

describe("withdrawRequestSchema", () => {
  it("accepts no message, an empty one, or one within the limit, trimmed", () => {
    expect(withdrawRequestSchema.safeParse({}).success).toBe(true)
    expect(withdrawRequestSchema.safeParse({ message: "" }).success).toBe(true)
    const parsed = withdrawRequestSchema.safeParse({ message: "  Paul peut me remplacer  " })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.message).toBe("Paul peut me remplacer")
  })

  it(`refuses a message over ${WITHDRAWAL_MESSAGE_MAX} characters`, () => {
    expect(withdrawRequestSchema.safeParse({ message: "a".repeat(WITHDRAWAL_MESSAGE_MAX) }).success).toBe(true)
    expect(withdrawRequestSchema.safeParse({ message: "a".repeat(WITHDRAWAL_MESSAGE_MAX + 1) }).success).toBe(false)
  })
})

describe("withdrawalMessageHint", () => {
  it("counts down from the limit and warns against sensitive details", () => {
    expect(withdrawalMessageHint(0)).toContain(`0/${WITHDRAWAL_MESSAGE_MAX}`)
    expect(withdrawalMessageHint(12)).toContain(`12/${WITHDRAWAL_MESSAGE_MAX}`)
    expect(withdrawalMessageHint(0)).toMatch(/santé/)
  })
})

describe("withdraw wording", () => {
  it("has no middle dot nor em dash, read aloud by screen readers", () => {
    const strings = [
      ...WITHDRAWABLE_STATUSES.flatMap((s) => [...Object.values(withdrawCopy(s, "Bar")), withdrawDoneMessage(s, bar)]),
      ...[{ network: true }, { status: 404 }, { status: 429 }, { status: 500 }].map(withdrawFailureMessage),
    ]
    for (const text of strings) {
      expect(text).not.toContain("·")
      expect(text).not.toContain("—")
    }
  })

  it("no longer says « prévenu·e » when leaving the waitlist", () => {
    const c = withdrawCopy("waiting", "Bar")
    expect(c.confirmBefore + "Bar" + c.confirmAfter).toBe("Tu ne recevras plus de message si une place se libère sur le créneau Bar.")
  })
})
