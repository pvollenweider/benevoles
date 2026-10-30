// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { availabilitySubmissionSchema, submissionIssue } from "@/lib/event-availability"
import { saveAvailabilityAnswers } from "@/lib/event-availability-data"
import { loadPersonAvailability } from "@/lib/event-availability-server"
import type { Tx } from "@/lib/registration-capacity"

/**
 * One person's dated availability on the event (#1146), for its organisers: GET their answer, date
 * by date; PUT an organiser's correction (owner decision 2: allowed after the deadline too, saved as
 * « admin », and it clears a review flag). Event and person of this organisation only.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; volunteerId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id, volunteerId } = await params
  const person = await loadPersonAvailability(guard.db, id, volunteerId)
  if (!person) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  return NextResponse.json(person, { headers: { "Cache-Control": "private, no-store" } })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; volunteerId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id, volunteerId } = await params
  const [event, person] = await Promise.all([
    guard.db.event.findFirst({ where: { id }, select: { id: true } }),
    guard.db.volunteer.findFirst({ where: { id: volunteerId }, select: { id: true } }),
  ])
  if (!event || !person) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  const body = await req.json().catch(() => null)
  const parsed = availabilitySubmissionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json(submissionIssue(parsed.error, body), { status: 400 })
  const result = await guard.db.$transaction((tx) => saveAvailabilityAnswers(tx as unknown as Tx, { eventId: id, volunteerId, days: parsed.data.days, by: "admin" }))
  if (!result.ok) return NextResponse.json({ error: result.error, ...(result.at ? { at: result.at } : {}) }, { status: result.status })
  await logEvent({ eventId: id, actor: adminActor(guard.session), action: "availability.corrected", entityType: "Availability", entityId: volunteerId, changes: { dates: { from: null, to: parsed.data.days.length } } })
  return NextResponse.json(await loadPersonAvailability(guard.db, id, volunteerId))
}
