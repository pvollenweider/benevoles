// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { OrgScopedPrisma } from "./prisma-org"
import { logEvent, type LogActor } from "./event-log"
import { registrationToken } from "./token-vault"
import { collectNotifications, deliverAfterResponse, enqueueNotifications } from "./notifications/outbox"
import { OCCUPYING_STATUSES, isUniqueViolation, lockShifts } from "./registration-capacity"
import { cancelledFrom, planRestore, type RestoredStatus } from "./registration-restore"
import { localDateTimeToUtc, orgTimeZone } from "./time-zone"

/**
 * « Rétablir » (#809): puts a cancelled place or request back, as it was. Server only. The
 * rules are `planRestore`'s; this reads what they need under the shift lock, so a restore and a
 * sign-up racing for the last spot can't both win, and commits the change with its email (#352).
 */

export type RestoreResult =
  | { ok: true; status: RestoredStatus }
  | { ok: false; httpStatus: 404 | 409; error: string }

export const ALREADY_LIVE = "Cette personne a déjà une inscription en cours sur ce créneau."

export async function restoreRegistration(db: OrgScopedPrisma, actor: LogActor, id: string, now: Date = new Date()): Promise<RestoreResult> {
  const reg = await db.registration.findFirst({
    where: { id },
    include: {
      volunteer: { select: { firstName: true, lastName: true, email: true } },
      shift: { select: { id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, capacity: true, status: true } },
      event: { select: { id: true, title: true, organizationId: true, organization: { select: { slug: true, timeZone: true } } } },
    },
  })
  if (!reg) return { ok: false, httpStatus: 404, error: "Non trouvé" }

  // What it was before: the latest cancellation recorded for this registration.
  const cancellation = await db.eventLog.findFirst({
    where: { eventId: reg.eventId, entityType: "Registration", entityId: id, action: "registration.cancelled" },
    orderBy: { createdAt: "desc" },
    select: { changes: true },
  })
  const shiftStart = localDateTimeToUtc(reg.shift.date, reg.shift.startTime, orgTimeZone(reg.event.organization))
  const name = `${reg.volunteer.firstName} ${reg.volunteer.lastName}`

  let outcome: { ok: true; status: RestoredStatus; outboxIds: string[] } | { ok: false; error: string }
  try {
    outcome = await db.$transaction(async (tx) => {
      await lockShifts(tx, [reg.shiftId])
      const [current, shift, occupied] = await Promise.all([
        tx.registration.findFirst({ where: { id }, select: { status: true } }),
        tx.shift.findFirst({ where: { id: reg.shiftId }, select: { status: true, capacity: true } }),
        tx.registration.count({ where: { shiftId: reg.shiftId, status: { in: [...OCCUPYING_STATUSES] } } }),
      ])
      const plan = planRestore({
        status: current?.status ?? "",
        previousStatus: cancelledFrom(cancellation?.changes),
        shiftStatus: shift?.status ?? "cancelled",
        shiftStart,
        capacity: shift?.capacity ?? 0,
        occupied,
        now,
      })
      if (!plan.ok) return { ok: false as const, error: plan.message }

      const { count } = await tx.registration.updateMany({ where: { id, status: "cancelled" }, data: { status: plan.status } })
      if (count === 0) return { ok: false as const, error: "Cette inscription n'est pas annulée." }
      // A place taken back can fill the shift: same rule as everywhere a place is added.
      if (plan.status === "active" && shift?.status === "open" && occupied + 1 >= (shift?.capacity ?? 0)) {
        await tx.shift.updateMany({ where: { id: reg.shiftId, status: "open" }, data: { status: "full" } })
      }

      const outbox = collectNotifications()
      if (reg.volunteer.email) {
        await outbox.send({
          kind: "registration_restored",
          recipient: { email: reg.volunteer.email, name },
          volunteerId: reg.volunteerId,
          organizationId: reg.event.organizationId,
          // Several restores of one registration are several emails: keyed on the moment.
          dedupeKey: `registration_restored:${id}:${now.getTime()}`,
          data: {
            volunteerName: name,
            eventTitle: reg.event.title,
            orgSlug: reg.event.organization.slug,
            status: plan.status,
            shift: {
              roleName: reg.shift.roleName,
              label: reg.shift.label,
              date: reg.shift.date.toISOString().slice(0, 10),
              startTime: reg.shift.startTime,
              endTime: reg.shift.endTime,
            },
            editToken: registrationToken.reveal(reg),
          },
        })
      }
      return { ok: true as const, status: plan.status, outboxIds: await enqueueNotifications(outbox.payloads, tx, { organizationId: reg.event.organizationId }) }
    })
  } catch (e) {
    // A newer live registration of the same person on this shift (Registration_shift_volunteer_live_key, #264).
    if (isUniqueViolation(e)) return { ok: false, httpStatus: 409, error: ALREADY_LIVE }
    throw e
  }
  if (!outcome.ok) return { ok: false, httpStatus: 409, error: outcome.error }

  await logEvent({
    eventId: reg.eventId,
    actor,
    action: "registration.restored",
    entityType: "Registration",
    entityId: id,
    changes: { status: { from: "cancelled", to: outcome.status }, shiftId: { from: reg.shiftId, to: reg.shiftId } },
  })
  deliverAfterResponse(outcome.outboxIds)
  return { ok: true, status: outcome.status }
}
