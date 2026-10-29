// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { eventSlugFromTitle } from "@/lib/event-slug"
import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { DEFAULT_COPY, duplicatedWorkload, duplicateOptionsSchema, duplicatePlan } from "@/lib/event-duplicate"
import { addSectorLeader } from "@/lib/admin-registration-actions"
import { adminActor } from "@/lib/event-log"
import { validationError } from "@/lib/api-error"
import { deletedPosteNames } from "@/lib/leader-postes"
import { canAdoptBeta } from "@/lib/beta-access"
import { newEventShiftSwapsEnabled } from "@/lib/shift-swap-data"
import { newEventSectorsEnabled } from "@/lib/sector-adoption"
import { newEventWorkload } from "@/lib/workload-policy-data"
import { workloadProtectionShipped } from "@/lib/workload-shipped"
import { orgTimeZone } from "@/lib/time-zone"

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
      questions: { where: { archivedAt: null }, orderBy: { position: "asc" } },
      sectorLeaders: { select: { roleName: true, sectorId: true, name: true, email: true } },
      shiftRecurrences: true,
      sectors: { select: { id: true, name: true, displayOrder: true, archivedAt: true } },
      places: { select: { id: true, name: true, displayOrder: true, archivedAt: true } },
      organization: { select: { slug: true, shiftRosterDefault: true, sectorsDefault: true, shiftSwapsDefault: true, workloadPolicyDefault: true, timeZone: true } },
    },
  })

  if (!source) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // A deleted poste (every shift cancelled) keeps its leaders; they don't follow the copy (#1010).
  // Read only when leaders are to be copied.
  const cancelled = parsed.data.copy?.leaders && source.sectorLeaders.length > 0
    ? await db.shift.findMany({ where: { eventId: id, status: "cancelled" }, select: { roleName: true, status: true }, distinct: ["roleName"] })
    : []
  const deletedPostes = deletedPosteNames([...source.shifts, ...cancelled])

  // Sectors (#1147): an adopted source gives an adopted copy; otherwise the option is a new
  // adoption, read from the beta gate (src/lib/event-duplicate.ts, duplicatedSectors).
  const adopted = !!source.sectorsAdoptedAt
  const [sectorsGate, newEventSectors] = adopted ? [true, false] : await Promise.all([
    source.sectorsEnabled ? canAdoptBeta(organizationId, "sectors") : false,
    newEventSectorsEnabled(organizationId, source.organization.sectorsDefault),
  ])
  // Shift swaps (#1174): the source's option is a new adoption too; no request is ever copied.
  const [swapsGate, newEventSwaps] = await Promise.all([
    source.shiftSwapsEnabled ? canAdoptBeta(organizationId, "shiftSwaps") : false,
    newEventShiftSwapsEnabled(organizationId, source.organization.shiftSwapsDefault),
  ])
  // Workload protection (#1171): with the settings, the source's values (a new adoption, the zone
  // snapshotted again); else the organisation's values for a new event.
  const [workloadGate, newEventWorkloadValue] = await Promise.all([
    workloadProtectionShipped() && source.workloadPolicy != null ? canAdoptBeta(organizationId, "workloadProtection") : false,
    newEventWorkload(organizationId, source.organization),
  ])
  const workload = duplicatedWorkload(source, (parsed.data.copy?.settings ?? DEFAULT_COPY.settings), { gate: workloadGate, newEvent: newEventWorkloadValue, timeZone: orgTimeZone(source.organization) })
  const plan = duplicatePlan({ ...source, leaders: source.sectorLeaders, deletedPostes, recurrences: source.shiftRecurrences, organizationRosterDefault: source.organization.shiftRosterDefault, sectorsGate, newEventSectors, swapsGate, newEventSwaps }, parsed.data)

  // A title whose slug is one of the site's own addresses (/tarifs, /admin…) is refused (src/lib/event-slug.ts).
  const slugged = eventSlugFromTitle(plan.event.title)
  if ("error" in slugged) return NextResponse.json({ error: slugged.error }, { status: 400 })
  let slug = slugged.slug
  const existing = await db.event.findFirst({ where: { slug } })
  if (existing) slug = `${slug}-${Date.now()}`

  // Shifts point to the copies of sectors and places by the plan's ids: written once those exist.
  const withSectors = plan.sectors.length > 0 || plan.places.length > 0
  const newEvent = await db.event.create({
    data: {
      slug,
      organizationId,
      ...plan.event,
      ...workload,
      publicStatus: "draft",
      // The unlisted choice is a deliberate decision per event, never copied.
      isListed: true,
      // With sectors (#1147), the shifts are written once the sectors exist (below): they point
      // to them by the ids of the plan, and a nested write does not promise that order.
      ...(withSectors ? { sectors: { create: plan.sectors }, places: { create: plan.places } } : { shifts: { create: plan.shifts } }),
      pages: { create: plan.pages },
      // One insert: a follow-up (#1016) points to its parent's copy, whose id the plan gave.
      questions: { createMany: { data: plan.questions } },
    },
  })

  if (withSectors && plan.shifts.length > 0) await db.shift.createMany({ data: plan.shifts.map((s) => ({ ...s, eventId: newEvent.id })) })

  // Recurring permanences (#866): the rule, then its regenerated shifts linked to it.
  for (const { rule, shifts } of plan.recurrences) {
    await db.$transaction(async (tx) => {
      const created = await tx.shiftRecurrence.create({ data: { ...rule, eventId: newEvent.id } })
      await tx.shift.createMany({ data: shifts.map((s) => ({ ...s, eventId: newEvent.id, recurrenceId: created.id })) })
    })
  }

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
