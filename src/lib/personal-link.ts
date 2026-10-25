// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The personal link explained (#376): what it gives access to, that it must stay private, when
 * it was last emailed, how to get a fresh one, and what to do when it doesn't work. Pure; the
 * personal page and its API use these words and rules.
 */

export const PERSONAL_LINK_NOTICE =
  "Ce lien est personnel : il donne accès à tes inscriptions et permet de les annuler. Ne le partage pas."

/** « Dernier email contenant ce lien : samedi 4 juillet à 10:30 » or null when never recorded. */
export function lastLinkEmailLabel(at: string | Date | null | undefined, timeZone: string): string | null {
  if (!at) return null
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return null
  const day = d.toLocaleDateString("fr-FR", { timeZone, weekday: "long", day: "numeric", month: "long" })
  const time = d.toLocaleTimeString("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" })
  return `Dernier email contenant ce lien : ${day} à ${time}.`
}

/** Same answer whether the address is known or not: the page never confirms who is registered. */
export const LINK_REQUEST_RESPONSE =
  "Si une inscription existe à cette adresse, un email avec le lien personnel vient de partir. Pense à vérifier les courriers indésirables."

export const LINK_RESENT_RESPONSE = "Un nouvel email avec ton lien vient de partir."

export const LINK_THROTTLED_RESPONSE =
  "Un email avec ton lien est déjà parti il y a peu. Vérifie ta boîte de réception et les courriers indésirables, puis réessaie dans une heure."

/** Why a link can stop working, and what to do. */
export const INVALID_LINK_STEPS: readonly string[] = [
  "Le lien a peut-être été coupé par la messagerie : ouvre-le depuis l'email plutôt que de le recopier.",
  "Si toutes tes inscriptions à cet événement ont été annulées, le lien ne mène plus nulle part.",
  "Tu peux recevoir un nouveau lien : indique l'adresse email utilisée pour t'inscrire dans le formulaire ci-dessous.",
] as const

/** Requests per address and per hour; the same throttle as the re-send from the sign-up form. */
export const LINK_REQUEST_LIMIT = 3
export const LINK_REQUEST_WINDOW_MS = 60 * 60 * 1000

/**
 * « J'ai perdu mon lien » on the event page (#1097): the same request as on the « Ce lien ne
 * fonctionne pas » page (same route, same limits, same answer whether the address is known or
 * not), for a volunteer who has no link at all. Never returns a link on screen (#285).
 */
export const LOST_LINK_SUMMARY = "J'ai perdu mon lien personnel"

export const LOST_LINK_INTRO =
  "Si une inscription existe à cette adresse, ton lien personnel t'est envoyé par email."

/** The request form's button: a fresh copy on the « Ce lien ne fonctionne pas » page, the link itself when lost. */
export const LINK_REQUEST_SUBMIT = {
  invalid: "Recevoir un nouveau lien",
  lost: "Recevoir mon lien par email",
} as const

export type LinkRequestVariant = keyof typeof LINK_REQUEST_SUBMIT

/** Said on the confirmation when the link went out by email only (#1097, #285), and in the embedded one (#948). */
export const PERSONAL_LINK_EMAIL_NOTE =
  "L'email de confirmation contient ton lien personnel : garde-le pour modifier ou annuler ton inscription."

/** The guide pages behind these texts (content/guide/lien-personnel.md, checked by its test). */
export const PERSONAL_LINK_DOC_LINKS = {
  personalLink: "/doc/lien-personnel",
  lostLink: "/doc/lien-personnel#je-n-ai-plus-le-lien-vers-mes-inscriptions",
} as const

/**
 * Whether the event page offers « J'ai perdu mon lien personnel »: not in the organiser's
 * preview (nothing is sent from it), and not once this browser already holds a registration of
 * the event (its links are on the page).
 */
export function showsLostLinkEntry(o: { preview: boolean; sessionRegistrations: number }): boolean {
  return !o.preview && o.sessionRegistrations === 0
}
