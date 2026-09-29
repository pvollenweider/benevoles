// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { z } from "zod"
import { adminActor, logEvent } from "@/lib/event-log"
import { cancelShift } from "@/lib/shift-cancel"
import { COLOR_OPTIONS } from "@/lib/roles"
import { capacityPlan } from "@/lib/shift-quick-edit"

// A "role" only exists implicitly, as the roleName shared by a group of shifts on one event —
// there's no separate Role table. Renaming, recoloring or deleting one therefore means updating
// or cancelling every shift in this event that currently carries that roleName (#218, #219).

const COLOR_KEYS = COLOR_OPTIONS.map((c) => c.key) as [string, ...string[]]

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  colorKey: z.enum(COLOR_KEYS).nullable().optional(),
  /** Applied to every live shift of the role (#398), never below the people confirmed on a shift. */
  capacity: z.number().int().min(1).optional(),
}).refine((d) => d.name !== undefined || d.colorKey !== undefined || d.capacity !== undefined, { message: "Rien à modifier." })

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; roleName: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const { id, roleName } = await params
  const decodedRole = decodeURIComponent(roleName)

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides." }, { status: 400 })
  }
  const { name: newName, colorKey, capacity } = parsed.data

  const owned = await db.event.findFirst({ where: { id }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // eventId is already org-verified above; `event: { organizationId }` here is defense-in-depth
  // on top of that, matching reorder-roles/route.ts's own pattern for the same raw-prisma calls.
  const shifts = await db.shift.findMany({
    where: { eventId: id, roleName: decodedRole, event: { organizationId } },
    select: { id: true, colorKey: true, capacity: true, status: true, _count: { select: { registrations: { where: { status: "active" } } } } },
  })
  if (shifts.length === 0) return NextResponse.json({ error: "Poste introuvable" }, { status: 404 })

  const actor = adminActor(guard.session)

  if (newName !== undefined && newName !== decodedRole) {
    const clash = await db.shift.findFirst({ where: { eventId: id, roleName: newName, event: { organizationId } } })
    if (clash) {
      return NextResponse.json({ error: `Le poste « ${newName} » existe déjà — fusionner deux postes par renommage n'est pas pris en charge.` }, { status: 409 })
    }

    await db.shift.updateMany({
      where: { eventId: id, roleName: decodedRole, event: { organizationId } },
      data: { roleName: newName },
    })
    // A shift's own label defaults to matching its role name (see ShiftsManager's form) — keep
    // that in sync for shifts that never had a distinct label, in a second pass, since updateMany
    // can't conditionally set "label = new value only where label used to equal the old name".
    await db.shift.updateMany({
      where: { eventId: id, roleName: newName, label: decodedRole, event: { organizationId } },
      data: { label: newName },
    })
    for (const s of shifts) {
      await logEvent({
        eventId: id, actor, action: "shift.updated", entityType: "Shift", entityId: s.id,
        changes: { roleName: { from: decodedRole, to: newName } },
      })
    }
  }

  if (colorKey !== undefined) {
    await db.shift.updateMany({
      where: { eventId: id, roleName: newName ?? decodedRole, event: { organizationId } },
      data: { colorKey },
    })
    for (const s of shifts) {
      await logEvent({
        eventId: id, actor, action: "shift.updated", entityType: "Shift", entityId: s.id,
        changes: { colorKey: { from: s.colorKey, to: colorKey } },
      })
    }
  }

  let keptHigher = 0
  let capacityUpdated = 0
  if (capacity !== undefined) {
    const plan = capacityPlan(
      shifts.filter((s) => s.status !== "cancelled").map((s) => ({ id: s.id, capacity: s.capacity, active: s._count.registrations })),
      capacity,
    )
    keptHigher = plan.keptHigher.length
    capacityUpdated = plan.updates.length
    await db.$transaction(async (tx) => {
      for (const u of plan.updates) await tx.shift.update({ where: { id: u.id }, data: { capacity: u.capacity } })
    })
    for (const u of plan.updates) {
      const before = shifts.find((s) => s.id === u.id)!
      await logEvent({
        eventId: id, actor, action: "shift.updated", entityType: "Shift", entityId: u.id,
        changes: { capacity: { from: before.capacity, to: u.capacity } },
      })
    }
  }

  return NextResponse.json({ success: true, updated: capacity !== undefined ? capacityUpdated : shifts.length, keptHigher })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; roleName: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const { id, roleName } = await params
  const decodedRole = decodeURIComponent(roleName)

  const owned = await db.event.findFirst({ where: { id }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // eventId is already org-verified above; `event: { organizationId }` here is defense-in-depth
  // on top of that, matching reorder-roles/route.ts's own pattern for the same raw-prisma calls.
  const shifts = await db.shift.findMany({
    where: { eventId: id, roleName: decodedRole, status: { not: "cancelled" }, event: { organizationId } },
    include: {
      event: { select: { id: true, title: true, slug: true, organizationId: true, organization: { select: { slug: true } } } },
      registrations: { where: { status: "active" }, include: { volunteer: true } },
    },
  })
  if (shifts.length === 0) return NextResponse.json({ error: "Poste introuvable" }, { status: 404 })

  const actor = adminActor(guard.session)
  let cancelledRegistrations = 0
  let notified = 0
  let unpublished = false
  for (const s of shifts) {
    const result = await cancelShift(s, actor)
    cancelledRegistrations += result.cancelledRegistrations
    notified += result.notified
    unpublished ||= result.unpublished
  }

  return NextResponse.json({ success: true, cancelledShifts: shifts.length, cancelledRegistrations, notified, unpublished })
}
