// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { LIVE_STATUSES, OCCUPYING_STATUSES } from "./registration-capacity"

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
      confirmBefore: "Tu ne seras plus prévenu·e si une place se libère sur le créneau ",
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
