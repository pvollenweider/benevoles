// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { formatMoment } from "./registration-window"
import { ANSWER_STATE_LABELS, type AnswerState } from "./event-availability"

/**
 * Words of the dated availability (#1146, lot A, owner decisions of 2026-10-29): the organisers'
 * option and page (« vous ») and the page of the person asked (« tu »). Pure, for client components
 * and their tests.
 */

export const AVAILABILITY_OPTION_LABEL = "Recueillir les disponibilités pour cet événement"
export const AVAILABILITY_OPTION_HINT =
  "Chaque membre à qui vous le demandez reçoit un lien personnel pour indiquer, date par date, ses plages libres ou « pas disponible ». Les inscriptions restent ouvertes comme d'habitude ; vous seuls voyez les réponses."
export const AVAILABILITY_NOT_ADOPTABLE = "Cette fonction bêta n'est pas disponible pour votre organisation."
export const AVAILABILITY_PAGE_TITLE = "Disponibilités"
export const AVAILABILITY_LINK_LABEL = "Indiquer mes disponibilités"

/** « Mes disponibilités pour Festival 2026 », the title of the page of the person asked. */
export function myAvailabilityTitle(eventTitle: string): string {
  return `Mes disponibilités pour ${eventTitle}`
}

export const AVAILABILITY_LINK_NOTICE = "Ce lien est personnel : il permet de modifier tes disponibilités. Ne le transmets pas."

/** The deadline in words, for the person asked: open until, or closed since. */
export function deadlineSentence(deadline: Date | string | null, open: boolean, timeZone: string): string | null {
  if (!deadline) return null
  const when = formatMoment(new Date(deadline), timeZone)
  return open ? `Tu peux répondre ou changer tes réponses jusqu'au ${when}.` : `La date limite est passée (${when}) : tes réponses ne peuvent plus être changées ici. Pour une correction, contacte l'organisation.`
}

/** The deadline in words, for the organisers. */
export function organiserDeadlineSentence(deadline: Date | string | null, open: boolean, timeZone: string): string {
  if (!deadline) return "Pas de date limite : les personnes peuvent répondre tant que la collecte est active."
  const when = formatMoment(new Date(deadline), timeZone)
  return open ? `Les personnes peuvent répondre jusqu'au ${when}.` : `Date limite passée (${when}) : les personnes ne peuvent plus changer leurs réponses. Vous pouvez encore les corriger, ou rouvrir la collecte avec une nouvelle date limite.`
}

export const DEADLINE_PASSED_ERROR = "La date limite est passée : les réponses ne peuvent plus être changées depuis ce lien. Pour une correction, contacte l'organisation."
export const COLLECTION_CLOSED_ERROR = "Cet événement ne recueille plus les disponibilités."
export const LINK_NOT_FOUND_ERROR = "Lien introuvable ou plus valable."

/** Whether the person asked may still change their answers themselves: before the deadline, if any. */
export function answersOpen(deadline: Date | string | null | undefined, now: Date = new Date()): boolean {
  return !deadline || now.getTime() < new Date(deadline).getTime()
}

/** The confirmation before turning collection off, with the number of live links. */
export function availabilityOffConfirmText(liveLinks: number): string {
  const links = liveLinks === 1 ? "Le lien envoyé à 1 personne cessera de fonctionner" : `Les liens envoyés à ${liveLinks} personnes cesseront de fonctionner`
  return `${links}. Les réponses déjà données sont gardées, et vous les verrez de nouveau si vous réactivez la collecte (avec de nouveaux liens).`
}

export type SendResult = { asked: number; emailsQueued: number; recentlySkipped: number; withoutEmail: number }

/** What a send or a reminder did, in a sentence for the organisers. */
export function sendResultText(r: SendResult, reminder = false): string {
  const parts: string[] = []
  if (r.emailsQueued > 0) parts.push(reminder ? `${r.emailsQueued} relance${r.emailsQueued > 1 ? "s" : ""} envoyée${r.emailsQueued > 1 ? "s" : ""}.` : `${r.emailsQueued} demande${r.emailsQueued > 1 ? "s" : ""} envoyée${r.emailsQueued > 1 ? "s" : ""}.`)
  else parts.push(reminder ? "Aucune relance envoyée." : "Aucun email envoyé.")
  if (r.recentlySkipped > 0) parts.push(`${r.recentlySkipped} personne${r.recentlySkipped > 1 ? "s" : ""} déjà contactée${r.recentlySkipped > 1 ? "s" : ""} récemment, laissée${r.recentlySkipped > 1 ? "s" : ""} de côté.`)
  if (r.withoutEmail > 0) parts.push(`${r.withoutEmail} sans adresse email : vous pouvez saisir leurs réponses vous-même.`)
  return parts.join(" ")
}

/** « Réponse complète », for a state. */
export function answerStateLabel(state: AnswerState): string {
  return ANSWER_STATE_LABELS[state]
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** « le samedi 4 juillet », or « du vendredi 10 juillet au dimanche 12 juillet » (civil dates, UTC). */
export function eventDatesLabel(startDate: Date | string, endDate: Date | string): string {
  const fmt = (d: Date | string) => lowerFirst(new Date(d).toLocaleDateString("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }))
  const a = fmt(startDate), b = fmt(endDate)
  return a === b ? `le ${a}` : `du ${a} au ${b}`
}
