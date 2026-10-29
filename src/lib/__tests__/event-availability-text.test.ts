// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import { answersOpen, availabilityOffConfirmText, deadlineSentence, eventDatesLabel, myAvailabilityTitle, organiserDeadlineSentence, sendResultText } from "../event-availability-text"
import { availabilityLinksToResend } from "../member-address-change"

const TZ = "Europe/Zurich"

describe("dated availability texts (#1146)", () => {
  it("titles the person's page as decided by the owner", () => {
    expect(myAvailabilityTitle("Festival 2099")).toBe("Mes disponibilités pour Festival 2099")
  })

  it("is open before the deadline, closed at and after it, open without one", () => {
    const deadline = new Date("2099-07-01T21:59:00Z")
    expect(answersOpen(null)).toBe(true)
    expect(answersOpen(deadline, new Date("2099-07-01T21:58:59Z"))).toBe(true)
    expect(answersOpen(deadline, deadline)).toBe(false)
  })

  it("says the deadline in the event's zone, to the person and to the organisers", () => {
    const deadline = "2099-07-01T21:59:00Z"
    expect(deadlineSentence(deadline, true, TZ)).toBe("Tu peux répondre ou changer tes réponses jusqu'au mercredi 1 juillet à 23h59.")
    expect(deadlineSentence(deadline, false, TZ)).toContain("La date limite est passée")
    expect(deadlineSentence(null, true, TZ)).toBeNull()
    expect(organiserDeadlineSentence(null, true, TZ)).toContain("Pas de date limite")
    expect(organiserDeadlineSentence(deadline, false, TZ)).toContain("rouvrir la collecte")
  })

  it("counts the links that stop working when collection is turned off", () => {
    expect(availabilityOffConfirmText(1)).toMatch(/^Le lien envoyé à 1 personne cessera/)
    expect(availabilityOffConfirmText(3)).toMatch(/^Les liens envoyés à 3 personnes cesseront/)
    expect(availabilityOffConfirmText(3)).toContain("réponses déjà données sont gardées")
  })

  it("reports a send and a reminder", () => {
    expect(sendResultText({ asked: 3, emailsQueued: 2, recentlySkipped: 0, withoutEmail: 1 })).toBe("2 demandes envoyées. 1 sans adresse email : vous pouvez saisir leurs réponses vous-même.")
    expect(sendResultText({ asked: 1, emailsQueued: 0, recentlySkipped: 1, withoutEmail: 0 }, true)).toBe("Aucune relance envoyée. 1 personne déjà contactée récemment, laissée de côté.")
  })

  it("names the event's dates", () => {
    expect(eventDatesLabel(new Date("2099-07-04"), new Date("2099-07-04"))).toBe("le samedi 4 juillet")
    expect(eventDatesLabel(new Date("2099-07-10"), new Date("2099-07-12"))).toBe("du vendredi 10 juillet au dimanche 12 juillet")
  })
})

describe("availabilityLinksToResend (#1146)", () => {
  const now = new Date("2099-06-01T10:00:00Z")
  const base = { hasLink: true, collecting: true, deadline: null, eventEndDate: new Date("2099-07-12") }
  it("sends the renewed live links of events still collecting, before their deadline", () => {
    const requests = [
      { ...base, id: "ok" },
      { ...base, id: "revoked", hasLink: false },
      { ...base, id: "off", collecting: false },
      { ...base, id: "late", deadline: new Date("2099-05-31T00:00:00Z") },
      { ...base, id: "past", eventEndDate: new Date("2099-05-01") },
    ]
    expect(availabilityLinksToResend({ newEmail: "new@example.org", active: true, requests }, now)).toEqual(["ok"])
  })
  it("sends nothing without a new address or to an inactive member", () => {
    expect(availabilityLinksToResend({ newEmail: null, active: true, requests: [{ ...base, id: "a" }] }, now)).toEqual([])
    expect(availabilityLinksToResend({ newEmail: "x@example.org", active: false, requests: [{ ...base, id: "a" }] }, now)).toEqual([])
  })
})
