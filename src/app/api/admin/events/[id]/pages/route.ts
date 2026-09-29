// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { slugify } from "@/lib/utils"
import { adminActor, logEvent } from "@/lib/event-log"
import { z } from "zod"
import { validationError } from "@/lib/api-error"

const postSchema = z.object({
  title: z.string().min(1).max(120),
  content: z.string().max(20000),
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
    data: { eventId, slug, title: parsed.data.title, content: parsed.data.content, displayOrder: nextOrder },
  })

  await logEvent({
    eventId,
    actor: adminActor(guard.session),
    action: "eventpage.created",
    entityType: "EventPage",
    entityId: page.id,
    changes: { title: { from: null, to: page.title }, slug: { from: null, to: page.slug } },
  })

  return NextResponse.json(page, { status: 201 })
}
