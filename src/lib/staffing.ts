// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Où manque-t-il encore du monde ? » for one event (#394): shifts and roles grouped by what
 * the organizer has to do about them. Pure; the page reads the facts through the org-scoped
 * client and renders the groups.
 */

export type StaffingShift = {
  id: string
  roleName: string
  label: string
  /** "YYYY-MM-DD" */
  date: string
  startTime: string
  endTime: string
  capacity: number
  /** Active registrations. */
  active: number
  /** Waitlist entries (waiting or offered). */
  waiting: number
  /** Sign-up requests awaiting a decision (#484): they hold their spot, so they aren't missing. */
  requested?: number
  /** Registrations closed by the organizer. */
  closed: boolean
  /** Minimum of people the shift can run with (#949); null or absent = the same as capacity. */
  minVolunteers?: number | null
}

export type StaffingShiftLine = StaffingShift & {
  missing: number
  /** Against the minimum (#949); always set by staffingSummary. */
  state?: StaffingState
}

// ── Minimum per shift (#949) ─────────────────────────────────────────────────────────────────

/**
 * Where a shift stands against its places and its minimum (#949):
 * - "below_minimum": fewer people than the minimum, the shift can't run as is (critical);
 * - "minimum_reached": at least the minimum, not full;
 * - "full": every place taken;
 * - "open": no minimum and not full, as before the minimum existed.
 */
export type StaffingState = "below_minimum" | "minimum_reached" | "full" | "open"

/** The minimum that counts: a whole number from 1 to the places, else none (an invalid value never makes a shift critical). */
export function effectiveMinimum(s: { capacity: number; minVolunteers?: number | null }): number | null {
  const m = s.minVolunteers
  if (m == null || !Number.isInteger(m) || m < 1 || m > s.capacity) return null
  return m
}

/**
 * The state of one shift. Counted as everywhere in « Où manque-t-il du monde ? »: confirmed people
 * plus the sign-up requests awaiting a decision (#484), which hold their spot; the waitlist never
 * counts. A minimum equal to the places gives « below minimum » until the shift is full.
 */
export function shiftStaffingState(s: { capacity: number; minVolunteers?: number | null; active: number; requested?: number }): StaffingState {
  const filled = s.active + (s.requested ?? 0)
  if (filled >= s.capacity) return "full"
  const min = effectiveMinimum(s)
  if (min == null) return "open"
  return filled < min ? "below_minimum" : "minimum_reached"
}

/**
 * The state in words, next to the figures (« 2/4 · minimum atteint »): never told by colour
 * alone. Null without a minimum, so such a shift reads as before.
 */
export function staffingStateText(s: { capacity: number; minVolunteers?: number | null }, state: StaffingState): string | null {
  const min = effectiveMinimum(s)
  if (min == null) return null
  if (state === "below_minimum") return `sous le minimum (${min})`
  if (state === "minimum_reached") return "minimum atteint"
  if (state === "full") return "complet"
  return null
}

/** The same for a screen reader, where « (2) » would be read as a bare number: « sous le minimum de 2 ». */
export function spokenStaffingState(s: { capacity: number; minVolunteers?: number | null }, state: StaffingState): string | null {
  const min = effectiveMinimum(s)
  if (min == null) return null
  if (state === "below_minimum") return `sous le minimum de ${min}`
  return staffingStateText(s, state)
}

/** Why a minimum can't be saved with these places, or null. Empty (null) is always fine: no minimum. */
export function minVolunteersProblem(min: number | null | undefined, capacity: number): string | null {
  if (min == null) return null
  if (!Number.isInteger(min)) return "Le minimum est un nombre entier de personnes. Laissez le champ vide pour ne pas fixer de minimum."
  if (min < 1) return "Le minimum est d'au moins 1 personne. Laissez le champ vide pour ne pas fixer de minimum."
  if (Number.isInteger(capacity) && capacity >= 1 && min > capacity) {
    return `Le minimum (${min}) dépasse les places (${capacity}) : baissez le minimum ou augmentez les places.`
  }
  return null
}

/** A minimum typed in a form: "" is none, anything else a number (checked by minVolunteersProblem). */
export function parseMinVolunteers(raw: string | number | null | undefined): number | null {
  if (raw == null) return null
  if (typeof raw === "number") return raw
  const t = raw.trim()
  return t === "" ? null : Number(t)
}

export type StaffingSummary = {
  /** Roles with no one registered on any shift. */
  emptyRoles: { roleName: string; shiftCount: number; capacity: number }[]
  /**
   * Shifts with free spots, most missing first, then by date; empty roles' shifts included. Shifts
   * below their minimum (#949) come first, in the same order among themselves.
   */
  underfilled: StaffingShiftLine[]
  /** The underfilled shifts below their minimum (#949), in the same order; empty when no shift has one. */
  belowMinimum: StaffingShiftLine[]
  /** At least one live shift has a minimum: the pages then explain the three states. */
  usesMinimum: boolean
  /** Shifts at capacity with nobody waiting (those with a waitlist are in `waitlisted`). */
  full: StaffingShiftLine[]
  /** Shifts with people waiting. */
  waitlisted: StaffingShiftLine[]
  /** Roles without a sector leader (all of them when the event uses none). */
  rolesWithoutLeader: string[]
  usesLeaders: boolean
  totals: { shifts: number; capacity: number; active: number; missing: number; waiting: number; requested: number }
}

const byDate = (a: StaffingShift, b: StaffingShift) =>
  a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.roleName.localeCompare(b.roleName, "fr")

export function staffingSummary(shifts: StaffingShift[], leaderRoles: string[]): StaffingSummary {
  const lines: StaffingShiftLine[] = shifts.map((s) => ({ ...s, missing: Math.max(0, s.capacity - s.active - (s.requested ?? 0)), state: shiftStaffingState(s) }))
  const roles = Array.from(new Set(shifts.map((s) => s.roleName)))

  const emptyRoles = roles
    .filter((r) => shifts.filter((s) => s.roleName === r).every((s) => s.active === 0 && !s.requested))
    .map((r) => {
      const own = shifts.filter((s) => s.roleName === r)
      return { roleName: r, shiftCount: own.length, capacity: own.reduce((n, s) => n + s.capacity, 0) }
    })

  // Below the minimum first (#949). A shift without a minimum needs all its places (its minimum is
  // its capacity), so it is below it as long as it isn't full: it stays among the critical ones,
  // by people missing as before. Only a shift that reached its minimum goes after them.
  const critical = (s: StaffingShiftLine) => (s.state === "minimum_reached" ? 1 : 0)
  const underfilled = lines.filter((s) => s.missing > 0 && !s.closed).sort((a, b) => critical(a) - critical(b) || b.missing - a.missing || byDate(a, b))
  const full = lines.filter((s) => s.missing === 0 && s.waiting === 0).sort(byDate)
  const waitlisted = lines.filter((s) => s.waiting > 0).sort((a, b) => b.waiting - a.waiting || byDate(a, b))

  const leaders = new Set(leaderRoles)
  const rolesWithoutLeader = roles.filter((r) => !leaders.has(r))

  return {
    emptyRoles,
    underfilled,
    belowMinimum: underfilled.filter((s) => s.state === "below_minimum"),
    usesMinimum: lines.some((s) => !s.closed && effectiveMinimum(s) != null),
    full,
    waitlisted,
    rolesWithoutLeader,
    usesLeaders: leaderRoles.length > 0,
    totals: {
      shifts: shifts.length,
      capacity: shifts.reduce((n, s) => n + s.capacity, 0),
      active: shifts.reduce((n, s) => n + s.active, 0),
      missing: lines.reduce((n, s) => n + (s.closed ? 0 : s.missing), 0),
      waiting: shifts.reduce((n, s) => n + s.waiting, 0),
      requested: shifts.reduce((n, s) => n + (s.requested ?? 0), 0),
    },
  }
}

/** « 2 créneaux sont sous leur minimum. » after the headline (#949); null when none is. */
export function belowMinimumSentence(count: number): string | null {
  if (count <= 0) return null
  return count > 1 ? `${count} créneaux sont sous leur minimum.` : "1 créneau est sous son minimum."
}

/** Filled share of a shift or an event, 0–100, for the meters; an empty capacity counts as full. */
export function fillPercent(active: number, capacity: number): number {
  if (capacity <= 0) return 100
  return Math.max(0, Math.min(100, Math.round((active / capacity) * 100)))
}

/** One sentence for the event page: « Il manque encore 12 personnes sur 7 créneaux. » */
export function staffingHeadline(t: StaffingSummary["totals"]): string {
  if (t.shifts === 0) return "Aucun créneau pour l'instant."
  if (t.missing === 0) return "Tous les créneaux sont complets."
  const shifts = t.shifts
  return `Il manque encore ${t.missing} personne${t.missing > 1 ? "s" : ""} sur ${t.capacity} place${t.capacity > 1 ? "s" : ""} (${shifts} créneau${shifts > 1 ? "x" : ""}).`
}
