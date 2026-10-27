// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Reads the « Secteur » filter of a request (#1170) through the organisation's own client, so a
 * foreign event reads as missing and a foreign sector id as unknown (« Tous les secteurs »).
 * Server only. The rules are in src/lib/sector-filter.ts.
 */

import type { OrgScopedPrisma } from "./prisma-org"
import { posteSectorsOf } from "./leader-scope"
import { sectorsAdopted } from "./sectors"
import { ALL_SECTORS, SECTOR_FILTER_PARAM, parseSectorFilter, postesInSectorFilter, sectorFilterOptions, shiftSectorWhere, registrationSectorWhere, type SectorFilter, type SectorFilterOption } from "./sector-filter"

export type SectorFilterState = {
  /** Whether the event adopted sectors: the filter is offered only then. */
  offered: boolean
  filter: SectorFilter
  /** The select's choices; empty when not offered. */
  options: SectorFilterOption[]
  /** The postes kept, or null for « Tous les secteurs ». */
  postes: string[] | null
  /** The condition to AND into a Shift `where` (`{}` when not filtered). */
  shiftWhere: { roleName?: { in: string[] } }
  /** The condition to AND into a Registration `where` (`{}` when not filtered). */
  registrationWhere: { shift?: { roleName: { in: string[] } } }
}

export const UNFILTERED: SectorFilterState = { offered: false, filter: ALL_SECTORS, options: [], postes: null, shiftWhere: {}, registrationWhere: {} }

/**
 * The filter `raw` (the `secteur` search param) asks for, on the event `eventId`. Null when the
 * event is not one of this organisation's. Each poste's sector is read now, over the event's live
 * shifts (all days), so the filter follows a poste moved since.
 */
export async function loadSectorFilter(db: OrgScopedPrisma, eventId: string, raw: string | string[] | null | undefined): Promise<SectorFilterState | null> {
  const event = await db.event.findFirst({
    where: { id: eventId },
    select: {
      sectorsEnabled: true,
      sectorsAdoptedAt: true,
      sectors: { select: { id: true, name: true, displayOrder: true, archivedAt: true } },
    },
  })
  if (!event) return null
  if (!sectorsAdopted(event)) return UNFILTERED
  const filter = parseSectorFilter(raw, event, event.sectors)
  const options = sectorFilterOptions(event.sectors)
  if (filter.kind === "all") return { offered: true, filter, options, postes: null, shiftWhere: {}, registrationWhere: {} }
  const liveShifts = await db.shift.findMany({
    where: { eventId, status: { not: "cancelled" } },
    select: { roleName: true, sectorId: true, updatedAt: true },
  })
  const { sectorOf, activeSectorIds } = posteSectorsOf(liveShifts, event.sectors)
  const postes = postesInSectorFilter(filter, sectorOf, activeSectorIds)
  return { offered: true, filter, options, postes, shiftWhere: shiftSectorWhere(postes), registrationWhere: registrationSectorWhere(postes) }
}

/**
 * For an export or a data route: no `secteur` param reads nothing more (the route's own event
 * lookup answers 404 for a foreign event); otherwise as loadSectorFilter.
 */
export async function sectorFilterOfRequest(db: OrgScopedPrisma, eventId: string, req: Request): Promise<SectorFilterState | null> {
  const raw = new URL(req.url).searchParams.get(SECTOR_FILTER_PARAM)
  if (!raw?.trim()) return UNFILTERED
  return loadSectorFilter(db, eventId, raw)
}
