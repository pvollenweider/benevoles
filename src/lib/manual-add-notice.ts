// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Whether a registration added by an organizer emails the volunteer (#916). Always, so the person
 * keeps a written trace of what was agreed and a link to check or withdraw; no opt-out. Only three
 * cases skip it, decided here for the add form (shown before submitting) and the server alike.
 */
export type ManualAddNotice =
  | { send: true; email: string }
  | { send: false; reason: "no_email" | "self" | "past" }

export function manualAddNotice(input: {
  /** The volunteer's email, typed or from the chosen member; "" or null when none. */
  email: string | null | undefined
  /** The signed-in organizer's own email: placing oneself sends nothing. */
  organizerEmail: string | null | undefined
  /** Start of the shift, as an instant; a shift already started is data entry after the fact. */
  shiftStart: Date
  now: Date
}): ManualAddNotice {
  const email = input.email?.trim().toLowerCase() ?? ""
  if (!email) return { send: false, reason: "no_email" }
  if (email === input.organizerEmail?.trim().toLowerCase()) return { send: false, reason: "self" }
  if (input.shiftStart.getTime() <= input.now.getTime()) return { send: false, reason: "past" }
  return { send: true, email }
}

/** The line under the add button, read before submitting. */
export function manualAddNoticeSentence(notice: ManualAddNotice): string {
  if (notice.send) return `Un email de confirmation partira à ${notice.email} dans une dizaine de minutes, avec tous les créneaux ajoutés pour cette personne d'ici là.`
  switch (notice.reason) {
    case "no_email": return "Pas d'email de confirmation : cette personne n'a pas d'adresse email."
    case "self": return "Pas d'email de confirmation : vous vous inscrivez vous-même."
    case "past": return "Pas d'email de confirmation : ce créneau a déjà commencé."
  }
}

/** How the event log records the outcome, in the organizers' words. */
export function manualAddNoticeLog(notice: ManualAddNotice): string {
  if (notice.send) return "prévu, regroupé avec les autres ajouts des prochaines minutes"
  switch (notice.reason) {
    case "no_email": return "non envoyé : sans adresse email"
    case "self": return "non envoyé : inscription de soi-même"
    case "past": return "non envoyé : créneau déjà commencé"
  }
}
