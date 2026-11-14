// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { slugify } from "@/lib/utils"
import { adminActor, logEvent } from "@/lib/event-log"
import { z } from "zod"
import { validationError } from "@/lib/api-error"
import { cleanPageRoleNames } from "@/lib/event-page-postes"
import { eventPostes } from "@/lib/poste-suggestions"

const postSchema = z.object({
  title: z.string().min(1).max(120),
  content: z.string().max(20000),
  /** Postes whose confirmed volunteers read this page before their shift (#1324); empty allowed. */
  roleNames: z.array(z.string().max(100)).max(100).optional(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const pages = await db.eventPage.findMany({
    where: { eventId },
    orderBy: { displayOrder: "asc" },
  })
  return NextResponse.json(pages)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params
  const body = await req.json()
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)

  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // Only names a live shift still carries: a stale form or a crafted call can't revive a poste.
  const liveShifts = parsed.data.roleNames === undefined
    ? []
    : await db.shift.findMany({ where: { eventId, status: { not: "cancelled" } }, select: { roleName: true, displayOrder: true } })
  const roleNames = cleanPageRoleNames(parsed.data.roleNames ?? [], eventPostes(liveShifts))

  const existing = await db.eventPage.findMany({ where: { eventId }, select: { slug: true, displayOrder: true } })
  const existingSlugs = new Set(existing.map((p) => p.slug))
  const base = slugify(parsed.data.title) || "page"
  let slug = base
  let n = 2
  while (existingSlugs.has(slug)) {
    slug = `${base}-${n}`
    n++
  }
  const nextOrder = existing.length > 0 ? Math.max(...existing.map((p) => p.displayOrder)) + 1 : 0

  const page = await db.eventPage.create({
    data: { eventId, slug, title: parsed.data.title, content: parsed.data.content, displayOrder: nextOrder, roleNames },
  })

  await logEvent({
    eventId,
    actor: adminActor(guard.session),
    action: "eventpage.created",
    entityType: "EventPage",
    entityId: page.id,
    changes: { title: { from: null, to: page.title }, slug: { from: null, to: page.slug }, roleNames: { from: null, to: page.roleNames } },
  })

  return NextResponse.json(page, { status: 201 })
}
