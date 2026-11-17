// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { loadAdminShiftLink, shiftShareLinkLogValues, type ShiftShareLinkRow } from "@/lib/shift-share-links-data"

// The only change a shift share link accepts (#1386): « Accepter une inscription même si les
// inscriptions de l'événement sont fermées ». The code never changes, so the URL and the printed QR
// codes keep working. Same level as its creation: organiser.

const eventSelect = { id: true, slug: true, organization: { select: { slug: true } } } as const
const patch = z.object({ acceptsAfterClose: z.boolean() })

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; linkId: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id, linkId } = await params
  const parsed = patch.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Données invalides.", field: "acceptsAfterClose" }, { status: 400 })

  const event = await db.event.findFirst({ where: { id }, select: eventSelect })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  const before: ShiftShareLinkRow | null = await db.shiftShareLink.findFirst({
    where: { id: linkId, eventId: id },
    select: { id: true, shiftId: true, code: true, acceptsAfterClose: true },
  })
  if (!before) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const after: ShiftShareLinkRow = before.acceptsAfterClose === parsed.data.acceptsAfterClose
    ? before
    : await db.shiftShareLink.update({
        where: { id: linkId },
        data: { acceptsAfterClose: parsed.data.acceptsAfterClose },
        select: { id: true, shiftId: true, code: true, acceptsAfterClose: true },
      })

  if (after.acceptsAfterClose !== before.acceptsAfterClose) {
    const from = shiftShareLinkLogValues(before)
    const to = shiftShareLinkLogValues(after)
    await logEvent({
      eventId: id,
      actor: adminActor(guard.session),
      action: "shiftshare.updated",
      entityType: "ShiftShareLink",
      entityId: linkId,
      changes: { acceptsAfterClose: { from: from.acceptsAfterClose, to: to.acceptsAfterClose } },
    })
  }

  return NextResponse.json(await loadAdminShiftLink(db, event, after))
}
