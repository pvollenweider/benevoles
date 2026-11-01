// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"

// Role names only, bounded: each one becomes a scoped update below.
const schema = z.object({ roleOrder: z.array(z.string().min(1).max(500)).max(200) })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error)
  const { roleOrder } = parsed.data

  const owned = await db.event.findFirst({ where: { id }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  await Promise.all(
    roleOrder.map((roleName, index) =>
      db.shift.updateMany({
        where: { eventId: id, roleName, event: { organizationId } },
        data: { displayOrder: index * 100 },
      })
    )
  )

  return NextResponse.json({ success: true })
}
