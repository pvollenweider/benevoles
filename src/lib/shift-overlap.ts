// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { shiftsOverlap } from "./utils"

/**
 * The one overlap rule for a volunteer's shifts (#986). Two shifts clash for the same person when
 * their hours overlap (`shiftsOverlap`: absolute wall-clock intervals, a night shift reaching into
 * the next day, touching ends do not overlap) and neither belongs to a role that allows it
 * (`Shift.overlapAllowed`, « Cumulable avec un autre créneau », set on every shift of the role).
 * One cumulable shift is enough: first aid can run while serving coffee, whichever is cumulable.
 *
 * Used by every check: public sign-up (page and server), manual placement, member merge and the
 * open-shifts finder. Pure, no Prisma import: it runs on the public page too.
 */
export type OverlapShift = {
  date: Date | string
  startTime: string
  endTime: string
  /** The shift's role may overlap another shift (#986). Missing = false, as before the option. */
  overlapAllowed?: boolean | null
}

export function shiftsClash(a: OverlapShift, b: OverlapShift): boolean {
  if (a.overlapAllowed || b.overlapAllowed) return false
  return shiftsOverlap(a, b)
}

/** Overlap the rule lets through: the hours overlap, but one of the roles is cumulable. */
export function allowedOverlap(a: OverlapShift, b: OverlapShift): boolean {
  return !!(a.overlapAllowed || b.overlapAllowed) && shiftsOverlap(a, b)
}

/**
 * The role's value, from all its shifts: cumulable only when every one of them is, so a shift that
 * missed the setting never opens the overlap for the others by surprise, and saving the option
 * again sets it on all of them.
 */
export function roleOverlapAllowed(shifts: { roleName: string; overlapAllowed?: boolean | null }[], roleName: string): boolean {
  const own = shifts.filter((s) => s.roleName === roleName)
  return own.length > 0 && own.every((s) => !!s.overlapAllowed)
}
