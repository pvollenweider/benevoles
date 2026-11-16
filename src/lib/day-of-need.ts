// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Ajouter un besoin » on the « Jour J » page (#1304): a one-off shift created from the day-of
 * board, then the existing « Chercher des bénévoles » list to warn people already on site today.
 *
 * Pure: the defaults of the form, the sentence replacing the send when registrations are closed,
 * and the confirmation of the created shift. Times are the organisation's wall-clock times (#344).
 */

import { addMinutes, clockTime } from "./gantt-utils"
import { formatMoment, registrationState, type RegistrationState, type RegistrationWindow } from "./registration-window"
import { localDay } from "./day-of"

export const NEED_CAPACITY_DEFAULT = 2
export const NEED_DURATION_MINUTES = 120

export type NeedWindow = { date: string; startTime: string; endTime: string }

/**
 * The start offered by the form: `now` rounded down to the previous quarter hour, so the need
 * starts now or a few minutes ago (never in the future by default), and the end two hours later.
 * The date stays the local day: rounding down never crosses midnight.
 */
export function defaultNeedWindow(now: Date, timeZone: string): NeedWindow {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0")
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0")
  const startMinute = Math.floor((hour * 60 + minute) / 15) * 15
  const startTime = clockTime(`${String(Math.floor(startMinute / 60)).padStart(2, "0")}:${String(startMinute % 60).padStart(2, "0")}`)
  return { date: localDay(now, timeZone), startTime, endTime: addMinutes(startTime, NEED_DURATION_MINUTES) }
}

/**
 * Why nobody can be notified when the shift is created but registrations are closed (#1304):
 * names what blocks — the switch, an opening date not reached, a closing date passed — so the
 * organiser can open them. Null while registrations are open.
 */
export function notificationBlockedText(state: RegistrationState, timeZone: string): string | null {
  if (state.open) return null
  switch (state.reason) {
    case "not_yet":
      return `Les inscriptions ne sont pas encore ouvertes : leur date d'ouverture, le ${formatMoment(state.opensAt!, timeZone)}, n'est pas atteinte. Personne ne peut être prévenu par email tant qu'elles ne le sont pas.`
    case "ended":
      return `Les inscriptions sont fermées : leur date de fermeture, le ${formatMoment(state.closesAt!, timeZone)}, est passée. Personne ne peut être prévenu par email tant qu'elles ne sont pas rouvertes.`
    case "closed":
      return "Les inscriptions sont fermées : la case « Inscriptions ouvertes » de l'événement est décochée. Personne ne peut être prévenu par email tant que vous ne la cochez pas."
    default:
      return "L'événement n'est pas publié : les inscriptions ne sont pas ouvertes, donc personne ne peut être prévenu par email."
  }
}

/** Convenience for the page: the refusal sentence from the event's window, or null. */
export function needSendBlockedText(event: RegistrationWindow, now: Date, timeZone: string): string | null {
  return notificationBlockedText(registrationState(event, now), timeZone)
}

/** What the board says once the shift exists: shown, counted later, or hidden by a filter. */
export function needCreatedAnnouncement(input: {
  name: string
  hours: string
  missing: number
  phase: "in_progress" | "upcoming" | "earlier" | "later" | null
  laterCount: number
  hiddenBySearch: boolean
  hiddenBySector: boolean
}): string {
  const places = `Il manque ${input.missing} personne${input.missing > 1 ? "s" : ""}.`
  const head = `Nouveau créneau : ${input.name}, ${input.hours}. ${places}`
  if (input.phase === null) return `${head} Il n'est pas dans la fenêtre affichée du jour J.`
  if (input.phase === "later") {
    return `${head} Il commence dans plus de 3 heures : il est compté dans « Encore ${input.laterCount} créneau${input.laterCount > 1 ? "x" : ""} plus tard aujourd'hui », pas listé.`
  }
  if (input.hiddenBySearch) return `${head} Il est masqué par la recherche en cours : effacez-la pour le voir.`
  if (input.hiddenBySector) return `${head} Il est masqué par le filtre de secteur : choisissez « Tous les secteurs » pour le voir.`
  return `${head} Il est affiché sur le tableau.`
}
