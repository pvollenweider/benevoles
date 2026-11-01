// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { birthDateSchema } from "@/lib/civil-date"
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
import { checkDutyChange, judgeDutyChange, lockVolunteerRows, lockWorkloadShared, readWorkloadGate, withPlaceNames, workloadRefusalBody, WorkloadRefusalError } from "@/lib/workload-guard"
import { lockShifts } from "@/lib/registration-capacity"
import { AvailabilityAckError, availabilityAckBody, checkAvailabilityAcks, logAvailabilityAcks, readAvailabilityGate } from "@/lib/availability-assist-data"
import { checkShiftOverrides, ShiftCancelledError, ShiftOverrideError } from "@/lib/shift-override-server"
import { cancelledShiftMessage, overrideLogValue, type ShiftOverrideNeed } from "@/lib/shift-override"
import { OCCUPYING_STATUSES } from "@/lib/registration-capacity"
import { memberWriteRefusal } from "@/lib/member-erasure"

/** The organiser's refusal (#1171): who, and the first limit the addition would break. */
function manualAddWorkloadBody(e: WorkloadRefusalError, name: string, shiftCount: number) {
  const lead = `Ajout impossible : avec ${shiftCount > 1 ? "ces créneaux" : "ce créneau"}, le programme de ${name} ne respecterait plus les pauses et limites de charge de cet événement.`
  return workloadRefusalBody(e.verdict, lead)
}

/** Shifts at most in one submit (#918): a person's whole programme, not a bulk import. */
const MAX_SHIFTS = 30

/** The person was erased or merged between the first read and the lock: nothing is created. */
class TombstoneRefusal extends Error {}

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
  /**
   * Dated availability (#1146, lot B): the acknowledgements ticked for shifts the person said they
   * are not available for, each bound to their answer's revision and the shift's hours
   * (src/lib/availability-assist.ts). Never a way past the workload protection.
   */
  availabilityAck: z.array(z.string().max(400)).max(MAX_SHIFTS).optional(),
  /**
   * A full or closed shift (AUTHZ-15): the organiser's confirmation, one key per shift, bound to
   * the person, the shift's status, places and spots taken (src/lib/shift-override.ts). A
   * cancelled shift is refused whatever is sent.
   */
  shiftOverride: z.array(z.string().max(400)).max(MAX_SHIFTS).optional(),
  /**
   * Birth date (#1171, lot 2): asked when the event protects minors and the person has none on
   * file. Stored on a new person, or on a member without one; an existing date is never replaced.
   */
  birthDate: z.preprocess((v) => (v === "" ? undefined : v), birthDateSchema.optional()),
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

  const { eventId, shiftId, shiftIds, volunteerId, firstName, lastName, email, phone, comment, allowOverLimit, birthDate, availabilityAck, shiftOverride } = parsed.data
  const birthDateValue = birthDate ? new Date(birthDate) : null
  const ids = [...new Set([...(shiftIds ?? []), ...(shiftId ? [shiftId] : [])])]

  const found = await Promise.all(ids.map((id) => db.shift.findFirst({
    where: { id, eventId },
    include: {
      event: { select: { title: true, organization: { select: { name: true, slug: true, timeZone: true } } } },
    },
  })))
  const shifts = found.filter((s): s is NonNullable<typeof s> => s !== null)
  if (shifts.length !== ids.length) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 })

  const usedEmail = email || null
  // The confirmation's subject (AUTHZ-15): stable between the refusal and the retry, even for a new
  // person whose member record does not exist yet.
  const overrideSubject = volunteerId || (usedEmail ? `email:${usedEmail}` : `new:${(firstName ?? "").trim().toLowerCase()} ${(lastName ?? "").trim().toLowerCase()}`)
  let volunteer = volunteerId
    ? await db.volunteer.findFirst({ where: { id: volunteerId, organizationId } })
    : usedEmail
      ? await db.volunteer.findFirst({ where: { email: usedEmail, organizationId } })
      : null
  // Another organization's member, or one deleted since the search: never created in its place.
  if (volunteerId && !volunteer) {
    return NextResponse.json({ error: "Ce membre n'existe plus. Cherchez-le à nouveau." }, { status: 404 })
  }
  // An erased record or a merge tombstone is never registered (checked again under the lock below).
  const tombstone = volunteer ? memberWriteRefusal(volunteer) : null
  if (tombstone) return NextResponse.json({ error: tombstone }, { status: 409 })

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

  // Workload protection (#1171): a new person holds nothing yet, so these shifts alone are judged
  // before the member record is created; the authoritative check runs below, under the locks.
  // There is no « add anyway »: allowOverLimit concerns the role limit only.
  if (!volunteer) {
    const verdict = judgeDutyChange(await readWorkloadGate(db, eventId), [], { add: await withPlaceNames(db, shifts) }, { birthDate: birthDateValue })
    if (!verdict.ok) {
      return NextResponse.json(manualAddWorkloadBody(new WorkloadRefusalError(verdict, ""), `${firstName!.trim()} ${lastName!.trim()}`, shifts.length), { status: 409 })
    }
  }

  // A first look before anything is written (a new member is created just below): a cancelled
  // shift, or a full or closed one not confirmed, refuses here. The authoritative check runs again
  // under the shift locks.
  try {
    await checkShiftOverrides(db, "manual_add", ids, () => overrideSubject, shiftOverride ?? [])
  } catch (e) {
    if (e instanceof ShiftCancelledError) return NextResponse.json({ error: cancelledShiftMessage(e.label), code: "shift_cancelled" }, { status: 409 })
    if (e instanceof ShiftOverrideError) return NextResponse.json(e.body(), { status: 409 })
    throw e
  }

  if (!volunteer) {
    volunteer = await db.volunteer.create({
      data: { firstName: firstName!.trim(), lastName: lastName!.trim(), email: usedEmail, phone: phone || null, organizationId, ...(birthDateValue ? { birthDate: birthDateValue } : {}) },
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
  // The confirmations used (AUTHZ-15), per shift, for the event log.
  let overrides = new Map<string, ShiftOverrideNeed>()
  try {
    const added = volunteer
    registrations = await db.$transaction(async (tx) => {
      // Workload protection (#1171): its shared lock first, then the person's row, then their
      // whole resulting schedule. Every shift added counts, all or nothing.
      await lockWorkloadShared(tx, eventId)
      const gate = await readWorkloadGate(tx, eventId)
      // Dated availability (#1146, lot B), on an event that uses it: the shifts and the person are
      // locked too (workload → shifts → people), so the shifts' hours and the person's answer read
      // below are those of the commit. An event without it takes no extra lock or read.
      const availability = await readAvailabilityGate(tx, eventId)
      // The shifts are always locked (AUTHZ-15): their status and spots taken are judged below.
      await lockShifts(tx, ids)
      // The person's row is always locked: an erasure or a merge committed meanwhile is seen here.
      await lockVolunteerRows(tx, [added.id])
      const current = await tx.volunteer.findFirst({ where: { id: added.id }, select: { erasedAt: true, mergedIntoId: true } })
      const refusal = current ? memberWriteRefusal(current) : null
      if (refusal) throw new TombstoneRefusal(refusal)
      if (gate.kind !== "off") {
        // A birth date given here fills a member's missing one (never replaces it), before the check.
        if (birthDateValue) await tx.volunteer.updateMany({ where: { id: added.id, birthDate: null }, data: { birthDate: birthDateValue } })
        const verdict = await checkDutyChange(tx, gate, eventId, added.id, { add: shifts })
        if (!verdict.ok) throw new WorkloadRefusalError(verdict, added.id)
      }
      // After the workload protection (a hard refusal is never preceded by a request to tick):
      // a shift outside the person's declared availability needs its acknowledgement, or nothing
      // is created. An acknowledgement never bypasses the protection.
      // A cancelled shift is refused; a full or closed one needs the organiser's confirmation,
      // judged on the state read under the lock (AUTHZ-15).
      overrides = await checkShiftOverrides(tx, "manual_add", ids, () => overrideSubject, shiftOverride ?? [])
      const acknowledged = availability.inUse ? await checkAvailabilityAcks(tx, availability, eventId, added.id, ids, availabilityAck ?? []) : []
      const created = []
      const registrationOfShift = new Map<string, string>()
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
        registrationOfShift.set(shift.id, registration.id)
      }
      // The acknowledgements' evidence, committed with the registrations (#1146, lot B).
      await logAvailabilityAcks(tx, { eventId, actor: adminActor(guard.session), via: "manual_add", acks: acknowledged, registrationOf: (a) => registrationOfShift.get(a.shiftId) })
      // A shift whose places are now all taken shows « Complet »; a closed one stays closed.
      for (const shift of shifts) {
        const occupied = await tx.registration.count({ where: { shiftId: shift.id, status: { in: [...OCCUPYING_STATUSES] } } })
        if (occupied >= shift.capacity) await tx.shift.updateMany({ where: { id: shift.id, status: "open" }, data: { status: "full" } })
      }
      return created
    })
  } catch (e) {
    if (e instanceof TombstoneRefusal) return NextResponse.json({ error: e.message }, { status: 409 })
    if (e instanceof ShiftCancelledError) return NextResponse.json({ error: cancelledShiftMessage(e.label), code: "shift_cancelled" }, { status: 409 })
    if (e instanceof ShiftOverrideError) return NextResponse.json(e.body(), { status: 409 })
    if (e instanceof AvailabilityAckError) {
      return NextResponse.json(availabilityAckBody(e, `${volunteer.firstName} ${volunteer.lastName}`), { status: 409 })
    }
    if (e instanceof WorkloadRefusalError) {
      return NextResponse.json(manualAddWorkloadBody(e, `${volunteer.firstName} ${volunteer.lastName}`, shifts.length), { status: 409 })
    }
    if (isUniqueViolation(e)) {
      const message = shifts.length > 1
        ? "Cette personne est déjà inscrite sur l'un de ces créneaux : rien n'a été ajouté."
        : "Cette personne est déjà inscrite sur ce créneau."
      return NextResponse.json({ error: message }, { status: 409 })
    }
    throw e
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
        // Added knowingly to a full or closed shift (AUTHZ-15): the state confirmed, after the addition.
        ...(overrides.has(addedShiftId) ? { shiftOverride: { from: null, to: overrideLogValue(overrides.get(addedShiftId)!) } } : {}),
      },
    })
  }

  // `shiftIds` (#918): every registration; the original single `shiftId`: the registration itself.
  const created = registrations.map((r) => r.registration)
  return shiftIds ? NextResponse.json({ registrations: created }, { status: 201 }) : NextResponse.json(created[0], { status: 201 })
}
