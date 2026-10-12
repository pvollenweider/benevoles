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
import { roleLimitAdminMessage, roleLimitBreaches, roleLimits } from "@/lib/role-limit"
import { LIVE_STATUSES } from "@/lib/registration-capacity"

const schema = z.object({
  eventId: z.string(),
  shiftId: z.string(),
  /** A member already in the organization's list (#914): placed without retyping, email or not. */
  volunteerId: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  comment: z.string().optional(),
  /** The admin saw the role-limit warning and adds anyway (#466). */
  allowOverLimit: z.boolean().optional(),
}).refine((d) => d.volunteerId || (d.firstName?.trim() && d.lastName?.trim()), {
  message: "Prénom et nom requis pour une nouvelle personne.",
  path: ["firstName"],
})

export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)

  const { eventId, shiftId, volunteerId, firstName, lastName, email, phone, comment, allowOverLimit } = parsed.data

  const shift = await db.shift.findFirst({
    where: { id: shiftId, eventId },
    include: { registrations: { where: { status: "active" } } },
  })

  if (!shift) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 })

  const usedEmail = email || null
  let volunteer = volunteerId
    ? await db.volunteer.findFirst({ where: { id: volunteerId, organizationId } })
    : usedEmail
      ? await db.volunteer.findFirst({ where: { email: usedEmail, organizationId } })
      : null
  // Another organization's member, or one deleted since the search: never created in its place.
  if (volunteerId && !volunteer) {
    return NextResponse.json({ error: "Ce membre n'existe plus. Cherchez-le à nouveau." }, { status: 404 })
  }

  // Shifts per volunteer for the role (#466): the organiser may go over it, but knowingly.
  if (volunteer && !allowOverLimit) {
    const limits = roleLimits(await db.shift.findMany({
      where: { eventId, roleName: shift.roleName, maxPerVolunteer: { not: null } },
      select: { roleName: true, maxPerVolunteer: true },
    }))
    if (limits.size > 0) {
      const held = await db.registration.findMany({
        where: { volunteerId: volunteer.id, eventId, status: { in: [...LIVE_STATUSES] }, shift: { roleName: shift.roleName } },
        select: { id: true },
      })
      const [breach] = roleLimitBreaches([shift], held.map(() => ({ roleName: shift.roleName })), limits)
      if (breach) {
        return NextResponse.json({ error: roleLimitAdminMessage(breach, `${volunteer.firstName} ${volunteer.lastName}`), code: "role_limit" }, { status: 409 })
      }
    }
  }

  if (!volunteer) {
    volunteer = await db.volunteer.create({
      data: { firstName: firstName!.trim(), lastName: lastName!.trim(), email: usedEmail, phone: phone || null, organizationId },
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
        // No charterAcceptedHash/At (#569): an admin adds this registration by hand, so no
        // volunteer consent to the charter was ever given here.
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
    changes: { shiftId: { from: null, to: shiftId }, source: { from: null, to: "admin_manual" }, ...(allowOverLimit ? { overRoleLimit: { from: null, to: true } } : {}) },
  })

  return NextResponse.json(registration, { status: 201 })
}
