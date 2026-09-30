// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { eventArchive, exportFileName } from "@/lib/data-export"

/** Full JSON archive of one event (#384): settings, shifts, registrations, pages, leaders, milestones, log. No token ever. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard
  const { id } = await params

  const event = await db.event.findFirst({
    where: { id },
    include: {
      organization: { select: { name: true, slug: true } },
      shifts: { orderBy: [{ date: "asc" }, { startTime: "asc" }] },
      registrations: { include: { volunteer: true }, orderBy: { createdAt: "asc" } },
      pages: { orderBy: { displayOrder: "asc" } },
      sectorLeaders: { select: { roleName: true, name: true, email: true, createdAt: true }, orderBy: [{ roleName: "asc" }, { createdAt: "asc" }] },
      milestones: { orderBy: { dueDate: "asc" } },
      logs: { orderBy: { createdAt: "asc" } },
    },
  })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const { organization, shifts, registrations, pages, sectorLeaders, milestones, logs, ...rest } = event
  const now = new Date()
  const archive = eventArchive({ organization, event: rest, shifts, registrations, pages, sectorLeaders, milestones, logs, exportedAt: now })
  return new NextResponse(JSON.stringify(archive, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(`${event.title}-archive`, now, "json")}"`,
      "Cache-Control": "no-store",
    },
  })
}
