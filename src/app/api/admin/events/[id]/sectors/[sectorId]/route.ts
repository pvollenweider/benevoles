// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { updateSector } from "@/lib/sector-adoption"
import { sectorName, SECTOR_NAME_MAX, SECTOR_NAME_TAKEN_ERROR } from "@/lib/sectors"

/**
 * One sector (#1147): rename, archive, restore. Never deleted. Archiving a sector that still groups
 * postes is refused (409, with the number of postes) unless `detachPostes` says the organiser
 * confirmed: its postes then move to « Sans secteur » in the same transaction.
 */

const patchSchema = z.object({
  name: z.string().optional(),
  archived: z.boolean().optional(),
  detachPostes: z.boolean().optional(),
}).refine((d) => d.name !== undefined || d.archived !== undefined, { message: "Rien à modifier." })

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; sectorId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard
  const { id, sectorId } = await params

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 })
  const name = parsed.data.name === undefined ? undefined : sectorName(parsed.data.name)
  if (name === null) return NextResponse.json({ error: `Indiquez le nom du secteur (${SECTOR_NAME_MAX} caractères au plus).`, field: "name" }, { status: 400 })

  const event = await db.event.findFirst({ where: { id }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const result = await updateSector(db, organizationId, id, sectorId, { name, archived: parsed.data.archived, detachPostes: parsed.data.detachPostes })
  if (!result.ok) {
    return NextResponse.json({
      error: result.error,
      ...("postes" in result ? { postes: result.postes } : {}),
      ...(result.error === SECTOR_NAME_TAKEN_ERROR ? { field: "name" } : {}),
    }, { status: result.status })
  }

  const { sector, change } = result.value
  const actor = adminActor(guard.session)
  if (change.kind === "renamed") {
    await logEvent({ eventId: id, actor, action: "sector.updated", entityType: "Sector", entityId: sector.id, changes: { name: { from: change.from, to: change.to } } })
  } else if (change.kind === "archived") {
    await logEvent({ eventId: id, actor, action: "sector.archived", entityType: "Sector", entityId: sector.id, changes: { name: { from: change.name, to: change.name }, ...(change.postes > 0 ? { postes: { from: change.postes, to: 0 } } : {}) } })
  } else if (change.kind === "restored") {
    await logEvent({ eventId: id, actor, action: "sector.restored", entityType: "Sector", entityId: sector.id, changes: { name: { from: change.name, to: change.name } } })
  }
  return NextResponse.json({ sector, change: change.kind })
}
