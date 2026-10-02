// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { LIVE_STATUSES, OCCUPYING_STATUSES } from "./registration-capacity"
import { dayLabel } from "./action-recap"
import { fmtHour } from "./registrations-list"

/**
 * What a volunteer withdrawing one of their registrations from the personal page does, per
 * status. Every live registration shown on /my can be withdrawn with the personal link, the
 * waitlist included: a waitlist entry the volunteer can see but not leave would keep them
 * receiving offers they no longer want.
 *
 * Pure (no Prisma at runtime): shared by the DELETE route and the /my page.
 */

/** Statuses a volunteer can withdraw with their personal link: every live one. */
export const WITHDRAWABLE_STATUSES = LIVE_STATUSES

export type WithdrawPlan = {
  /**
   * The registration held a spot out of `capacity` (a place, a pending request, or a spot
   * offered from the waitlist): once withdrawn, it goes to the next person on the waitlist.
   * A plain waitlist entry holds none: leaving frees nothing, later entries just move up.
   */
  releasesSpot: boolean
}

/** The plan for withdrawing a registration in this status, or null if it can't be withdrawn. */
export function planVolunteerWithdraw(status: string): WithdrawPlan | null {
  if (!(WITHDRAWABLE_STATUSES as readonly string[]).includes(status)) return null
  return { releasesSpot: (OCCUPYING_STATUSES as readonly string[]).includes(status) }
}

export type WithdrawCopy = {
  /** Visible button label. */
  button: string
  /** Accessible name of the button (names the shift). */
  ariaLabel: string
  /** Title of the confirmation. */
  confirmTitle: string
  /** Body of the confirmation, before and after the shift label. */
  confirmBefore: string
  confirmAfter: string
  /** Label of the confirming button. */
  confirmButton: string
}

/** The words of the withdraw button and its confirmation on /my, by status. */
export function withdrawCopy(status: string, shiftLabel: string): WithdrawCopy {
  if (status === "waiting") {
    return {
      button: "Quitter la liste d'attente",
      ariaLabel: `Quitter la liste d'attente du créneau ${shiftLabel}`,
      confirmTitle: "Quitter la liste d'attente ?",
      confirmBefore: "Tu ne recevras plus de message si une place se libère sur le créneau ",
      confirmAfter: ".",
      confirmButton: "Oui, quitter",
    }
  }
  if (status === "offered") {
    return {
      button: "Refuser la place",
      ariaLabel: `Refuser la place proposée sur le créneau ${shiftLabel}`,
      confirmTitle: "Refuser la place ?",
      confirmBefore: "La place proposée sur le créneau ",
      confirmAfter: " passe à la personne suivante, et tu quittes la liste d'attente.",
      confirmButton: "Oui, refuser",
    }
  }
  if (status === "requested") {
    return {
      button: "Retirer ma demande",
      ariaLabel: `Retirer ma demande pour le créneau ${shiftLabel}`,
      confirmTitle: "Retirer ta demande ?",
      confirmBefore: "Tu retires ta demande pour le créneau ",
      confirmAfter: " : la place qui t'était réservée est libérée.",
      confirmButton: "Oui, retirer",
    }
  }
  return {
    button: "Annuler",
    ariaLabel: `Annuler le créneau ${shiftLabel}`,
    confirmTitle: "Confirmer l'annulation ?",
    confirmBefore: "Tu veux annuler le créneau ",
    confirmAfter: " ?",
    confirmButton: "Oui, annuler",
  }
}

type ShiftWhen = { label: string; date: string; startTime: string; endTime: string }

/** « Bar, samedi 4 juillet, de 10h à 12h » : read in words, no « · » or dash for a screen reader. */
function shiftInWords(s: ShiftWhen): string {
  // The API sends the shift's calendar day as an ISO timestamp at midnight UTC.
  const day = dayLabel(s.date.slice(0, 10))
  return `${s.label}, ${day.charAt(0).toLowerCase()}${day.slice(1)}, de ${fmtHour(s.startTime)} à ${fmtHour(s.endTime)}`
}

/** The page status after a withdrawal, by the status the registration had. */
export function withdrawDoneMessage(status: string, s: ShiftWhen): string {
  const what = shiftInWords(s)
  if (status === "waiting") return `Tu as quitté la liste d'attente : ${what}.`
  if (status === "offered") return `Place refusée : ${what}. Elle passe à la personne suivante.`
  if (status === "requested") return `Demande retirée : ${what}.`
  return `Créneau annulé : ${what}.`
}

/**
 * The card's alert when a withdrawal fails. Each one says that nothing was withdrawn, since the
 * card stays; a 404 means the registration is already gone, so reloading is the way forward.
 */
export function withdrawFailureMessage(i: { status?: number; network?: boolean }): string {
  if (i.network) return "La connexion a échoué : l'annulation n'a peut-être pas été enregistrée. Recharge la page pour vérifier."
  if (i.status === 404) return "Ce créneau était déjà annulé ou n'existe plus. Recharge la page pour voir tes inscriptions à jour."
  if (i.status === 429) return "Trop de tentatives : rien n'a été annulé. Réessaie dans une heure."
  return "L'annulation n'a pas abouti : rien n'a été annulé. Réessaie dans un moment."
}
