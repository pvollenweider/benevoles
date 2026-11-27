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
 * A whole event may allow overlaps too (#1467, `Event.overlapsAllowed`): when the setting is on,
 * two shifts of that event never clash, whatever their postes. Every caller passes it as
 * `eventOverlapsAllowed`; the per-poste values stay in the database and apply again once it is off.
 * The rule never looks at events itself: callers compare one event only, and a pair of shifts of
 * two different events is never given one of their events' setting (see member merge, the only
 * caller that can hold shifts of several events at once).
 *
 * Used by every check: public sign-up (page and server), manual placement, swaps, proposals,
 * member merge, the registrations list and the open-shifts finder. Pure, no Prisma import: it runs
 * on the public page too.
 */
export type OverlapShift = {
  date: Date | string
  startTime: string
  endTime: string
  /** The shift's role may overlap another shift (#986). Missing = false, as before the option. */
  overlapAllowed?: boolean | null
}

/** `eventOverlapsAllowed`: the event's setting (#1467), passed by every caller. */
export function shiftsClash(a: OverlapShift, b: OverlapShift, eventOverlapsAllowed = false): boolean {
  if (eventOverlapsAllowed) return false
  if (a.overlapAllowed || b.overlapAllowed) return false
  return shiftsOverlap(a, b)
}

/**
 * Overlap the rule lets through: the hours overlap, but the event allows overlaps (#1467) or one of
 * the roles is cumulable.
 */
export function allowedOverlap(a: OverlapShift, b: OverlapShift, eventOverlapsAllowed = false): boolean {
  return (eventOverlapsAllowed || !!(a.overlapAllowed || b.overlapAllowed)) && shiftsOverlap(a, b)
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
