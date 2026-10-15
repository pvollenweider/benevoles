// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { COMMITTED_STATUSES } from "@/lib/registration-capacity"
import { requireOrgSession } from "@/lib/auth-guard"
import { z } from "zod"
import { adminActor, logEvent } from "@/lib/event-log"
import { cancelShift } from "@/lib/shift-cancel"
import { COLOR_OPTIONS } from "@/lib/roles"
import { capacityPlan, roleMinimumPlan } from "@/lib/shift-quick-edit"
import { parseTagList } from "@/lib/role-reservation"
import { removeRoleFromLink, renameRoleInLink } from "@/lib/group-links"
import { leaderRenamePlan } from "@/lib/sector-leader-rename"

/**
 * Share links per group (#947) name their roles: a rename or a deletion is carried into every link
 * of the event that shows the role, so the link keeps its other roles and survives the rename.
 */
async function updateGroupLinks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  eventId: string,
  role: string,
  next: (roleNames: string[]) => string[],
) {
  const links: { id: string; roleNames: string[] }[] = await db.eventGroupLink.findMany({
    where: { eventId, roleNames: { has: role } },
    select: { id: true, roleNames: true },
  })
  for (const l of links) await db.eventGroupLink.update({ where: { id: l.id }, data: { roleNames: next(l.roleNames) } })
}

// A "role" only exists implicitly, as the roleName shared by a group of shifts on one event —
// there's no separate Role table. Renaming, recoloring or deleting one therefore means updating
// or cancelling every shift in this event that currently carries that roleName (#218, #219).

const COLOR_KEYS = COLOR_OPTIONS.map((c) => c.key) as [string, ...string[]]

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  colorKey: z.enum(COLOR_KEYS).nullable().optional(),
  /** Applied to every live shift of the role (#398), never below the people confirmed on a shift. */
  capacity: z.number().int().min(1).optional(),
  /** Minimum of people on every live shift of the role (#949), with or without `capacity`; null removes it. */
  minVolunteers: z.number().nullable().optional(),
  /** Shifts per volunteer on this role (#466); null removes the limit. */
  maxPerVolunteer: z.number().int().min(1).max(100).nullable().optional(),
  /** Tags one of which a member needs for this role (#470); [] opens it to everyone. */
  reservedTags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  /** « Cumulable avec un autre créneau » (#986): the role's shifts may overlap any other shift of a volunteer. */
  overlapAllowed: z.boolean().optional(),
}).refine((d) => d.name !== undefined || d.colorKey !== undefined || d.capacity !== undefined || d.minVolunteers !== undefined || d.maxPerVolunteer !== undefined || d.reservedTags !== undefined || d.overlapAllowed !== undefined, { message: "Rien à modifier." })

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
  const { name: newName, colorKey, capacity, minVolunteers, maxPerVolunteer, overlapAllowed } = parsed.data
  const reservedTags = parsed.data.reservedTags === undefined ? undefined : parseTagList(parsed.data.reservedTags.join(","))

  const owned = await db.event.findFirst({ where: { id }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // eventId is already org-verified above; `event: { organizationId }` here is defense-in-depth
  // on top of that, matching reorder-roles/route.ts's own pattern for the same raw-prisma calls.
  const shifts = await db.shift.findMany({
    where: { eventId: id, roleName: decodedRole, event: { organizationId } },
    select: { id: true, colorKey: true, capacity: true, minVolunteers: true, status: true, maxPerVolunteer: true, reservedTags: true, overlapAllowed: true, _count: { select: { registrations: { where: { status: "active" } } } } },
  })
  if (shifts.length === 0) return NextResponse.json({ error: "Poste introuvable" }, { status: 404 })

  // Places and minimum (#398, #949), planned before anything is written: a minimum above a shift's
  // places refuses the whole request, with its message, rather than half-applying it.
  const live = shifts.filter((s) => s.status !== "cancelled")
  const plan = capacity !== undefined
    ? capacityPlan(live.map((s) => ({ id: s.id, capacity: s.capacity, active: s._count.registrations })), capacity)
    : { updates: [] as { id: string; capacity: number }[], keptHigher: [] as string[] }
  const capacityAfter = new Map(plan.updates.map((u) => [u.id, u.capacity]))
  const minPlan = capacity !== undefined || minVolunteers !== undefined
    ? roleMinimumPlan(live.map((s) => ({ id: s.id, capacity: capacityAfter.get(s.id) ?? s.capacity, minVolunteers: s.minVolunteers })), minVolunteers)
    : { updates: [], problem: null }
  if (minPlan.problem) return NextResponse.json({ error: minPlan.problem }, { status: 400 })

  const actor = adminActor(guard.session)

  if (newName !== undefined && newName !== decodedRole) {
    const clash = await db.shift.findFirst({ where: { eventId: id, roleName: newName, event: { organizationId } } })
    if (clash) {
      return NextResponse.json({ error: `Le poste « ${newName} » existe déjà — fusionner deux postes par renommage n'est pas pris en charge.` }, { status: 409 })
    }

    // Everything matched to the poste by its name moves in one transaction: its shifts, the share
    // links that show it (#947), the questions attached to it (#984, part 3) and its sector
    // leaders (#1001), so its leaders keep their list, its withdrawals and its answer changes.
    const droppedLeaders = await db.$transaction(async (tx) => {
      await tx.shift.updateMany({
        where: { eventId: id, roleName: decodedRole, event: { organizationId } },
        data: { roleName: newName },
      })
      // A shift's own label defaults to matching its role name (see ShiftsManager's form) — keep
      // that in sync for shifts that never had a distinct label, in a second pass, since updateMany
      // can't conditionally set "label = new value only where label used to equal the old name".
      await tx.shift.updateMany({
        where: { eventId: id, roleName: newName, label: decodedRole, event: { organizationId } },
        data: { label: newName },
      })
      await updateGroupLinks(tx, id, decodedRole, (names) => renameRoleInLink(names, decodedRole, newName))
      await tx.eventQuestion.updateMany({ where: { eventId: id, roleName: decodedRole }, data: { roleName: newName } })
      const [moving, atTarget] = await Promise.all([
        tx.sectorLeader.findMany({ where: { eventId: id, roleName: decodedRole }, select: { id: true, email: true } }),
        tx.sectorLeader.findMany({ where: { eventId: id, roleName: newName }, select: { id: true, email: true, roleName: true } }),
      ])
      const { dropIds } = leaderRenamePlan(moving, atTarget)
      if (dropIds.length) await tx.sectorLeader.deleteMany({ where: { id: { in: dropIds } } })
      await tx.sectorLeader.updateMany({ where: { eventId: id, roleName: decodedRole }, data: { roleName: newName } })
      return atTarget.filter((l) => dropIds.includes(l.id))
    })
    for (const s of shifts) {
      await logEvent({
        eventId: id, actor, action: "shift.updated", entityType: "Shift", entityId: s.id,
        changes: { roleName: { from: decodedRole, to: newName } },
      })
    }
    // Same person already leading a poste of the new name: their row there gave way to the renamed one.
    for (const l of droppedLeaders) {
      await logEvent({
        eventId: id, actor, action: "sectorleader.removed", entityType: "SectorLeader", entityId: l.id,
        changes: { roleName: { from: l.roleName, to: null } },
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

  if (maxPerVolunteer !== undefined) {
    // Every shift of the role, cancelled ones too, so the role keeps one value (#466). Registrations
    // already above a new limit stay: the limit applies to the next sign-ups.
    await db.shift.updateMany({
      where: { eventId: id, roleName: newName ?? decodedRole, event: { organizationId } },
      data: { maxPerVolunteer },
    })
    for (const s of shifts.filter((sh) => sh.maxPerVolunteer !== maxPerVolunteer)) {
      await logEvent({
        eventId: id, actor, action: "shift.updated", entityType: "Shift", entityId: s.id,
        changes: { maxPerVolunteer: { from: s.maxPerVolunteer, to: maxPerVolunteer } },
      })
    }
  }

  if (reservedTags !== undefined) {
    // Every shift of the role, so it keeps one value (#470). Registrations already made stay.
    await db.shift.updateMany({
      where: { eventId: id, roleName: newName ?? decodedRole, event: { organizationId } },
      data: { reservedTags },
    })
    for (const s of shifts.filter((sh) => sh.reservedTags.join("|") !== reservedTags.join("|"))) {
      await logEvent({
        eventId: id, actor, action: "shift.updated", entityType: "Shift", entityId: s.id,
        changes: { reservedTags: { from: s.reservedTags, to: reservedTags } },
      })
    }
  }

  if (overlapAllowed !== undefined) {
    // Every shift of the role, cancelled ones too, so the role keeps one value (#986). Turning it
    // off keeps the registrations already made: it applies to the next sign-ups.
    await db.shift.updateMany({
      where: { eventId: id, roleName: newName ?? decodedRole, event: { organizationId } },
      data: { overlapAllowed },
    })
    for (const s of shifts.filter((sh) => sh.overlapAllowed !== overlapAllowed)) {
      await logEvent({
        eventId: id, actor, action: "shift.updated", entityType: "Shift", entityId: s.id,
        changes: { overlapAllowed: { from: s.overlapAllowed, to: overlapAllowed } },
      })
    }
  }

  let keptHigher = 0
  let capacityUpdated = 0
  if (capacity !== undefined || minVolunteers !== undefined) {
    keptHigher = plan.keptHigher.length
    capacityUpdated = plan.updates.length
    // Places and minimum of a shift in one update: the database checks minimum ≤ places per row.
    const minAfter = new Map(minPlan.updates.map((u) => [u.id, u.minVolunteers]))
    const touched = live.filter((s) => capacityAfter.has(s.id) || minAfter.has(s.id))
    await db.$transaction(async (tx) => {
      for (const s of touched) {
        await tx.shift.update({
          where: { id: s.id },
          data: { ...(capacityAfter.has(s.id) ? { capacity: capacityAfter.get(s.id) } : {}), ...(minAfter.has(s.id) ? { minVolunteers: minAfter.get(s.id) } : {}) },
        })
      }
    })
    for (const s of touched) {
      await logEvent({
        eventId: id, actor, action: "shift.updated", entityType: "Shift", entityId: s.id,
        changes: {
          ...(capacityAfter.has(s.id) ? { capacity: { from: s.capacity, to: capacityAfter.get(s.id) } } : {}),
          ...(minAfter.has(s.id) ? { minVolunteers: { from: s.minVolunteers, to: minAfter.get(s.id) } } : {}),
        },
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
      registrations: { where: { status: { in: [...COMMITTED_STATUSES] } }, include: { volunteer: true } },
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
  await updateGroupLinks(db, id, decodedRole, (names) => removeRoleFromLink(names, decodedRole))
  // Questions attached to the role (#984, part 3) go back to the organisers, as a deleted reference would.
  // Its sector leaders stay: deleting a poste cancels its shifts, which keep their name, and the
  // leaders stay attached to it until removed from « Responsables de secteur » (#1001).
  await db.eventQuestion.updateMany({ where: { eventId: id, roleName: decodedRole }, data: { roleName: null } })

  return NextResponse.json({ success: true, cancelledShifts: shifts.length, cancelledRegistrations, notified, unpublished })
}
