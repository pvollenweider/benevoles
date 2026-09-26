import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { adminActor, logEvent } from "@/lib/event-log"
import { cancelShift } from "@/lib/shift-cancel"
import { COLOR_OPTIONS } from "@/lib/roles"

// A "role" only exists implicitly, as the roleName shared by a group of shifts on one event —
// there's no separate Role table. Renaming, recoloring or deleting one therefore means updating
// or cancelling every shift in this event that currently carries that roleName (#218, #219).

const COLOR_KEYS = COLOR_OPTIONS.map((c) => c.key) as [string, ...string[]]

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  colorKey: z.enum(COLOR_KEYS).nullable().optional(),
}).refine((d) => d.name !== undefined || d.colorKey !== undefined, { message: "Rien à modifier." })

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
  const { name: newName, colorKey } = parsed.data

  const owned = await db.event.findFirst({ where: { id }, select: { id: true } })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // eventId is already org-verified above; `event: { organizationId }` here is defense-in-depth
  // on top of that, matching reorder-roles/route.ts's own pattern for the same raw-prisma calls.
  const shifts = await prisma.shift.findMany({
    where: { eventId: id, roleName: decodedRole, event: { organizationId } },
    select: { id: true, colorKey: true },
  })
  if (shifts.length === 0) return NextResponse.json({ error: "Poste introuvable" }, { status: 404 })

  const actor = adminActor(guard.session)

  if (newName !== undefined && newName !== decodedRole) {
    const clash = await prisma.shift.findFirst({ where: { eventId: id, roleName: newName, event: { organizationId } } })
    if (clash) {
      return NextResponse.json({ error: `Le poste « ${newName} » existe déjà — fusionner deux postes par renommage n'est pas pris en charge.` }, { status: 409 })
    }

    await prisma.shift.updateMany({
      where: { eventId: id, roleName: decodedRole, event: { organizationId } },
      data: { roleName: newName },
    })
    // A shift's own label defaults to matching its role name (see ShiftsManager's form) — keep
    // that in sync for shifts that never had a distinct label, in a second pass, since updateMany
    // can't conditionally set "label = new value only where label used to equal the old name".
    await prisma.shift.updateMany({
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
    await prisma.shift.updateMany({
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

  return NextResponse.json({ success: true, updated: shifts.length })
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
  const shifts = await prisma.shift.findMany({
    where: { eventId: id, roleName: decodedRole, status: { not: "cancelled" }, event: { organizationId } },
    include: {
      event: { select: { id: true, title: true, slug: true, organization: { select: { slug: true } } } },
      registrations: { where: { status: "active" }, include: { volunteer: true } },
    },
  })
  if (shifts.length === 0) return NextResponse.json({ error: "Poste introuvable" }, { status: 404 })

  const actor = adminActor(guard.session)
  let cancelledRegistrations = 0
  let notified = 0
  for (const s of shifts) {
    const result = await cancelShift(s, actor)
    cancelledRegistrations += result.cancelledRegistrations
    notified += result.notified
  }

  return NextResponse.json({ success: true, cancelledShifts: shifts.length, cancelledRegistrations, notified })
}
