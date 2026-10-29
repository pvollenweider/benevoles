// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { orderedPlaces, placeName, placeNameTaken, PLACE_NAME_MAX, PLACE_NAME_TAKEN_ERROR } from "@/lib/places"

/**
 * The places of an event (#1171, lot 2): where missions happen, for the travel margin of the
 * workload protection. GET lists them, archived ones included; POST adds one at the end. Names are
 * unique among the active places (case and spaces ignored), also enforced by the database.
 */

export const PLACE_SELECT = { id: true, name: true, displayOrder: true, archivedAt: true } as const

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard
  const { id } = await params
  const event = await db.event.findFirst({ where: { id }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  const places = await db.eventPlace.findMany({ where: { eventId: id }, select: PLACE_SELECT })
  return NextResponse.json({ places: orderedPlaces(places) })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard
  const { id } = await params

  const body = await req.json().catch(() => null)
  const name = placeName((body as { name?: unknown } | null)?.name)
  if (!name) return NextResponse.json({ error: `Indiquez le nom du lieu (${PLACE_NAME_MAX} caractères au plus).`, field: "name" }, { status: 400 })

  const event = await db.event.findFirst({ where: { id }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const existing = await db.eventPlace.findMany({ where: { eventId: id }, select: PLACE_SELECT })
  if (placeNameTaken(existing, name)) return NextResponse.json({ error: PLACE_NAME_TAKEN_ERROR, field: "name" }, { status: 409 })
  let place
  try {
    place = await db.eventPlace.create({
      data: { eventId: id, name, displayOrder: existing.reduce((n, p) => Math.max(n, p.displayOrder + 1), 0) },
      select: PLACE_SELECT,
    })
  } catch (e) {
    // Two organisers adding the same name at once: the database's index decides.
    if (isUniqueViolation(e)) return NextResponse.json({ error: PLACE_NAME_TAKEN_ERROR, field: "name" }, { status: 409 })
    throw e
  }
  await logEvent({ eventId: id, actor: adminActor(guard.session), action: "place.created", entityType: "EventPlace", entityId: place.id, changes: { name: { from: null, to: place.name } } })
  return NextResponse.json({ place }, { status: 201 })
}
