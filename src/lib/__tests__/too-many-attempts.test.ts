import { describe, it, expect } from "vitest"
import { TOO_MANY_ATTEMPTS, TOO_MANY_ATTEMPTS_PARAGRAPHS, TOO_MANY_ATTEMPTS_TITLE } from "@/lib/too-many-attempts"
import { WAITLIST_OFFER_PAGE_TITLES } from "@/lib/waitlist-offer"
import { SIGNUP_CONFIRMATION_PAGE_TITLES } from "@/lib/signup-confirmation"

describe("« Réessaie dans une heure » copy", () => {
  it("titles the state « Réessaie dans une heure »", () => {
    expect(TOO_MANY_ATTEMPTS_TITLE).toBe("Réessaie dans une heure")
  })

  it("says what happened, what was not done, and what to do, in three paragraphs", () => {
    expect(TOO_MANY_ATTEMPTS_PARAGRAPHS).toEqual([
      "Cette page est bloquée pendant une heure. Cela arrive quand trop de liens sont ouverts depuis le même réseau. Ta réponse n'a pas été enregistrée.",
      "Dans une heure, clique à nouveau sur le lien reçu par email.",
      "C'est urgent ? Ouvre le lien sur ton téléphone, wifi coupé. Sinon, contacte l'organisation de l'événement.",
    ])
  })

  it("names no link, event, organisation or address", () => {
    const text = [TOO_MANY_ATTEMPTS_TITLE, ...TOO_MANY_ATTEMPTS_PARAGRAPHS].join(" ")
    expect(text).not.toMatch(/https?:|\/my\/|@/)
  })

  it("is a state of the waitlist offer and sign-up confirmation title maps", () => {
    expect(WAITLIST_OFFER_PAGE_TITLES[TOO_MANY_ATTEMPTS]).toBe("Réessaie dans une heure")
    expect(SIGNUP_CONFIRMATION_PAGE_TITLES[TOO_MANY_ATTEMPTS]).toBe("Réessaie dans une heure")
  })
})
