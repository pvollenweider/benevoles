// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"

const schema = z.object({ ids: z.array(z.string()).min(1).max(20) })

/** New order of an event's active questions (#483): the full list of their ids. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard
  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)

  const active = await db.eventQuestion.findMany({ where: { eventId: id, archivedAt: null }, select: { id: true } })
  const known = new Set(active.map((q) => q.id))
  if (active.length === 0) return NextResponse.json({ error: "Événement introuvable" }, { status: 404 })
  if (parsed.data.ids.length !== known.size || parsed.data.ids.some((q) => !known.has(q))) {
    return NextResponse.json({ error: "La liste des questions a changé : rechargez la page." }, { status: 409 })
  }
  await db.$transaction(parsed.data.ids.map((q, position) => db.eventQuestion.update({ where: { id: q }, data: { position } })))
  return NextResponse.json({ ok: true })
}
