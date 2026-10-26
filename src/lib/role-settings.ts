// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { roleLimits } from "./role-limit"
import { reservedRoles } from "./role-reservation"
import { roleAssignedOnly } from "./role-assignment"
import { roleOverlapAllowed } from "./shift-overlap"

/**
 * The settings of a poste (#1002). A poste has no table of its own: it is the roleName shared by
 * shifts of one event, and its settings are stored on every one of its shifts by « Gérer les
 * postes » (colour #219, limit per volunteer #466, reserved access #470, cumulable #986, assigned by
 * the organisation only #1145, order #215). A shift created in an existing poste (single, series, recurring permanence, duplicate) or
 * moved to one takes these values, so the poste keeps one value per setting. A poste without live
 * shift (new, or deleted then recreated under the same name) has none: the caller keeps its defaults.
 *
 * Shifts created before #1002 may disagree (a colour or a limit set, then shifts added without it).
 * The value read is the one already in force for the poste, never a silent rewrite of its shifts:
 * - limit per volunteer: the smallest one set (what sign-up enforces, `roleLimits`);
 * - reserved access: every tag set on any of its shifts (what sign-up enforces, `reservedRoles`);
 * - cumulable: only when every shift is (`roleOverlapAllowed`, #986);
 * - assigned by the organisation only: as soon as one shift is (`roleAssignedOnly`, #1145), what the
 *   public page and the sign-up enforce;
 * - order: the smallest displayOrder (how the timelines and exports order postes);
 * - colour: the colour set on most shifts, shifts without a colour ignored; on a tie, the colour of
 *   the most recently updated of the tied shifts, then the first key in alphabetical order;
 * - sector (#1147): the same rule as the colour, on `sectorId`. The role route sets it on every shift
 *   of the poste, so a disagreement only comes from a race (a shift created while the sector was
 *   being changed): the sector most shifts carry wins, shifts « Autres postes » are ignored, and the
 *   poste falls back to « Autres postes » only when none has one. Since #1169 a sector leader's
 *   read-only access follows it too (src/lib/leader-scope.ts): the value in force for most of the
 *   poste is the one every view reads, so the leader sees exactly what the organisers' grouping shows.
 *   An archived or unknown sector is shown as « Autres postes » (src/lib/sectors.ts).
 * Pure, no Prisma import.
 */
export type RoleSettings = {
  colorKey: string | null
  maxPerVolunteer: number | null
  reservedTags: string[]
  overlapAllowed: boolean
  assignedOnly: boolean
  displayOrder: number
  /** Sector of the poste (#1147), null = « Autres postes ». */
  sectorId: string | null
}

export type RoleSettingsShift = {
  roleName: string
  colorKey?: string | null
  maxPerVolunteer?: number | null
  reservedTags?: string[] | null
  overlapAllowed?: boolean | null
  assignedOnly?: boolean | null
  displayOrder?: number | null
  sectorId?: string | null
  updatedAt?: Date | string | null
}

/** The live shifts of a poste on an event, the ones its settings are read from. */
export function liveRoleShifts(eventId: string, roleName: string) {
  return { eventId, roleName, status: { not: "cancelled" } }
}

/** What the routes read for `roleSettingsOf`. */
export const ROLE_SETTINGS_SELECT = {
  roleName: true, colorKey: true, maxPerVolunteer: true, reservedTags: true, overlapAllowed: true, assignedOnly: true, displayOrder: true, sectorId: true, updatedAt: true,
} as const

const time = (d: Date | string | null | undefined) => (d == null ? 0 : new Date(d).getTime())

/**
 * The value set on most shifts, shifts without one ignored; tie: the most recently updated of the
 * tied shifts, then alphabetical. Null when none is set. Shared by the colour and the sector.
 */
export function mostSetValue(shifts: RoleSettingsShift[], valueOf: (s: RoleSettingsShift) => string | null | undefined): string | null {
  const tally = new Map<string, { count: number; latest: number }>()
  for (const s of shifts) {
    const value = valueOf(s)
    if (!value) continue
    const entry = tally.get(value) ?? { count: 0, latest: 0 }
    entry.count++
    entry.latest = Math.max(entry.latest, time(s.updatedAt))
    tally.set(value, entry)
  }
  let best: [string, { count: number; latest: number }] | null = null
  for (const candidate of tally) {
    if (!best) { best = candidate; continue }
    const [key, { count, latest }] = candidate
    const [bestKey, b] = best
    if (count > b.count || (count === b.count && (latest > b.latest || (latest === b.latest && key < bestKey)))) best = candidate
  }
  return best?.[0] ?? null
}

/** The colour set on most shifts; tie: the most recently updated, then alphabetical. Null when none is set. */
export function roleColorOf(shifts: RoleSettingsShift[]): string | null {
  return mostSetValue(shifts, (s) => s.colorKey)
}

/** The sector of a poste from its shifts (#1147): the same rule as the colour. Null = « Autres postes ». */
export function roleSectorOf(shifts: RoleSettingsShift[]): string | null {
  return mostSetValue(shifts, (s) => s.sectorId)
}

/**
 * The settings of the poste `roleName`, from its live shifts (callers pass `liveRoleShifts`), or
 * null when it has none: a new poste keeps the defaults or the values of the form.
 */
export function roleSettingsOf(shifts: RoleSettingsShift[], roleName: string): RoleSettings | null {
  const own = shifts.filter((s) => s.roleName === roleName)
  if (own.length === 0) return null
  return {
    colorKey: roleColorOf(own),
    maxPerVolunteer: roleLimits(own).get(roleName) ?? null,
    reservedTags: reservedRoles(own).get(roleName) ?? [],
    overlapAllowed: roleOverlapAllowed(own, roleName),
    assignedOnly: roleAssignedOnly(own, roleName),
    displayOrder: Math.min(...own.map((s) => s.displayOrder ?? 0)),
    sectorId: roleSectorOf(own),
  }
}
