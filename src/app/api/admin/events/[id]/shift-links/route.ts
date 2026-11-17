// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { requireOrgSession } from "@/lib/auth-guard"
import { adminActor, logEvent } from "@/lib/event-log"
import { roleAssignedOnly } from "@/lib/role-assignment"
import { SHIFT_SHARE_ASSIGNED_ONLY_ERROR } from "@/lib/shift-share-links"
import { ensureShiftShareLink, loadAdminShiftLink, shiftShareLinkLogValues } from "@/lib/shift-share-links-data"

// « Partager ce créneau » (#1386): the shift's public link, created on first use. Idempotent: the
// same shift always gives the same link (its URL and printed QR code never change), so a second
// click or a double submit creates nothing and logs nothing. Same level as « Chercher des
// bénévoles » and the rest of the event's planning: organiser (src/lib/permissions.ts).

const eventSelect = { id: true, slug: true, organization: { select: { slug: true } } } as const

const input = z.object({ shiftId: z.string().min(1).max(64) })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params
  const parsed = input.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Données invalides.", field: "shiftId" }, { status: 400 })

  const event = await db.event.findFirst({ where: { id }, select: eventSelect })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // The shift is read through the scoped client: another event's or organisation's shift is unknown.
  const shift = await db.shift.findFirst({
    where: { id: parsed.data.shiftId, eventId: id },
    select: { id: true, roleName: true, status: true },
  })
  if (!shift || shift.status === "cancelled") return NextResponse.json({ error: "Créneau introuvable." }, { status: 404 })

  // A role assigned by the organisation only (#1145) is never offered publicly, so it has no link.
  // The check reads every live shift of the role, like the public page does.
  const roleShifts: { roleName: string; assignedOnly: boolean }[] = await db.shift.findMany({
    where: { eventId: id, status: { not: "cancelled" } },
    select: { roleName: true, assignedOnly: true },
  })
  if (roleAssignedOnly(roleShifts, shift.roleName)) {
    return NextResponse.json({ error: SHIFT_SHARE_ASSIGNED_ONLY_ERROR }, { status: 400 })
  }

  const { link, created } = await ensureShiftShareLink(db, event, shift.id, guard.session.user?.id ?? null)

  if (created) {
    const values = shiftShareLinkLogValues(link)
    await logEvent({
      eventId: id,
      actor: adminActor(guard.session),
      action: "shiftshare.created",
      entityType: "ShiftShareLink",
      entityId: link.id,
      changes: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, { from: null, to: v }])),
    })
  }

  return NextResponse.json(await loadAdminShiftLink(db, event, link), { status: created ? 201 : 200 })
}
