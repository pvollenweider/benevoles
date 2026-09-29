// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { generateToken } from "@/lib/utils"
import { z } from "zod"
import { adminActor, logEvent } from "@/lib/event-log"
import { isUniqueViolation } from "@/lib/registration-capacity"
import { registrationToken } from "@/lib/token-vault"
import { validationError } from "@/lib/api-error"

const schema = z.object({
  eventId: z.string(),
  shiftId: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  comment: z.string().optional(),
})

export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)

  const { eventId, shiftId, firstName, lastName, email, phone, comment } = parsed.data

  const shift = await db.shift.findFirst({
    where: { id: shiftId, eventId },
    include: { registrations: { where: { status: "active" } } },
  })

  if (!shift) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 })

  const usedEmail = email || null
  let volunteer = usedEmail
    ? await db.volunteer.findFirst({ where: { email: usedEmail, organizationId } })
    : null

  if (!volunteer) {
    volunteer = await db.volunteer.create({
      data: { firstName, lastName, email: usedEmail, phone: phone || null, organizationId },
    })
  }

  let registration
  try {
    registration = await db.registration.create({
      data: {
        eventId,
        shiftId,
        volunteerId: volunteer.id,
        source: "admin_manual",
        comment,
        ...registrationToken.data(generateToken()),
      },
      include: { volunteer: true, shift: true },
    })
  } catch (e) {
    if (isUniqueViolation(e)) {
      return NextResponse.json({ error: "Cette personne est déjà inscrite sur ce créneau." }, { status: 409 })
    }
    throw e
  }

  if (shift.registrations.length + 1 >= shift.capacity) {
    await db.shift.update({ where: { id: shiftId }, data: { status: "full" } })
  }

  await logEvent({
    eventId,
    actor: adminActor(guard.session),
    action: "registration.created",
    entityType: "Registration",
    entityId: registration.id,
    changes: { shiftId: { from: null, to: shiftId }, source: { from: null, to: "admin_manual" } },
  })

  return NextResponse.json(registration, { status: 201 })
}
