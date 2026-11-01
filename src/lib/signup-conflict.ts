// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { shiftsClash, type OverlapShift } from "./shift-overlap"

/**
 * A public sign-up without proof of the address (AUTHZ-01) that its owner's own registrations stop:
 * already on the shift, an overlap with one of their shifts, their limit of shifts for a poste, or
 * the breaks and workload limits of their schedule or record. The form answers as for any sign-up
 * without proof; only the owner learns, by email, what was not recorded and why.
 */
export type SignupConflict =
  /** `shift` null when the race on the unique index found it, without a label at hand. */
  | { kind: "duplicate"; shift: string | null }
  | { kind: "overlap"; shift: string; held: string }
  | { kind: "role_limit"; roleName: string; max: number }
  | { kind: "workload" }

/** The first asked shift that clashes with a committed one of the volunteer, both named. */
export function overlapConflict(
  existing: { shift: OverlapShift & { label: string } }[],
  asked: (OverlapShift & { label: string })[],
): SignupConflict | null {
  for (const reg of existing) {
    for (const shift of asked) {
      if (shiftsClash(reg.shift, shift)) return { kind: "overlap", shift: shift.label, held: reg.shift.label }
    }
  }
  return null
}

const shiftsWord = (n: number) => `${n} créneau${n > 1 ? "x" : ""}`

/** Why the request was not recorded, as the email says it to the owner. */
export function signupConflictReason(c: SignupConflict): string {
  switch (c.kind) {
    case "duplicate":
      return c.shift === null
        ? "tu as déjà une inscription ou une place en liste d'attente pour l'un de ces créneaux"
        : `tu as déjà une inscription ou une place en liste d'attente pour « ${c.shift} »`
    case "overlap":
      return `le créneau « ${c.shift} » chevauche ton créneau « ${c.held} »`
    case "role_limit":
      return `cette demande dépasserait la limite de ${shiftsWord(c.max)} pour le poste « ${c.roleName} »`
    case "workload":
      return "cette demande ne respecterait pas les pauses et limites de charge applicables à tes inscriptions"
  }
}
