import { describe, it, expect } from "vitest"
import { TOO_MANY_ATTEMPTS, TOO_MANY_ATTEMPTS_PARAGRAPHS, TOO_MANY_ATTEMPTS_TITLE } from "@/lib/too-many-attempts"
import { WAITLIST_OFFER_PAGE_TITLES } from "@/lib/waitlist-offer"
import { SIGNUP_CONFIRMATION_PAGE_TITLES } from "@/lib/signup-confirmation"

describe("« Trop de tentatives » copy", () => {
  it("titles the state « Trop de tentatives »", () => {
    expect(TOO_MANY_ATTEMPTS_TITLE).toBe("Trop de tentatives")
  })

  it("says what happened, what was not done, and what to do, in three paragraphs", () => {
    expect(TOO_MANY_ATTEMPTS_PARAGRAPHS).toEqual([
      "Trop de liens non reconnus ont été ouverts depuis ta connexion internet en peu de temps. Par sécurité, les liens personnels sont en pause pour cette connexion, pendant une heure au plus.",
      "Ton lien n'a pas été vérifié et rien n'a été modifié. Attends une heure, puis ouvre à nouveau le lien reçu par email.",
      "Si tu dois répondre avant, essaie depuis une autre connexion, par exemple les données mobiles de ton téléphone, ou écris à l'organisation de ton événement.",
    ])
  })

  it("names no link, event, organisation or address", () => {
    const text = [TOO_MANY_ATTEMPTS_TITLE, ...TOO_MANY_ATTEMPTS_PARAGRAPHS].join(" ")
    expect(text).not.toMatch(/https?:|\/my\/|@/)
  })

  it("is a state of the waitlist offer and sign-up confirmation title maps", () => {
    expect(WAITLIST_OFFER_PAGE_TITLES[TOO_MANY_ATTEMPTS]).toBe("Trop de tentatives")
    expect(SIGNUP_CONFIRMATION_PAGE_TITLES[TOO_MANY_ATTEMPTS]).toBe("Trop de tentatives")
  })
})
