// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { formatMoment, localInputToUtc } from "./registration-window"
import { localDateTimeToUtc } from "./time-zone"
import { ANSWER_STATE_LABELS, type AnswerState } from "./event-availability"

/**
 * Words of the dated availability (#1146, lot A, owner decisions of 2026-10-29): the organisers'
 * option and page (« vous ») and the page of the person asked (« tu »). Pure, for client components
 * and their tests.
 */

export const AVAILABILITY_OPTION_LABEL = "Recueillir les disponibilités pour cet événement"
export const AVAILABILITY_OPTION_HINT =
  "Chaque membre à qui vous le demandez reçoit un lien personnel pour indiquer, date par date, les heures où il est libre ou « pas disponible ». Les inscriptions restent ouvertes comme d'habitude ; vous seuls voyez les réponses."
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
  return open ? `Tu peux répondre ou changer tes réponses jusqu'au ${when}.` : `La date limite est passée (${when}) : tes réponses ne peuvent plus être changées ici.`
}

/**
 * Where the person asked can still write, under a closed page or a dead link (independent review,
 * #1146): the organisation's address when the page has it, else the email that carried the link.
 */
export function contactLine(organizationName: string | null, contactEmail: string | null): { lead: string; email: string | null } {
  const who = organizationName ?? "l'organisation"
  if (contactEmail) return { lead: `Pour une correction ou un nouveau lien, écris à ${who} :`, email: contactEmail }
  return { lead: `Pour une correction ou un nouveau lien, réponds à l'email de ${who} qui contenait ce lien.`, email: null }
}

/** What « Enregistrer mes disponibilités » says once saved: done, and until when it can change. */
export function savedSentence(deadline: Date | string | null, timeZone: string): string {
  return deadline
    ? `C'est enregistré. Tu peux fermer cette page ; tu pourras changer tes réponses avec ce même lien jusqu'au ${formatMoment(new Date(deadline), timeZone)}.`
    : "C'est enregistré. Tu peux fermer cette page, et revenir changer tes réponses avec ce même lien."
}

/**
 * The deadline passed while the page was open (the form gives way to the answers received):
 * `lost`, the last save was refused, so the changes on screen were not kept.
 */
export function closedNowSentence(published: boolean, lost: boolean): string {
  const what = published ? "La période de correction vient de se terminer" : "La date limite vient de passer"
  return lost
    ? `${what} : tes derniers changements n'ont pas été enregistrés. Voici les réponses que l'organisation a reçues.`
    : `${what}, juste après ton enregistrement : tes réponses ne peuvent plus être changées. Voici celles que l'organisation a reçues.`
}

/**
 * Whether a deadline typed in the event's zone (« 2026-11-10T20:00 ») is already past: saving it
 * closes the collection at once, so the organisers are asked first (independent review, #1146).
 */
export function deadlineInputIsPast(value: string, timeZone: string, now: Date = new Date()): boolean {
  const at = localInputToUtc(value, timeZone, localDateTimeToUtc)
  return !!at && at.getTime() <= now.getTime()
}

/** « heure suisse (Europe/Zurich) », the zone of a deadline in words. */
export function zoneLabel(timeZone: string): string {
  return timeZone === "Europe/Zurich" ? "heure suisse (Europe/Zurich)" : `fuseau horaire ${timeZone}`
}

/** The deadline in words, for the organisers. */
export function organiserDeadlineSentence(deadline: Date | string | null, open: boolean, timeZone: string): string {
  if (!deadline) return "Pas de date limite : les personnes peuvent répondre tant que la collecte est active."
  const when = formatMoment(new Date(deadline), timeZone)
  return open ? `Les personnes peuvent répondre jusqu'au ${when}.` : `Date limite passée (${when}) : les personnes ne peuvent plus changer leurs réponses. Vous pouvez encore les corriger, ou rouvrir la collecte avec une nouvelle date limite.`
}

export const DEADLINE_PASSED_ERROR = "La date limite est passée : les réponses ne peuvent plus être changées depuis ce lien."
export const COLLECTION_CLOSED_ERROR = "Cet événement ne recueille plus les disponibilités."
export const LINK_NOT_FOUND_ERROR = "Lien introuvable ou plus valable."

/** Whether the person asked may still change their answers themselves: before the deadline, if any. */
export function answersOpen(deadline: Date | string | null | undefined, now: Date = new Date()): boolean {
  return !deadline || now.getTime() < new Date(deadline).getTime()
}

/** The confirmation before turning collection off, with the number of live links. */
export function availabilityOffConfirmText(liveLinks: number): string {
  const links = liveLinks === 1 ? "Le lien envoyé à 1 personne cessera de fonctionner" : `Les liens envoyés à ${liveLinks} personnes cesseront de fonctionner`
  return `${links}. Les réponses déjà données sont gardées.`
}

export type SendResult = { asked: number; emailsQueued: number; recentlySkipped: number; withoutEmail: number }

/**
 * What a send or a reminder did, in a sentence for the organisers. A send with no email at all is a
 * warning (independent review, #1146): it starts with « Attention » and says why.
 */
export function sendResultText(r: SendResult, reminder = false): string {
  const parts: string[] = []
  const s = (n: number) => (n > 1 ? "s" : "")
  if (r.emailsQueued > 0) parts.push(reminder ? `${r.emailsQueued} relance${s(r.emailsQueued)} envoyée${s(r.emailsQueued)}.` : `${r.emailsQueued} demande${s(r.emailsQueued)} envoyée${s(r.emailsQueued)}.`)
  else parts.push(reminder ? "Attention : aucune relance envoyée." : "Attention : aucun email envoyé.")
  if (r.recentlySkipped > 0) {
    const since = reminder ? "il y a moins de 48 h" : "il y a moins de 5 minutes"
    parts.push(`${r.recentlySkipped} personne${s(r.recentlySkipped)} déjà contactée${s(r.recentlySkipped)} ${since}, laissée${s(r.recentlySkipped)} de côté.`)
  }
  if (r.withoutEmail > 0) parts.push(`${r.withoutEmail} sans adresse email : vous pouvez saisir leurs réponses vous-même.`)
  return parts.join(" ")
}

/** Whether a send or a reminder result is a warning: nothing went out. */
export function sendResultIsWarning(r: SendResult): boolean {
  return r.emailsQueued === 0
}

/**
 * The hint under « Relancer les personnes sans réponse »: how many get the same link again, and how
 * many unanswered people have no valid link any more (collection turned off then on): those are
 * asked again with « Demander leurs disponibilités », which sends them a new link.
 */
export function remindHintText(remindable: number, withoutLink: number): string {
  const s = (n: number) => (n > 1 ? "s" : "")
  const head = remindable === 0
    ? "Personne à relancer avec son lien actuel."
    : `${remindable} personne${s(remindable)} sans réponse. Une personne contactée il y a moins de 48 h n'est pas relancée.`
  if (withoutLink === 0) return head
  return `${head} ${withoutLink} personne${s(withoutLink)} sans réponse ${withoutLink > 1 ? "n'ont" : "n'a"} plus de lien valable : demandez de nouveau.`
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

// ── Corrections after a publication (#1146, lot C) ─────────────────────────────────────────────

/** On the person's page, once they hold a mission given by a publication (« tu »). */
export const CORRECTION_NOTICE = "Tu peux corriger tes disponibilités. Cela ne modifie ni n'annule tes missions. Préviens aussi l'organisation en cas de difficulté."

/** After the deadline, for a person who may still correct. */
export function correctionDeadlineSentence(until: Date, timeZone: string): string {
  return `La date limite est passée, mais comme des missions t'ont été confiées, tu peux encore corriger tes disponibilités jusqu'au ${formatMoment(until, timeZone)}.`
}

export const CORRECTION_SAVED_TEXT = "C'est enregistré. Si tes disponibilités ont changé, l'organisation est prévenue ; tes missions restent les mêmes. Tu peux fermer cette page."

/** Why an answer needs another look; stored together in `reviewReason`, comma separated. */
export const REVIEW_MERGE = "merge"
export const REVIEW_PUBLISHED = "published"

export function reviewReasons(stored: string | null | undefined): string[] {
  return [...new Set((stored ?? "").split(",").map((s) => s.trim()).filter(Boolean))].sort()
}

/** The stored value with one more reason (never losing a merge's). */
export function withReviewReason(stored: string | null | undefined, reason: string): string {
  return reviewReasons(`${stored ?? ""},${reason}`).join(",")
}

/** What the organisers read about a flagged answer, one sentence per reason. */
export function reviewReasonTexts(stored: string | null | undefined): string[] {
  return reviewReasons(stored).map((r) =>
    r === REVIEW_MERGE ? "À revoir : deux fiches fusionnées avaient répondu différemment."
      : r === REVIEW_PUBLISHED ? "À revoir : disponibilités modifiées après la publication des affectations."
        : "À revoir.")
}
