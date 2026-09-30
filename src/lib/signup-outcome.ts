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
