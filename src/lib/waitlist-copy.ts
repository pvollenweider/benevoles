// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The waitlist explained in plain words (#374), once, for every surface: the sign-up page, the
 * success page, the personal page, the emails and the volunteer guide. What it is, how the
 * order is set, how long an offer lasts, how to accept, what happens without an answer.
 */

/** How long an offered spot stays reserved, in hours (see promoteNextInWaitlist). */
export const WAITLIST_OFFER_HOURS = 24

export const WAITLIST_STEPS: readonly string[] = [
  "Ton inscription n'est pas encore confirmée : le créneau est complet.",
  "L'ordre est celui des inscriptions : la première personne inscrite en liste d'attente est la première prévenue.",
  `Dès qu'une place se libère, tu reçois un email avec un lien pour la prendre. Tu as ${WAITLIST_OFFER_HOURS} heures à partir de cet email.`,
  "Pour accepter, clique sur le lien de cet email (ou sur « Prendre la place » sur ta page personnelle) : la place est à toi, tu reçois la confirmation.",
  `Si tu ne réponds pas dans les ${WAITLIST_OFFER_HOURS} heures, la place passe à la personne suivante ; tu restes en liste d'attente.`,
] as const

/** Short version for a recap line or a card, such as the sign-up recap. */
export const WAITLIST_SHORT = `Complet : liste d'attente. Si une place se libère, tu recevras un email et tu auras ${WAITLIST_OFFER_HOURS} heures pour la prendre.`
/** Recap note under requests (#484). */
export const REQUEST_SHORT = "Sur validation : ton inscription sera une demande. L'organisation l'accepte ou la refuse, et te prévient par email ; la place t'est réservée d'ici là."

export type WaitlistState = { status: string; waitingPosition?: number | null; waitingExpiresAt?: string | Date | null }

/** The label of a registration's waitlist state, or null when it's a firm registration. */
export function waitlistLabel(r: WaitlistState): string | null {
  if (r.status === "waiting") return r.waitingPosition ? `Liste d'attente · position ${r.waitingPosition}` : "Liste d'attente"
  if (r.status === "offered") return "Une place t'est proposée"
  if (r.status === "requested") return "Demande envoyée · en attente de réponse"
  return null
}

/** « Confirme avant le … » for an offered spot, in the organization's time zone. */
export function offerDeadline(expiresAt: string | Date | null | undefined, timeZone: string): string | null {
  if (!expiresAt) return null
  const d = new Date(expiresAt)
  if (Number.isNaN(d.getTime())) return null
  const day = d.toLocaleDateString("fr-FR", { timeZone, weekday: "long", day: "numeric", month: "long" })
  const time = d.toLocaleTimeString("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" })
  return `Confirme avant ${day} à ${time}, sinon la place passe à la personne suivante.`
}
