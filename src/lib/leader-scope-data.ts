// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { leadersToNotify, posteSectorsOf, type PosteSectors } from "./leader-scope"

/**
 * Reads what the leader scope needs for one event (#1169), server only: the live shifts' poste and
 * sector, and the event's sectors. Read at each request, never cached, so a poste moved out of a
 * sector leaves its leaders' scope at once (B02). Works with the global or the org-scoped client.
 */
type ScopeDb = {
  shift: { findMany: (args: { where: object; select: object }) => Promise<{ roleName: string; sectorId: string | null; updatedAt: Date }[]> }
  sector: { findMany: (args: { where: object; select: object }) => Promise<{ id: string; archivedAt: Date | null }[]> }
}

export async function loadPosteSectors(db: unknown, eventId: string): Promise<PosteSectors> {
  const client = db as ScopeDb
  const [shifts, sectors] = await Promise.all([
    client.shift.findMany({ where: { eventId, status: { not: "cancelled" } }, select: { roleName: true, sectorId: true, updatedAt: true } }),
    client.sector.findMany({ where: { eventId }, select: { id: true, archivedAt: true } }),
  ])
  return posteSectorsOf(shifts, sectors)
}

export type NotifiedLeader = {
  id: string
  name: string
  email: string
  roleName: string | null
  sectorId: string | null
  tokenEnc: string | null
  tokenLegacy: string | null
  sector: { name: string } | null
}

type LeaderDb = ScopeDb & {
  sectorLeader: { findMany: (args: { where: object; select: object; orderBy?: object }) => Promise<NotifiedLeader[]> }
}

/**
 * The leaders to tell about a registration or a withdrawal on the poste `roleName` (#1169): the
 * poste's leaders and the leaders of its current sector, once per address (a sector row kept over a
 * poste row of the same address, src/lib/leader-scope.ts leadersToNotify). The scope is read now,
 * so a poste moved out of a sector no longer reaches that sector's leaders.
 */
export async function leadersCoveringRole(db: unknown, eventId: string, roleName: string): Promise<NotifiedLeader[]> {
  const client = db as LeaderDb
  const rows = await client.sectorLeader.findMany({
    where: { eventId, OR: [{ roleName }, { sectorId: { not: null } }] },
    select: { id: true, name: true, email: true, roleName: true, sectorId: true, tokenEnc: true, tokenLegacy: true, sector: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  })
  if (rows.length === 0) return []
  const ctx = rows.some((r) => r.sectorId) ? await loadPosteSectors(db, eventId) : posteSectorsOf([], [])
  return leadersToNotify(rows, roleName, ctx)
}
