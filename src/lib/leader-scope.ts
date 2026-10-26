// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { roleSectorOf, type RoleSettingsShift } from "./role-settings"

/**
 * What a leader is responsible for (#1169): one poste (`roleName`, every leader before #1169) or
 * one sector of the event (`sectorId`, beta, once the event adopted sectors). Exactly one of the
 * two is set (database check "SectorLeader_scope_check").
 *
 * A sector leader covers every poste whose CURRENT sector is theirs, computed at each request with
 * the poste's majority rule (roleSectorOf, src/lib/role-settings.ts): a poste moved out of the
 * sector drops out of the leader's page and emails on the next request (B02), a poste added to
 * it comes in. An archived sector covers nothing: archiving already moves its postes to « Sans
 * secteur » (src/lib/sector-adoption.ts), and the scope also refuses an archived or unknown
 * sector, so a race never leaks a poste. The leader keeps their row and link; a restored sector
 * covers what the organiser places in it again.
 *
 * Being named leader takes no place, creates no registration and counts no hours (B01): nothing
 * here touches registrations. Pure, no Prisma import: client components read the labels.
 */

export type LeaderScopeRow = { roleName: string | null; sectorId?: string | null }

export type LeaderScope = { kind: "poste"; roleName: string } | { kind: "sector"; sectorId: string }

/** The scope of a leader row; null for a malformed row (neither set), which then covers nothing. */
export function leaderScopeOf(row: LeaderScopeRow): LeaderScope | null {
  if (row.sectorId) return { kind: "sector", sectorId: row.sectorId }
  if (row.roleName) return { kind: "poste", roleName: row.roleName }
  return null
}

/** Each poste's current sector and the sectors that can cover postes (active ones). */
export type PosteSectors = {
  sectorOf: Map<string, string | null>
  activeSectorIds: Set<string>
}

/**
 * The postes' sectors of an event, from its live shifts (status not « cancelled ») with the
 * majority rule, and its active sectors. An event without sectors gives empty maps: only poste
 * leaders cover anything there.
 */
export function posteSectorsOf(
  liveShifts: Pick<RoleSettingsShift, "roleName" | "sectorId" | "updatedAt">[],
  sectors: { id: string; archivedAt?: Date | string | null }[],
): PosteSectors {
  const byRole = new Map<string, Pick<RoleSettingsShift, "roleName" | "sectorId" | "updatedAt">[]>()
  for (const s of liveShifts) {
    const list = byRole.get(s.roleName) ?? []
    list.push(s)
    byRole.set(s.roleName, list)
  }
  const sectorOf = new Map<string, string | null>()
  for (const [role, shifts] of byRole) sectorOf.set(role, roleSectorOf(shifts))
  return { sectorOf, activeSectorIds: new Set(sectors.filter((s) => !s.archivedAt).map((s) => s.id)) }
}

/**
 * The postes a leader covers, sorted: their poste, or every poste currently in their active
 * sector. Empty for an archived or unknown sector.
 */
export function scopeRoleNames(row: LeaderScopeRow, ctx: PosteSectors): string[] {
  const scope = leaderScopeOf(row)
  if (!scope) return []
  if (scope.kind === "poste") return [scope.roleName]
  if (!ctx.activeSectorIds.has(scope.sectorId)) return []
  return [...ctx.sectorOf].filter(([, sectorId]) => sectorId === scope.sectorId).map(([role]) => role).sort((a, b) => a.localeCompare(b, "fr"))
}

/** Whether the leader covers the poste `roleName`. */
export function leaderCoversRole(row: LeaderScopeRow, roleName: string, ctx: PosteSectors): boolean {
  const scope = leaderScopeOf(row)
  if (!scope) return false
  if (scope.kind === "poste") return scope.roleName === roleName
  return ctx.activeSectorIds.has(scope.sectorId) && ctx.sectorOf.get(roleName) === scope.sectorId
}

/**
 * The postes with a leader, for the dashboards' « postes sans responsable » (#1169): a poste counts
 * as covered by its own leader or by its sector's. `liveShifts` are the event's live shifts.
 */
export function leaderRoleNamesOf(
  leaders: LeaderScopeRow[],
  liveShifts: Pick<RoleSettingsShift, "roleName" | "sectorId" | "updatedAt">[],
  sectors: { id: string; archivedAt?: Date | string | null }[] | null | undefined,
): string[] {
  return coveredRoleNames(leaders, posteSectorsOf(leaders.some((l) => l.sectorId) ? liveShifts : [], sectors ?? []))
}

/** Every poste covered by at least one of the leaders: what the dashboards count as « with a leader ». */
export function coveredRoleNames(rows: LeaderScopeRow[], ctx: PosteSectors): string[] {
  const covered = new Set<string>()
  for (const row of rows) for (const role of scopeRoleNames(row, ctx)) covered.add(role)
  return [...covered]
}

/**
 * The leaders to notify about the poste `roleName` (new registration, withdrawal): every leader
 * whose scope covers it, once per address (case and spaces ignored). When one address leads both
 * the poste and its sector, the sector's row is kept: its page includes the poste.
 */
export function leadersToNotify<T extends LeaderScopeRow & { email: string }>(rows: T[], roleName: string, ctx: PosteSectors): T[] {
  const byEmail = new Map<string, T>()
  for (const row of rows) {
    if (!leaderCoversRole(row, roleName, ctx)) continue
    const key = row.email.trim().toLowerCase()
    const kept = byEmail.get(key)
    if (!kept || (!kept.sectorId && row.sectorId)) byEmail.set(key, row)
  }
  return [...byEmail.values()]
}

/**
 * Labels (owner decision 2026-10-26): an event without sectors keeps « responsable de secteur »
 * everywhere, nothing renamed. Once the event adopted sectors, a poste leader is a « Responsable de
 * poste » and a sector leader a « Responsable de secteur ».
 */
export const SECTOR_LEADERS_CLOSED_ERROR = "Les responsables de secteur ne sont pas disponibles pour votre organisation : ils font partie des fonctions bêta (Paramètres)."

export const LEGACY_LEADERS_TITLE = "Responsables de secteur"
export const POSTE_LEADER_TITLE = "Responsable de poste"
export const SECTOR_LEADER_TITLE = "Responsable de secteur"

/** The title of one leader: null in an event without sectors (the wording of before #1169 applies). */
export function leaderTitle(row: LeaderScopeRow, sectorsAdopted: boolean): string | null {
  if (!sectorsAdopted) return null
  return row.sectorId ? SECTOR_LEADER_TITLE : POSTE_LEADER_TITLE
}

/** The heading of the leader's page: « Responsable · Bar » without sectors, « Responsable de poste · Bar » or « Responsable de secteur · Parking » with them. */
export function leaderPageHeading(scopeName: string, kind: "poste" | "sector", sectorsAdopted: boolean): string {
  if (!sectorsAdopted) return `Responsable · ${scopeName}`
  return `${kind === "sector" ? SECTOR_LEADER_TITLE : POSTE_LEADER_TITLE} · ${scopeName}`
}

/**
 * What a leader's emails say of their scope: `roleName` is the poste's or the sector's name (the
 * key the templates read since #186), `scopeKind` « sector » for a sector leader. A row whose
 * sector is not loaded falls back to an empty name rather than « null ».
 */
export function leaderInviteScope(row: { roleName: string | null; sector?: { name: string } | null }): { roleName: string; scopeKind?: "sector" } {
  if (row.roleName) return { roleName: row.roleName }
  return { roleName: row.sector?.name ?? "", scopeKind: "sector" }
}

/** The day key of a shift date (« YYYY-MM-DD »), what the leader page's day filter compares. */
export function dayKey(date: Date | string): string {
  return (typeof date === "string" ? date : date.toISOString()).slice(0, 10)
}
