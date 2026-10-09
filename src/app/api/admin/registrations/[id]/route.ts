// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { promoteNextInWaitlist } from "@/lib/waitlist"
import { z } from "zod"
import { adminActor, logEvent } from "@/lib/event-log"
import { cancelRegistrations } from "@/lib/admin-registration-actions"
import { isUniqueViolation } from "@/lib/registration-capacity"
import { reportError } from "@/lib/report-error"
import { validationError } from "@/lib/api-error"

const schema = z.object({
  status: z.enum(["active", "cancelled", "deleted"]).optional(),
  comment: z.string().optional().nullable(),
})

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params
  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)

  const owned = await db.registration.findFirst({ where: { id }, select: { id: true, status: true, comment: true } })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })
  // Putting a registration back to a place goes through « Rétablir » (#809), which checks the
  // shift hasn't started and a spot is free, or through the decision on a request (#484): this
  // route would overbook silently and tell no one.
  if (parsed.data.status === "active" && owned.status !== "active") {
    return NextResponse.json({ error: "Utilisez « Rétablir » pour remettre une inscription annulée." }, { status: 409 })
  }

  let registration
  try {
    registration = await db.registration.update({
      where: { id },
      data: parsed.data,
      include: { shift: true },
    })
  } catch (e) {
    // Reactivating a cancelled registration while the volunteer already has a live one on the
    // same shift (Registration_shift_volunteer_live_key, #264).
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "Cette personne a déjà une inscription en cours sur ce créneau." }, { status: 409 })
    }
    throw e
  }

  const activeCount = await db.registration.count({
    where: { shiftId: registration.shiftId, status: "active" },
  })

  let shiftStatus = "open"
  if (registration.shift.status === "closed" || registration.shift.status === "cancelled") {
    shiftStatus = registration.shift.status
  } else if (activeCount >= registration.shift.capacity) {
    shiftStatus = "full"
  }

  await db.shift.update({ where: { id: registration.shiftId }, data: { status: shiftStatus } })

  const regChanges = {
    ...(parsed.data.status && parsed.data.status !== owned.status ? { status: { from: owned.status, to: parsed.data.status } } : {}),
    ...(parsed.data.comment !== undefined && parsed.data.comment !== owned.comment
      ? { comment: { from: owned.comment ? "(rempli)" : "(vide)", to: parsed.data.comment ? "(rempli)" : "(vide)" } }
      : {}),
  }
  let cancelLogId: string | null = null
  if (Object.keys(regChanges).length > 0) {
    cancelLogId = await logEvent({
      eventId: registration.eventId,
      actor: adminActor(guard.session),
      action: parsed.data.status === "cancelled" ? "registration.cancelled" : "registration.updated",
      entityType: "Registration",
      entityId: id,
      // shiftId unchanged (from === to): recorded so the narrative can still name the shift —
      // see describeChanges's shiftId filter in event-log-narrative.ts. Added after the
      // "anything real changed" check above, so it never triggers a log entry on its own.
      changes: { ...regChanges, shiftId: { from: registration.shiftId, to: registration.shiftId } },
    })
  }

  if (parsed.data.status === "cancelled") {
    await promoteNextInWaitlist(registration.shiftId, cancelLogId ?? undefined).catch(reportError("waitlist.promote"))
  }

  return NextResponse.json(registration)
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params

  const owned = await db.registration.findFirst({ where: { id }, select: { id: true, eventId: true, shiftId: true, status: true } })
  if (!owned) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // Same path as the bulk "Retirer de leur créneau" (#292).
  await cancelRegistrations(db, adminActor(guard.session), [owned])

  return NextResponse.json({ success: true })
}
