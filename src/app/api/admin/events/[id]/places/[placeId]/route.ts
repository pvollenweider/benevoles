// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { placeName, placeNameTaken, PLACE_NAME_MAX, PLACE_NAME_TAKEN_ERROR, PLACE_NOT_FOUND_ERROR } from "@/lib/places"

/**
 * One place (#1171, lot 2): rename, archive, restore. Never deleted. An archived place stays on
 * its shifts, which are still checked for the travel margin (Codex): archiving only stops it from
 * being chosen for other shifts. Restoring it is refused while an active place has its name.
 */

const PLACE_SELECT = { id: true, name: true, displayOrder: true, archivedAt: true } as const

const patchSchema = z.object({
  name: z.string().optional(),
  archived: z.boolean().optional(),
}).refine((d) => d.name !== undefined || d.archived !== undefined, { message: "Rien à modifier." })

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; placeId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard
  const { id, placeId } = await params

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Données invalides." }, { status: 400 })
  const name = parsed.data.name === undefined ? undefined : placeName(parsed.data.name)
  if (name === null) return NextResponse.json({ error: `Indiquez le nom du lieu (${PLACE_NAME_MAX} caractères au plus).`, field: "name" }, { status: 400 })

  const event = await db.event.findFirst({ where: { id }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  const places = await db.eventPlace.findMany({ where: { eventId: id }, select: PLACE_SELECT })
  const place = places.find((p) => p.id === placeId)
  if (!place) return NextResponse.json({ error: PLACE_NOT_FOUND_ERROR }, { status: 404 })

  const nextName = name ?? place.name
  const archived = parsed.data.archived ?? !!place.archivedAt
  if (!archived && (name !== undefined || place.archivedAt) && placeNameTaken(places, nextName, place.id)) {
    return NextResponse.json({ error: PLACE_NAME_TAKEN_ERROR, field: "name" }, { status: 409 })
  }
  let saved
  try {
    saved = await db.eventPlace.update({
      where: { id: place.id },
      data: { name: nextName, archivedAt: archived ? place.archivedAt ?? new Date() : null },
      select: PLACE_SELECT,
    })
  } catch (e) {
    if (isUniqueViolation(e)) return NextResponse.json({ error: PLACE_NAME_TAKEN_ERROR, field: "name" }, { status: 409 })
    throw e
  }

  const actor = adminActor(guard.session)
  if (nextName !== place.name) await logEvent({ eventId: id, actor, action: "place.updated", entityType: "EventPlace", entityId: place.id, changes: { name: { from: place.name, to: nextName } } })
  if (archived && !place.archivedAt) await logEvent({ eventId: id, actor, action: "place.archived", entityType: "EventPlace", entityId: place.id, changes: { name: { from: nextName, to: nextName } } })
  if (!archived && place.archivedAt) await logEvent({ eventId: id, actor, action: "place.restored", entityType: "EventPlace", entityId: place.id, changes: { name: { from: nextName, to: nextName } } })
  return NextResponse.json({ place: saved })
}
