// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { COMMITTED_STATUSES } from "@/lib/registration-capacity"
import { listPersonalLimits } from "@/lib/workload-personal-data"

/**
 * Personal workload limits of an event (#1171, lot 2): the people with their own limits, and the
 * people who can be given some (those holding a place or a request). Organisers only; no reason is
 * ever stored or shown.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard
  const { id } = await params
  const event = await db.event.findFirst({ where: { id }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  const regs = await db.registration.findMany({
    where: { eventId: id, status: { in: [...COMMITTED_STATUSES] } },
    select: { volunteerId: true, volunteer: { select: { firstName: true, lastName: true } } },
  })
  const people = [...new Map(regs.map((r) => [r.volunteerId, `${r.volunteer.firstName} ${r.volunteer.lastName}`.trim()])).entries()]
    .map(([volunteerId, name]) => ({ volunteerId, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
  return NextResponse.json({ limits: await listPersonalLimits(db, id), people })
}
