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
}

export type StaffingShiftLine = StaffingShift & { missing: number }

export type StaffingSummary = {
  /** Roles with no one registered on any shift. */
  emptyRoles: { roleName: string; shiftCount: number; capacity: number }[]
  /** Shifts with free spots, most missing first, then by date; empty roles' shifts included. */
  underfilled: StaffingShiftLine[]
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
  const lines: StaffingShiftLine[] = shifts.map((s) => ({ ...s, missing: Math.max(0, s.capacity - s.active - (s.requested ?? 0)) }))
  const roles = Array.from(new Set(shifts.map((s) => s.roleName)))

  const emptyRoles = roles
    .filter((r) => shifts.filter((s) => s.roleName === r).every((s) => s.active === 0 && !s.requested))
    .map((r) => {
      const own = shifts.filter((s) => s.roleName === r)
      return { roleName: r, shiftCount: own.length, capacity: own.reduce((n, s) => n + s.capacity, 0) }
    })

  const underfilled = lines.filter((s) => s.missing > 0 && !s.closed).sort((a, b) => b.missing - a.missing || byDate(a, b))
  const full = lines.filter((s) => s.missing === 0 && s.waiting === 0).sort(byDate)
  const waitlisted = lines.filter((s) => s.waiting > 0).sort((a, b) => b.waiting - a.waiting || byDate(a, b))

  const leaders = new Set(leaderRoles)
  const rolesWithoutLeader = roles.filter((r) => !leaders.has(r))

  return {
    emptyRoles,
    underfilled,
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
