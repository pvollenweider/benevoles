// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { dayKey } from "./leader-scope"

/**
 * The sector leader's roster (#1169), pure: grouped by poste then by shift, the days it covers,
 * and how many people are signed up. Reads only the rows the API returned, which are already
 * limited to the leader's postes, so nothing here can count another poste (B05).
 */

type Reg = {
  volunteer: { firstName: string; lastName: string; email: string | null }
  shift: { roleName: string; label: string; date: string; startTime: string; endTime: string }
}

/** The days with a sign-up or a shift below its minimum, in order (« YYYY-MM-DD »). */
export function leaderRosterDays(registrations: Reg[], staffing: { date: string }[]): string[] {
  return [...new Set([...registrations.map((r) => dayKey(r.shift.date)), ...staffing.map((s) => dayKey(s.date))])].sort()
}

/**
 * How many people are signed up: one person on two shifts of the sector counts once. People are
 * told apart by name and email (the page has no volunteer id).
 */
export function leaderRosterCount(registrations: Reg[]): number {
  return new Set(registrations.map((r) => `${r.volunteer.firstName}\0${r.volunteer.lastName}\0${(r.volunteer.email ?? "").toLowerCase()}`)).size
}

export type RosterShiftGroup<R> = { label: string; date: string; startTime: string; endTime: string; registrations: R[] }

/**
 * Every poste of the scope in `postes`' order, empty ones included (a gap is information for the
 * leader), each with its shifts in the registrations' order (date, then start).
 */
export function leaderRosterByPoste<R extends Reg>(postes: string[], registrations: R[]): { roleName: string; shifts: RosterShiftGroup<R>[] }[] {
  const byPoste = new Map<string, Map<string, RosterShiftGroup<R>>>(postes.map((p) => [p, new Map()]))
  for (const r of registrations) {
    const shifts = byPoste.get(r.shift.roleName)
    if (!shifts) continue // never a poste outside the scope
    const key = `${r.shift.label}\0${r.shift.date}\0${r.shift.startTime}`
    let group = shifts.get(key)
    if (!group) {
      group = { label: r.shift.label, date: r.shift.date, startTime: r.shift.startTime, endTime: r.shift.endTime, registrations: [] }
      shifts.set(key, group)
    }
    group.registrations.push(r)
  }
  return postes.map((roleName) => ({ roleName, shifts: [...byPoste.get(roleName)!.values()] }))
}
