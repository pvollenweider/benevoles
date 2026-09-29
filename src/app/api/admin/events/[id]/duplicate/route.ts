// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { slugify } from "@/lib/utils"
import { duplicateOptionsSchema, duplicatePlan } from "@/lib/event-duplicate"
import { addSectorLeader } from "@/lib/admin-registration-actions"
import { adminActor } from "@/lib/event-log"
import { validationError } from "@/lib/api-error"

/**
 * Duplicates an event as a draft (#378): title, new start date (every date moves by the same
 * offset) and what to copy come from the body; an empty body means the defaults (everything but
 * the sector leaders, same dates). Registrations never follow.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId, session } = guard

  const { id } = await params

  const raw = await req.text()
  const parsed = duplicateOptionsSchema.safeParse(raw ? JSON.parse(raw) : {})
  if (!parsed.success) return validationError(parsed.error)

  const source = await db.event.findFirst({
    where: { id },
    include: {
      // Deleting a shift is a soft-cancel (status: "cancelled"), never a real delete — see
      // ShiftsManager.handleDeleteShift / DELETE /api/admin/shifts/[id]. Duplicating used to copy
      // every shift regardless of status and force it back to "open", resurrecting shifts the
      // admin had already removed from the source event (#216).
      shifts: { where: { status: { not: "cancelled" } } },
      pages: { orderBy: { displayOrder: "asc" } },
      sectorLeaders: { select: { roleName: true, name: true, email: true } },
      organization: { select: { slug: true } },
    },
  })

  if (!source) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const plan = duplicatePlan({ ...source, leaders: source.sectorLeaders }, parsed.data)

  let slug = slugify(plan.event.title)
  const existing = await db.event.findFirst({ where: { slug } })
  if (existing) slug = `${slug}-${Date.now()}`

  const newEvent = await db.event.create({
    data: {
      slug,
      organizationId,
      ...plan.event,
      publicStatus: "draft",
      // The unlisted choice is a deliberate decision per event, never copied.
      isListed: true,
      shifts: { create: plan.shifts },
      pages: { create: plan.pages },
    },
  })

  // Each leader gets a fresh link and their invite email, exactly as when added by hand.
  for (const leader of plan.leaders) {
    await addSectorLeader(
      db,
      { organizationId, actor: adminActor(session), event: { id: newEvent.id, title: newEvent.title, organization: source.organization } },
      leader,
    )
  }

  return NextResponse.json(newEvent, { status: 201 })
}
