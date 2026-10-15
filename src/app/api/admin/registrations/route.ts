// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { REGISTRATION_ADMIN_SELECT } from "@/lib/admin-row-selects"
import { generateToken } from "@/lib/utils"
import { z } from "zod"
import { adminActor, logEvent } from "@/lib/event-log"
import { isUniqueViolation } from "@/lib/registration-capacity"
import { registrationToken } from "@/lib/token-vault"
import { validationError } from "@/lib/api-error"
import { roleLimitAdminMessage, roleLimitBreaches, roleLimits } from "@/lib/role-limit"
import { LIVE_STATUSES } from "@/lib/registration-capacity"
import { queueAddedByOrganizer } from "@/lib/notifications/added-by-organizer"
import { manualAddNotice, manualAddNoticeLog } from "@/lib/manual-add-notice"
import { localDateTimeToUtc, orgTimeZone } from "@/lib/time-zone"

/** Shifts at most in one submit (#918): a person's whole programme, not a bulk import. */
const MAX_SHIFTS = 30

const schema = z.object({
  eventId: z.string(),
  /** One shift: the original API, still answered with the registration itself. */
  shiftId: z.string().optional(),
  /** Several shifts for the same person in one submit (#918), all or nothing. */
  shiftIds: z.array(z.string()).max(MAX_SHIFTS).optional(),
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
}).refine((d) => d.shiftId || (d.shiftIds?.length ?? 0) > 0, {
  message: "Choisissez au moins un créneau.",
  path: ["shiftIds"],
})

export async function POST(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)

  const { eventId, shiftId, shiftIds, volunteerId, firstName, lastName, email, phone, comment, allowOverLimit } = parsed.data
  const ids = [...new Set([...(shiftIds ?? []), ...(shiftId ? [shiftId] : [])])]

  const found = await Promise.all(ids.map((id) => db.shift.findFirst({
    where: { id, eventId },
    include: {
      registrations: { where: { status: "active" } },
      event: { select: { title: true, organization: { select: { name: true, slug: true, timeZone: true } } } },
    },
  })))
  const shifts = found.filter((s): s is NonNullable<typeof s> => s !== null)
  if (shifts.length !== ids.length) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 })

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

  // Shifts per volunteer for the role (#466): the organiser may go over it, but knowingly. The
  // shifts added together count too (#918).
  if (volunteer && !allowOverLimit) {
    const roleNames = [...new Set(shifts.map((s) => s.roleName))]
    const limits = roleLimits(await db.shift.findMany({
      where: { eventId, roleName: { in: roleNames }, maxPerVolunteer: { not: null } },
      select: { roleName: true, maxPerVolunteer: true },
    }))
    if (limits.size > 0) {
      const held = await db.registration.findMany({
        where: { volunteerId: volunteer.id, eventId, status: { in: [...LIVE_STATUSES] }, shift: { roleName: { in: roleNames } } },
        select: { shift: { select: { roleName: true } } },
      })
      const [breach] = roleLimitBreaches(shifts, held.map((h) => ({ roleName: h.shift.roleName })), limits)
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

  // The volunteer is always told (#916), except in the three cases manualAddNotice skips; decided
  // per shift, so a shift already over among several is recorded without being announced.
  const now = new Date()
  const notices = new Map(shifts.map((s) => [s.id, manualAddNotice({
    email: volunteer.email,
    organizerEmail: guard.session.user?.email,
    shiftStart: localDateTimeToUtc(s.date, s.startTime, orgTimeZone(s.event.organization)),
    now,
  })]))
  const organizer = [...notices.values()].some((n) => n.send) && guard.session.user?.id
    ? await db.adminUser.findFirst({ where: { id: guard.session.user.id }, select: { name: true } })
    : null

  let registrations
  try {
    const added = volunteer
    registrations = await db.$transaction(async (tx) => {
      const created = []
      for (const shift of shifts) {
        const registration = await tx.registration.create({
          data: {
            eventId,
            shiftId: shift.id,
            volunteerId: added.id,
            source: "admin_manual",
            comment,
            // No charterAcceptedHash/At (#569): an admin adds this registration by hand, so no
            // volunteer consent to the charter was ever given here.
            ...registrationToken.data(generateToken()),
          },
          // Returned to the admin: never the stored token (#1009); the link only goes by email.
          select: { ...REGISTRATION_ADMIN_SELECT, volunteer: true, shift: true },
        })
        const notice = notices.get(shift.id)!
        // Grouped per person and event (#916): shifts added together or in a row are one email,
        // a few minutes after the last one, listing what is still held then.
        if (notice.send) {
          await queueAddedByOrganizer(tx, {
            eventId,
            volunteerId: added.id,
            registrationId: registration.id,
            organizationId,
            recipient: { email: notice.email, name: `${added.firstName} ${added.lastName}` },
            data: {
              volunteerName: `${added.firstName} ${added.lastName}`,
              eventTitle: shift.event.title,
              orgSlug: shift.event.organization.slug,
              organizationName: shift.event.organization.name,
              organizerName: organizer?.name?.trim() || null,
            },
            now,
          })
        }
        created.push({ registration, shiftId: shift.id })
      }
      return created
    })
  } catch (e) {
    if (isUniqueViolation(e)) {
      const message = shifts.length > 1
        ? "Cette personne est déjà inscrite sur l'un de ces créneaux : rien n'a été ajouté."
        : "Cette personne est déjà inscrite sur ce créneau."
      return NextResponse.json({ error: message }, { status: 409 })
    }
    throw e
  }

  for (const shift of shifts) {
    if (shift.registrations.length + 1 >= shift.capacity) {
      await db.shift.update({ where: { id: shift.id }, data: { status: "full" } })
    }
  }

  for (const { registration, shiftId: addedShiftId } of registrations) {
    await logEvent({
      eventId,
      actor: adminActor(guard.session),
      action: "registration.created",
      entityType: "Registration",
      entityId: registration.id,
      changes: {
        shiftId: { from: null, to: addedShiftId },
        source: { from: null, to: "admin_manual" },
        confirmationEmail: { from: null, to: manualAddNoticeLog(notices.get(addedShiftId)!) },
        ...(allowOverLimit ? { overRoleLimit: { from: null, to: true } } : {}),
      },
    })
  }

  // `shiftIds` (#918): every registration; the original single `shiftId`: the registration itself.
  const created = registrations.map((r) => r.registration)
  return shiftIds ? NextResponse.json({ registrations: created }, { status: 201 }) : NextResponse.json(created[0], { status: 201 })
}
