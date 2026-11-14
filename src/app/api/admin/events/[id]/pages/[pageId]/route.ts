// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, diffFields, logEvent } from "@/lib/event-log"
import { z } from "zod"
import { validationError } from "@/lib/api-error"
import { cleanPageRoleNames } from "@/lib/event-page-postes"
import { eventPostes } from "@/lib/poste-suggestions"

const patchSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  content: z.string().max(20000).optional(),
  /** Postes whose confirmed volunteers read this page before their shift (#1324); empty allowed. */
  roleNames: z.array(z.string().max(100)).max(100).optional(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; pageId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId, pageId } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)

  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const before = await db.eventPage.findFirst({ where: { id: pageId, eventId } })
  if (!before) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // Only names a live shift still carries (#1324): a stored name no live shift has any more is
  // dropped, as for a group link.
  let roleNames: string[] | undefined
  if (parsed.data.roleNames !== undefined) {
    const liveShifts = await db.shift.findMany({ where: { eventId, status: { not: "cancelled" } }, select: { roleName: true, displayOrder: true } })
    roleNames = cleanPageRoleNames(parsed.data.roleNames, eventPostes(liveShifts))
  }

  const after = await db.eventPage.update({
    where: { id: pageId },
    data: { ...parsed.data, ...(roleNames !== undefined ? { roleNames } : {}) },
  })

  const changes = diffFields(before, after, ["title", "content", "roleNames"])
  if (changes) {
    await logEvent({
      eventId,
      actor: adminActor(guard.session),
      action: "eventpage.updated",
      entityType: "EventPage",
      entityId: pageId,
      // `content` can be large free text; record that it changed, not the text itself, same
      // spirit as the minimal-PII rule elsewhere in the log (nothing sensitive here, but a full
      // page of Markdown in a diff line isn't useful either).
      changes: Object.fromEntries(
        Object.entries(changes).map(([field, v]) => [field, field === "content" ? { from: "(modifié)", to: "(modifié)" } : v]),
      ),
    })
  }

  return NextResponse.json(after)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; pageId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId, pageId } = await params
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const page = await db.eventPage.findFirst({ where: { id: pageId, eventId } })
  if (!page) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  await db.eventPage.delete({ where: { id: pageId } })

  await logEvent({
    eventId,
    actor: adminActor(guard.session),
    action: "eventpage.deleted",
    entityType: "EventPage",
    entityId: pageId,
    changes: { title: { from: page.title, to: null } },
  })

  return NextResponse.json({ success: true })
}
