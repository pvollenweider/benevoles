// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"

// Page ids only, bounded: each one becomes a scoped update below.
const schema = z.object({ pageIds: z.array(z.string().min(1).max(64)).max(200) })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)
  const { pageIds } = parsed.data

  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  await Promise.all(
    pageIds.map((pageId, index) =>
      db.eventPage.updateMany({
        where: { id: pageId, eventId },
        data: { displayOrder: index },
      })
    )
  )

  return NextResponse.json({ success: true })
}
