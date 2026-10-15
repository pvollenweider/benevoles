// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { minVolunteersProblem, parseMinVolunteers } from "./staffing"

/**
 * The label, places and minimum typed in the Frise popover (#398, #949), saved when it closes, and
 * before « Voir les inscriptions » leaves the page (#991).
 */

/** What the popover needs of the shift it edits. */
export type PopoverShift = {
  roleName: string
  label: string
  capacity: number
  registrationCount: number
  minVolunteers?: number | null
}

/** The fields as typed: an empty label is the role name, an empty minimum is none. */
export type TypedEdits = { label: string; capacity: number; minimum: string }

export type ClosingPatch = { label: string; capacity?: number; minVolunteers?: number | null }

/**
 * What closing saves: the label always; the places unless under the confirmed people (at least 1);
 * the minimum when it changed. A minimum that does not fit the places saves neither, and
 * `pairProblem` says why, to be announced once the popover is gone.
 */
export function closingPatch(shift: PopoverShift, typed: TypedEdits): { patch: ClosingPatch; pairProblem: string | null } {
  const min = parseMinVolunteers(typed.minimum)
  const capacityOk = typed.capacity >= Math.max(shift.registrationCount, 1)
  const pairProblem = minVolunteersProblem(min, capacityOk ? typed.capacity : shift.capacity)
  const pairOk = pairProblem === null
  const minChanged = min !== (shift.minVolunteers ?? null)
  return {
    patch: {
      label: typed.label.trim() || shift.roleName,
      ...(capacityOk && pairOk ? { capacity: typed.capacity } : {}),
      ...(pairOk && minChanged ? { minVolunteers: min } : {}),
    },
    pairProblem,
  }
}

/**
 * What following « Voir les inscriptions » does with the typed fields (#991):
 * - `follow`: nothing was changed, the link goes on its own;
 * - `save`: the changes are saved first (the same patch as closing), then the link is followed,
 *   only if the save went through;
 * - `fix`: a changed value cannot be saved (places under the confirmed people, a minimum over the
 *   places): the popover stays open on that field, whose message says why. Leaving would lose it.
 */
export type LinkPlan =
  | { kind: "follow" }
  | { kind: "save"; patch: ClosingPatch }
  | { kind: "fix"; field: "capacity" | "minimum" }

export function linkPlan(shift: PopoverShift, typed: TypedEdits): LinkPlan {
  const min = parseMinVolunteers(typed.minimum)
  const labelChanged = (typed.label.trim() || shift.roleName) !== shift.label
  const capacityChanged = typed.capacity !== shift.capacity
  const minChanged = min !== (shift.minVolunteers ?? null)
  if (!labelChanged && !capacityChanged && !minChanged) return { kind: "follow" }
  // Only what was changed can block: a shift already over-booked keeps its places as they are.
  const capacityOk = typed.capacity >= Math.max(shift.registrationCount, 1)
  if (capacityChanged && !capacityOk) return { kind: "fix", field: "capacity" }
  if ((capacityChanged || minChanged) && minVolunteersProblem(min, typed.capacity) !== null) return { kind: "fix", field: "minimum" }
  return { kind: "save", patch: closingPatch(shift, typed).patch }
}
