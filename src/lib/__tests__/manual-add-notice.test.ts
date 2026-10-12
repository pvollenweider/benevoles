import { describe, it, expect } from "vitest"
import { manualAddNotice, manualAddNoticeLog, manualAddNoticeSentence } from "../manual-add-notice"

// #916: a registration added by an organizer always emails the volunteer, with three exceptions.
const now = new Date("2026-10-12T10:00:00Z")
const later = new Date("2026-10-20T08:00:00Z")
const base = { organizerEmail: "lea@org.org", shiftStart: later, now }

describe("manualAddNotice", () => {
  it("sends to the volunteer's email, normalized", () => {
    expect(manualAddNotice({ ...base, email: " Aline@Example.org " })).toEqual({ send: true, email: "aline@example.org" })
  })

  it("skips without email", () => {
    expect(manualAddNotice({ ...base, email: "" })).toEqual({ send: false, reason: "no_email" })
    expect(manualAddNotice({ ...base, email: null })).toEqual({ send: false, reason: "no_email" })
  })

  it("skips when organizers place themselves, whatever the case", () => {
    expect(manualAddNotice({ ...base, email: "LEA@org.org" })).toEqual({ send: false, reason: "self" })
  })

  it("skips a shift already started", () => {
    expect(manualAddNotice({ ...base, email: "a@x.org", shiftStart: now })).toEqual({ send: false, reason: "past" })
  })

  it("words the outcome for the form and the log", () => {
    expect(manualAddNoticeSentence({ send: true, email: "a@x.org" })).toBe("Un email de confirmation partira à a@x.org dans une dizaine de minutes, avec tous les créneaux ajoutés pour cette personne d'ici là.")
    expect(manualAddNoticeSentence({ send: false, reason: "no_email" })).toBe("Pas d'email de confirmation : cette personne n'a pas d'adresse email.")
    expect(manualAddNoticeSentence({ send: false, reason: "self" })).toBe("Pas d'email de confirmation : vous vous inscrivez vous-même.")
    expect(manualAddNoticeSentence({ send: false, reason: "past" })).toBe("Pas d'email de confirmation : ce créneau a déjà commencé.")
    expect(manualAddNoticeLog({ send: true, email: "a@x.org" })).toBe("prévu, regroupé avec les autres ajouts des prochaines minutes")
    expect(manualAddNoticeLog({ send: false, reason: "past" })).toBe("non envoyé : créneau déjà commencé")
  })
})
