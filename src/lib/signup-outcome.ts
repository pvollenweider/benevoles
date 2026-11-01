// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What the success page says after a sign-up: a confirmed place, the waitlist, or a request on a
 * « Sur validation » shift (#484), which is not a place and must never read like one.
 */

export type SignupOutcome = { waitlist: boolean; requested: number; active: number }

export function readOutcome(params: { get(name: string): string | null }): SignupOutcome {
  const n = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : 0)
  return { waitlist: params.get("waitlist") === "1", requested: n(params.get("requested")), active: n(params.get("active")) }
}

export function outcomeHeading(o: SignupOutcome): string {
  if (o.waitlist) return "Tu es sur la liste d'attente !"
  if (o.requested > 0 && o.active === 0) return o.requested > 1 ? "Demandes envoyées" : "Demande envoyée"
  return "Inscription confirmée !"
}

/** The request notice, or null when nothing is waiting for the organizer's decision. */
export function requestNotice(o: SignupOutcome): string | null {
  if (o.requested === 0) return null
  const which = o.requested > 1 ? `${o.requested} créneaux sont sur validation` : "Ce créneau est sur validation"
  const lead = o.active > 0 ? (o.requested > 1 ? `${o.requested} de tes créneaux sont sur validation` : "Un de tes créneaux est sur validation") : which
  return `${lead} : ce n'est pas encore une inscription confirmée. La place t'est réservée le temps que l'organisation réponde, et tu recevras un email avec sa réponse.`
}

/**
 * A sign-up without proof of the address (AUTHZ-01): the page can't say what happened, the server
 * answers the same whether it was recorded or not. The emails say it: the confirmation, or why it
 * was not recorded. No celebration, no place or request claimed.
 */
export const UNPROVEN_HEADING = "Demande d'inscription reçue"
export const UNPROVEN_TEXT = "Merci pour ton engagement. Vérifie tes emails, y compris les courriers indésirables : tu y trouveras la suite donnée à ta demande."
export const UNPROVEN_RETRY_TEXT = "Si tu viens de réessayer, consulte aussi les emails déjà reçus."
