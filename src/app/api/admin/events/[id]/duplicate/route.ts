// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { slugify } from "@/lib/utils"
import { copiedShift } from "@/lib/event-duplicate"

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const { id } = await params

  const source = await db.event.findFirst({
    where: { id },
    // Deleting a shift is a soft-cancel (status: "cancelled"), never a real delete — see
    // ShiftsManager.handleDeleteShift / DELETE /api/admin/shifts/[id]. Duplicating used to copy
    // every shift regardless of status and force it back to "open", resurrecting shifts the
    // admin had already removed from the source event (#216).
    include: { shifts: { where: { status: { not: "cancelled" } } } },
  })

  if (!source) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  let slug = slugify(`${source.title}-copie`)
  const existing = await db.event.findFirst({ where: { slug } })
  if (existing) slug = `${slug}-${Date.now()}`

  const newEvent = await db.event.create({
    data: {
      slug,
      organizationId,
      title: `${source.title} (copie)`,
      description: source.description,
      location: source.location,
      publicStatus: "draft",
      // The unlisted choice is a deliberate decision per event, never copied.
      isListed: true,
      startDate: source.startDate,
      endDate: source.endDate,
      publicInstructions: source.publicInstructions,
      confirmationMessage: source.confirmationMessage,
      requirePhone: source.requirePhone,
      shifts: {
        create: source.shifts.map(copiedShift),
      },
    },
  })

  return NextResponse.json(newEvent, { status: 201 })
}
