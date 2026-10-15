// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { z } from "zod"
import { validationError } from "@/lib/api-error"
import { checkMilestoneOwner, MILESTONE_OWNER_SELECT } from "@/lib/milestone-owner"

const postSchema = z.object({
  title: z.string().min(1).max(140),
  dueDate: z.coerce.date(),
  // An admin account of the organisation (#985); null or absent for none.
  ownerId: z.string().min(1).max(64).nullable().optional(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const milestones = await db.eventMilestone.findMany({
    where: { eventId },
    orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
    include: { owner: MILESTONE_OWNER_SELECT },
  })
  return NextResponse.json(milestones)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const { id: eventId } = await params
  const body = await req.json()
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)

  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const ownerId = parsed.data.ownerId ?? null
  if (ownerId) {
    const refused = await checkMilestoneOwner(db, organizationId, ownerId)
    if (refused) return refused
  }

  const milestone = await db.eventMilestone.create({
    data: { eventId, title: parsed.data.title, dueDate: parsed.data.dueDate, ownerId },
    include: { owner: MILESTONE_OWNER_SELECT },
  })

  await logEvent({
    eventId,
    actor: adminActor(guard.session),
    action: "eventmilestone.created",
    entityType: "EventMilestone",
    entityId: milestone.id,
    changes: {
      title: { from: null, to: milestone.title },
      dueDate: { from: null, to: milestone.dueDate.toISOString() },
      // The id only: the log reader shows the account's current name (no name stored, #985).
      ...(ownerId ? { ownerId: { from: null, to: ownerId } } : {}),
    },
  })

  return NextResponse.json(milestone, { status: 201 })
}
