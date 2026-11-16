// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import {
  SIGNUP_CONFIRMATION_HOURS,
  cancelledState,
  confirmationIdentityLines,
  confirmationDeadlineLabel,
  confirmationRequestNotice,
  signupConfirmationDecision,
  signupConfirmationExpiry,
  signupConfirmationPageState,
} from "../signup-confirmation"
import { COMMITTED_STATUSES, LIVE_STATUSES, OCCUPYING_STATUSES, BOOKED_STATUSES } from "../registration-capacity"
import { registrationsSummary } from "../registrations-list"
import { render } from "../notifications/templates"
import { successPath } from "../registration-success"
import { readOutcome, outcomeHeading } from "../signup-outcome"

const now = new Date("2026-11-10T10:00:00Z")
const hours = (n: number) => new Date(now.getTime() + n * 3600 * 1000)
const row = (over: Partial<{ confirmedAt: Date | null; cancelledAt: Date | null; cancelReason: string | null; expiresAt: Date }> = {}) => ({
  confirmedAt: null,
  cancelledAt: null,
  cancelReason: null,
  expiresAt: hours(24),
  ...over,
})

describe("the reservation deadline (#1253)", () => {
  it("is 24 h by default, like a waitlist offer", () => {
    expect(SIGNUP_CONFIRMATION_HOURS).toBe(24)
    expect(signupConfirmationExpiry(now, hours(48))).toEqual(hours(24))
  })
  it("never runs past the first selected shift's start", () => {
    expect(signupConfirmationExpiry(now, hours(6))).toEqual(hours(6))
  })
  it("still reserves until its start when the shift begins in less than an hour", () => {
    expect(signupConfirmationExpiry(now, hours(0.25))).toEqual(hours(0.25))
  })
  it("is written in the organisation's time zone", () => {
    expect(confirmationDeadlineLabel(hours(24), "Europe/Zurich")).toMatch(/mercredi 11 novembre à 11:00/)
  })
})

describe("opening the link changes nothing, the button decides", () => {
  const pending = row()
  it("shows a pending request and the shifts to confirm", () => {
    expect(signupConfirmationPageState(pending, now, true, ["unconfirmed"], [])).toBe("pending")
    expect(signupConfirmationDecision({ ...pending, id: "c1" }, now, ["unconfirmed"], [])).toBe("pending")
  })
  it("accepts a request whose only shifts are waitlist intents", () => {
    expect(signupConfirmationPageState(pending, now, true, [], ["s1"])).toBe("pending")
  })
  it("has already confirmed: the recorded result is shown again", () => {
    const done = row({ confirmedAt: now })
    expect(signupConfirmationPageState(done, now, true, [], [])).toBe("confirmed")
    expect(signupConfirmationDecision({ ...done, id: "c1" }, now, [], [])).toBe("confirmed")
  })
  it("expired: the deadline passed before any click", () => {
    const expired = row({ expiresAt: hours(-1) })
    expect(signupConfirmationPageState(expired, now, true, ["unconfirmed"], [])).toBe("expired")
    expect(signupConfirmationDecision({ ...expired, id: "c1" }, now, ["unconfirmed"], [])).toBe("expired")
  })
  it("replaced by a newer request for the same address", () => {
    const replaced = row({ cancelledAt: now, cancelReason: "replaced" })
    expect(signupConfirmationPageState(replaced, now, true, [], [])).toBe("replaced")
    expect(signupConfirmationDecision({ ...replaced, id: "c1" }, now, [], [])).toBe("replaced")
  })
  it("cancelled by the organisation", () => {
    const cancelled = row({ cancelledAt: now, cancelReason: "withdrawn" })
    expect(signupConfirmationPageState(cancelled, now, true, [], [])).toBe("cancelled")
  })
  it("place reassigned: nothing left to confirm", () => {
    expect(signupConfirmationPageState(pending, now, true, ["cancelled"], [])).toBe("invalid")
    expect(signupConfirmationDecision({ ...pending, id: "c1" }, now, ["cancelled"], [])).toBe("gone")
  })
  it("unknown link or closed organisation", () => {
    expect(signupConfirmationPageState(null, now)).toBe("invalid")
    expect(signupConfirmationPageState(pending, now, false, ["unconfirmed"], [])).toBe("unavailable")
  })
})

describe("what the volunteer reads", () => {
  it("the result page says an email was sent, and until when the places hold", () => {
    const notice = confirmationRequestNotice({ held: 2, waiting: 1, deadline: "mercredi 11 novembre à 11:00" })
    expect(notice.heading).toBe("Vérifie tes emails")
    expect(notice.text).toContain("Confirmer mon inscription")
    expect(notice.deadline).toContain("mercredi 11 novembre à 11:00")
    expect(notice.waitlist).toContain("liste d'attente")
  })
  it("a waitlist-only request reserves nothing and says so", () => {
    const notice = confirmationRequestNotice({ held: 0, waiting: 2, deadline: null })
    expect(notice.deadline).toBeNull()
    expect(notice.waitlist).toContain("Aucune place n'est réservée")
  })
  it("the success URL carries the confirmation state", () => {
    const path = successPath("fete", {
      emailConfirmation: true, confirmationHeld: 1, confirmationWaiting: 2,
      confirmationExpiresAt: hours(24).toISOString(), confirmationTimeZone: "Europe/Zurich",
    }, new URLSearchParams("org=asso"), false)
    expect(path).toContain("confirm=1")
    expect(path).toContain("held=1")
    expect(path).toContain("waiting=2")
    expect(path).toContain("tz=Europe%2FZurich")
    const outcome = readOutcome(new URL(path, "https://x.test").searchParams)
    expect(outcome.emailConfirmation).toBe(true)
    expect(outcomeHeading(outcome)).toBe("Vérifie tes emails")
  })
  it("the email lists the shifts and the deadline, with the link button", () => {
    const email = render({
      kind: "signup_email_confirmation",
      recipient: { email: "a@example.org" },
      data: {
        volunteerName: "Léa M",
        eventTitle: "Fête",
        confirmUrl: "https://asso.benevol.app/confirmation/tok",
        expiresAt: "mercredi 11 novembre à 11:00",
        shifts: [
          { label: "Bar", date: "samedi 14 novembre", startTime: "10:00", endTime: "12:00" },
          { label: "Accueil", date: "dimanche 15 novembre", startTime: "14:00", endTime: "16:00", waitlist: true },
        ],
      },
    })
    expect(email.subject).toBe("Confirme ton inscription — Fête")
    expect(email.text).toContain("Bar")
    expect(email.text).toContain("liste d'attente à confirmer")
    expect(email.text).toContain("mercredi 11 novembre à 11:00")
    expect(email.text).toContain("https://asso.benevol.app/confirmation/tok")
    expect(email.html).toContain("Confirmer mon inscription")
  })
})

describe("what the organizer counts", () => {
  it("a provisional place is a booked place for capacity, overlap, workload and role limits", () => {
    expect(OCCUPYING_STATUSES).toContain("unconfirmed")
    expect(COMMITTED_STATUSES).toContain("unconfirmed")
    expect(BOOKED_STATUSES).toContain("unconfirmed")
    // Not a registration the volunteer manages with a personal link before confirming.
    expect(LIVE_STATUSES).not.toContain("unconfirmed")
  })
  it("counts it apart from the confirmed registrations", () => {
    expect(registrationsSummary({ active: 2, waiting: 0, requested: 0, unconfirmed: 3 }))
      .toBe("2 inscriptions actives, 3 en attente de confirmation par email")
  })
})

describe("a request closed by the expiration cron (#1253)", () => {
  it("reads as expired, not cancelled, on the page and on a late click", () => {
    const closed = row({ cancelledAt: hours(25), cancelReason: "expired", expiresAt: hours(24) })
    expect(signupConfirmationPageState(closed, hours(26), true, ["cancelled"])).toBe("expired")
    expect(signupConfirmationDecision({ ...closed, id: "c1" }, hours(26), ["cancelled"], [])).toBe("expired")
  })

  it("keeps replaced and organiser cancellations apart", () => {
    expect(cancelledState("replaced")).toBe("replaced")
    expect(cancelledState("expired")).toBe("expired")
    expect(cancelledState("organizer")).toBe("cancelled")
    expect(cancelledState(null)).toBe("cancelled")
  })
})

describe("who the request was made for (#1253)", () => {
  it("lists the name and the phone the confirmation saves", () => {
    expect(confirmationIdentityLines({ firstName: "Nadia", lastName: " Berisha ", phone: " 079 555 12 34 " })).toEqual(["Nom : Nadia Berisha", "Téléphone : 079 555 12 34"])
  })
  it("leaves out an empty phone", () => {
    expect(confirmationIdentityLines({ firstName: "Nadia", lastName: "Berisha", phone: null })).toEqual(["Nom : Nadia Berisha"])
    expect(confirmationIdentityLines({ firstName: "Nadia", lastName: "Berisha", phone: "  " })).toEqual(["Nom : Nadia Berisha"])
  })
})
