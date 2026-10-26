// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { canAdoptBeta } from "@/lib/beta-access"
import type { OrgScopedPrisma } from "@/lib/prisma-org"
import {
  firstSectorDecision, isSectorPermutation, sectorNameTaken, sectorsSwitchDecision,
  SECTOR_ARCHIVED_ERROR, SECTOR_NAME_TAKEN_ERROR, SECTOR_NOT_FOUND_ERROR, type SectorsEventState,
} from "@/lib/sectors"

/**
 * Writes of the sectors (#1147), server only. Every change of the event's sector mode goes through
 * one row lock on the Event (`SELECT … FOR UPDATE`), taken first in the transaction:
 * - saving a sector: if the event already adopted sectors, continue (BE06: an event keeps what it
 *   uses after an opt-out or an operator close); else require the option on and the beta gate
 *   (canAdoptBeta, read with the transaction client), then set `sectorsAdoptedAt` with the sector;
 * - switching the option: the same lock, and off is refused once `sectorsAdoptedAt` is set.
 * So a first sector and a switch-off sent at the same time give one consistent result: either the
 * sector is saved and the mode is locked, or the sector is refused and the mode is off (A04,
 * src/__integration__/sectors-adoption.int.test.ts).
 *
 * The raw lock query is not covered by the org-scoped client: it filters on the organisation itself.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any

type LockedEvent = SectorsEventState & { id: string }

export type SectorResult<T> = { ok: true; value: T } | { ok: false; status: 400 | 403 | 404 | 409; error: string }

/** Locks the event's row for the rest of the transaction and reads its sector mode; null when not this organisation's. */
export async function lockEventSectors(tx: Tx, eventId: string, organizationId: string): Promise<LockedEvent | null> {
  const rows: LockedEvent[] = await tx.$queryRaw`SELECT "id", "sectorsEnabled", "sectorsAdoptedAt" FROM "Event" WHERE "id" = ${eventId} AND "organizationId" = ${organizationId} FOR UPDATE`
  return rows[0] ?? null
}

/** Locks one sector's row (archive and poste assignment never cross), checking it belongs to the event. */
async function lockSector(tx: Tx, eventId: string, sectorId: string): Promise<{ id: string; name: string; archivedAt: Date | null } | null> {
  const rows: { id: string; name: string; archivedAt: Date | null }[] = await tx.$queryRaw`SELECT "id", "name", "archivedAt" FROM "Sector" WHERE "id" = ${sectorId} AND "eventId" = ${eventId} FOR UPDATE`
  return rows[0] ?? null
}

const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === "P2002"

/** The beta gate, read only when the decision needs it (a new adoption). */
async function gateFor(tx: Tx, organizationId: string, needed: boolean): Promise<boolean> {
  return needed ? canAdoptBeta(organizationId, "sectors", tx) : true
}

export type CreatedSector = { sector: { id: string; name: string; displayOrder: number; archivedAt: Date | null }; adopted: boolean }

/** Saves a new sector, adopting sectors for the event when it is the first one. */
export async function createSector(db: OrgScopedPrisma, organizationId: string, eventId: string, name: string): Promise<SectorResult<CreatedSector>> {
  try {
    return await db.$transaction(async (tx: Tx): Promise<SectorResult<CreatedSector>> => {
      const event = await lockEventSectors(tx, eventId, organizationId)
      if (!event) return { ok: false, status: 404, error: "Non trouvé" }
      const decision = firstSectorDecision(event, await gateFor(tx, organizationId, !event.sectorsAdoptedAt && event.sectorsEnabled))
      if (!decision.ok) return decision
      const existing = await tx.sector.findMany({ where: { eventId }, select: { id: true, name: true, displayOrder: true, archivedAt: true } })
      if (sectorNameTaken(existing, name)) return { ok: false, status: 409, error: SECTOR_NAME_TAKEN_ERROR }
      const last = Math.max(-1, ...existing.filter((s: { archivedAt: Date | null }) => !s.archivedAt).map((s: { displayOrder: number }) => s.displayOrder))
      const sector = await tx.sector.create({
        data: { eventId, name, displayOrder: last + 1 },
        select: { id: true, name: true, displayOrder: true, archivedAt: true },
      })
      if (decision.adopt) await tx.event.update({ where: { id: eventId }, data: { sectorsAdoptedAt: new Date() } })
      return { ok: true, value: { sector, adopted: decision.adopt } }
    })
  } catch (err) {
    // Two sectors of the same name saved at once: the database's case-insensitive index refuses one.
    if (isUniqueViolation(err)) return { ok: false, status: 409, error: SECTOR_NAME_TAKEN_ERROR }
    throw err
  }
}

/**
 * The option a NEW event starts with (#1147): the organisation's default (Organization.sectorsDefault),
 * only while the capability can be adopted. Changing the default never touches existing events.
 * The gate is read only when the default is on.
 */
export async function newEventSectorsEnabled(organizationId: string, sectorsDefault: boolean | null | undefined): Promise<boolean> {
  return sectorsDefault ? canAdoptBeta(organizationId, "sectors") : false
}

/** Turns « Organiser les postes par secteurs » on or off for the event, under its row lock. */
type SwitchResult = SectorResult<{ sectorsEnabled: boolean; sectorsAdoptedAt: Date | null; changed: boolean }>

export async function setSectorsEnabled(db: OrgScopedPrisma, organizationId: string, eventId: string, enabled: boolean): Promise<SwitchResult> {
  return db.$transaction(async (tx: Tx): Promise<SwitchResult> => {
    const event = await lockEventSectors(tx, eventId, organizationId)
    if (!event) return { ok: false, status: 404, error: "Non trouvé" }
    const needsGate = enabled && !event.sectorsEnabled && !event.sectorsAdoptedAt
    const decision = sectorsSwitchDecision(event, enabled, await gateFor(tx, organizationId, needsGate))
    if (!decision.ok) return decision
    if (decision.change) await tx.event.update({ where: { id: eventId }, data: { sectorsEnabled: enabled } })
    return { ok: true, value: { sectorsEnabled: decision.change ? enabled : event.sectorsEnabled, sectorsAdoptedAt: event.sectorsAdoptedAt ? new Date(event.sectorsAdoptedAt) : null, changed: decision.change } }
  })
}

type SectorRow = { id: string; name: string; displayOrder: number; archivedAt: Date | null }
type UpdateResult = SectorResult<{ sector: SectorRow; change: SectorChange }> | { ok: false; status: 409; error: string; postes: number }

export type SectorChange =
  | { kind: "renamed"; from: string; to: string }
  | { kind: "archived"; name: string; postes: number }
  | { kind: "restored"; name: string }
  | { kind: "none" }

/**
 * Renames, archives or restores a sector. Archiving a sector that holds postes needs
 * `detachPostes` (the organiser confirmed): its postes move to « Sans secteur » in the same
 * transaction, every shift (cancelled ones too) so the poste keeps one value. Without it, 409 with
 * the number of postes. A restored sector comes back empty, at the end of the order.
 */
export async function updateSector(
  db: OrgScopedPrisma, organizationId: string, eventId: string, sectorId: string,
  patch: { name?: string; archived?: boolean; detachPostes?: boolean },
): Promise<UpdateResult> {
  try {
    return await db.$transaction(async (tx: Tx): Promise<UpdateResult> => {
      // The event first, then the sector: the order every sector write takes (no deadlock).
      const event = await lockEventSectors(tx, eventId, organizationId)
      if (!event) return { ok: false, status: 404, error: "Non trouvé" }
      const locked = await lockSector(tx, eventId, sectorId)
      if (!locked) return { ok: false, status: 404, error: SECTOR_NOT_FOUND_ERROR }
      const select = { id: true, name: true, displayOrder: true, archivedAt: true }

      if (patch.archived === true && !locked.archivedAt) {
        const live: { roleName: string }[] = await tx.shift.findMany({ where: { eventId, sectorId, status: { not: "cancelled" } }, select: { roleName: true }, distinct: ["roleName"] })
        if (live.length > 0 && !patch.detachPostes) {
          return { ok: false, status: 409, error: `Ce secteur regroupe encore ${live.length} poste${live.length > 1 ? "s" : ""} : confirmez qu'ils passent dans « Sans secteur ».`, postes: live.length }
        }
        await tx.shift.updateMany({ where: { eventId, sectorId }, data: { sectorId: null } })
        const sector = await tx.sector.update({ where: { id: sectorId }, data: { archivedAt: new Date() }, select })
        return { ok: true, value: { sector, change: { kind: "archived", name: sector.name, postes: live.length } } }
      }

      const all: { id: string; name: string; displayOrder: number; archivedAt: Date | null }[] = await tx.sector.findMany({ where: { eventId }, select })
      if (patch.archived === false && locked.archivedAt) {
        const name = patch.name ?? locked.name
        if (sectorNameTaken(all, name, sectorId)) return { ok: false, status: 409, error: SECTOR_NAME_TAKEN_ERROR }
        const last = Math.max(-1, ...all.filter((s) => !s.archivedAt).map((s) => s.displayOrder))
        const sector = await tx.sector.update({ where: { id: sectorId }, data: { archivedAt: null, name, displayOrder: last + 1 }, select })
        return { ok: true, value: { sector, change: { kind: "restored", name: sector.name } } }
      }

      if (patch.name !== undefined && patch.name !== locked.name) {
        if (locked.archivedAt) return { ok: false, status: 409, error: SECTOR_ARCHIVED_ERROR }
        if (sectorNameTaken(all, patch.name, sectorId)) return { ok: false, status: 409, error: SECTOR_NAME_TAKEN_ERROR }
        const sector = await tx.sector.update({ where: { id: sectorId }, data: { name: patch.name }, select })
        return { ok: true, value: { sector, change: { kind: "renamed", from: locked.name, to: sector.name } } }
      }

      const sector = all.find((s) => s.id === sectorId)!
      return { ok: true, value: { sector, change: { kind: "none" } } }
    })
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, status: 409, error: SECTOR_NAME_TAKEN_ERROR }
    throw err
  }
}

/** Stores a new order of the event's active sectors: the request must list each of them once. */
export async function reorderSectors(db: OrgScopedPrisma, organizationId: string, eventId: string, sectorIds: string[]): Promise<SectorResult<SectorRow[]>> {
  return db.$transaction(async (tx: Tx): Promise<SectorResult<SectorRow[]>> => {
    const event = await lockEventSectors(tx, eventId, organizationId)
    if (!event) return { ok: false, status: 404, error: "Non trouvé" }
    const active: { id: string }[] = await tx.sector.findMany({ where: { eventId, archivedAt: null }, select: { id: true } })
    if (!isSectorPermutation(sectorIds, active.map((s) => s.id))) return { ok: false, status: 400, error: "Indiquez chaque secteur de l'événement une fois." }
    for (const [index, id] of sectorIds.entries()) await tx.sector.update({ where: { id }, data: { displayOrder: index } })
    return { ok: true, value: await tx.sector.findMany({ where: { eventId }, select: { id: true, name: true, displayOrder: true, archivedAt: true }, orderBy: { displayOrder: "asc" } }) }
  })
}

/**
 * Puts every shift of the poste (cancelled ones too, so it keeps one value) in `sectorId`, or in
 * « Sans secteur » with null. The sector is locked and checked first: never an archived sector or
 * another event's. Only for an event that adopted sectors.
 */
export async function assignPosteSector(tx: Tx, organizationId: string, eventId: string, roleName: string, sectorId: string | null): Promise<SectorResult<{ name: string | null }>> {
  const event = await lockEventSectors(tx, eventId, organizationId)
  if (!event) return { ok: false, status: 404, error: "Non trouvé" }
  if (!event.sectorsAdoptedAt) return { ok: false, status: 409, error: "Cet événement n'utilise pas de secteurs : créez d'abord un secteur." }
  let name: string | null = null
  if (sectorId !== null) {
    const sector = await lockSector(tx, eventId, sectorId)
    if (!sector) return { ok: false, status: 404, error: SECTOR_NOT_FOUND_ERROR }
    if (sector.archivedAt) return { ok: false, status: 409, error: SECTOR_ARCHIVED_ERROR }
    name = sector.name
  }
  await tx.shift.updateMany({ where: { eventId, roleName }, data: { sectorId } })
  return { ok: true, value: { name } }
}
