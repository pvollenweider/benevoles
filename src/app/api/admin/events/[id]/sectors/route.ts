// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { createSector } from "@/lib/sector-adoption"
import { sectorName, SECTOR_NAME_MAX, SECTOR_NAME_TAKEN_ERROR } from "@/lib/sectors"

/**
 * The sectors of an event (#1147, beta). GET lists them, archived ones included, with the event's
 * mode. POST saves a new one; the first one adopts sectors for the event, in the same transaction
 * and under the event's row lock (src/lib/sector-adoption.ts): refused while the option is off or
 * the beta capability cannot be adopted, unless the event already adopted sectors.
 */

const SECTOR_SELECT = { id: true, name: true, displayOrder: true, archivedAt: true } as const

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard
  const { id } = await params

  const event = await db.event.findFirst({ where: { id }, select: { id: true, sectorsEnabled: true, sectorsAdoptedAt: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  const sectors = await db.sector.findMany({ where: { eventId: id }, select: SECTOR_SELECT, orderBy: [{ displayOrder: "asc" }, { name: "asc" }] })
  return NextResponse.json({ sectorsEnabled: event.sectorsEnabled, sectorsAdoptedAt: event.sectorsAdoptedAt, sectors })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard
  const { id } = await params

  const body = await req.json().catch(() => null)
  const name = sectorName((body as { name?: unknown } | null)?.name)
  if (!name) return NextResponse.json({ error: `Indiquez le nom du secteur (${SECTOR_NAME_MAX} caractères au plus).`, field: "name" }, { status: 400 })

  const event = await db.event.findFirst({ where: { id }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const result = await createSector(db, organizationId, id, name)
  if (!result.ok) return NextResponse.json({ error: result.error, ...(result.error === SECTOR_NAME_TAKEN_ERROR ? { field: "name" } : {}) }, { status: result.status })

  const actor = adminActor(guard.session)
  const { sector, adopted } = result.value
  await logEvent({ eventId: id, actor, action: "sector.created", entityType: "Sector", entityId: sector.id, changes: { name: { from: null, to: sector.name } } })
  if (adopted) await logEvent({ eventId: id, actor, action: "event.sectors_adopted", entityType: "Event", entityId: id })
  return NextResponse.json({ sector, adopted }, { status: 201 })
}
