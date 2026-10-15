// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, diffFields, logEvent } from "@/lib/event-log"
import { z } from "zod"
import { validationError } from "@/lib/api-error"
import { checkMilestoneOwner, MILESTONE_OWNER_SELECT } from "@/lib/milestone-owner"

const patchSchema = z.object({
  title: z.string().min(1).max(140).optional(),
  dueDate: z.coerce.date().optional(),
  done: z.boolean().optional(),
  // An admin account of the organisation (#985), null to remove the owner.
  ownerId: z.string().min(1).max(64).nullable().optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; milestoneId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const { id: eventId, milestoneId } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)

  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const before = await db.eventMilestone.findFirst({ where: { id: milestoneId, eventId } })
  if (!before) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // Only an owner actually sent is checked: an unchanged edit never re-checks a former owner.
  const { ownerId, ...fields } = parsed.data
  if (ownerId && ownerId !== before.ownerId) {
    const refused = await checkMilestoneOwner(db, organizationId, ownerId)
    if (refused) return refused
  }
  const ownerChanged = ownerId !== undefined && ownerId !== before.ownerId
  const dueDateChanged = fields.dueDate !== undefined && fields.dueDate.getTime() !== before.dueDate.getTime()

  const after = await db.eventMilestone.update({
    where: { id: milestoneId },
    data: {
      ...fields,
      ...(ownerId !== undefined ? { ownerId } : {}),
      // A new owner or a new date gets its own reminder (#985).
      ...(ownerChanged || dueDateChanged ? { ownerRemindedAt: null } : {}),
    },
    include: { owner: MILESTONE_OWNER_SELECT },
  })

  const changes = diffFields(before, after, ["title", "dueDate", "done", "ownerId"])
  if (changes) {
    await logEvent({
      eventId,
      actor: adminActor(guard.session),
      action: "eventmilestone.updated",
      entityType: "EventMilestone",
      entityId: milestoneId,
      changes,
    })
  }

  return NextResponse.json(after)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; milestoneId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId, milestoneId } = await params
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const milestone = await db.eventMilestone.findFirst({ where: { id: milestoneId, eventId } })
  if (!milestone) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  await db.eventMilestone.delete({ where: { id: milestoneId } })

  await logEvent({
    eventId,
    actor: adminActor(guard.session),
    action: "eventmilestone.deleted",
    entityType: "EventMilestone",
    entityId: milestoneId,
    changes: { title: { from: milestone.title, to: null } },
  })

  return NextResponse.json({ success: true })
}
