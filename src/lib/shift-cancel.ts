// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Cancels one shift and cascades to its active registrations — extracted from
 * DELETE /api/admin/shifts/[id] so the same "delete a shift" behavior (soft-cancel, notify every
 * registered volunteer, audit-log both the shift and each registration) can be reused by
 * DELETE /api/admin/events/[id]/roles/[roleName] (#218's "delete a role" = cancel every shift
 * that has it) without duplicating the cascade.
 *
 * Takes the already-fetched shift, not an id: ownership must be verified by the *caller*, via
 * whichever org-scoped query fits its own context (the org-scoped `db` client for a single shift
 * by id, or a query already scoped to a pre-verified eventId for a bulk operation like role
 * deletion) — never by re-fetching through the raw, unscoped `prisma` client here (see
 * cross-tenant-isolation.test.ts: routes must not fall back to raw prisma for ownership).
 */
import { prisma } from "@/lib/prisma"
import { logEvent, type LogActor } from "@/lib/event-log"
import { formatDate } from "@/lib/utils"
import { collectNotifications, enqueueAndDeliver } from "@/lib/notifications/outbox"

export type CancellableShift = {
  id: string
  label: string
  date: Date
  status: string
  event: { id: string; title: string; slug: string; organization: { slug: string } }
  registrations: {
    id: string
    volunteer: { email: string | null; firstName: string }
  }[]
}

export async function cancelShift(shift: CancellableShift, actor: LogActor): Promise<{ cancelledRegistrations: number; notified: number }> {
  await prisma.shift.update({ where: { id: shift.id }, data: { status: "cancelled" } })

  const cancelLogId = await logEvent({
    eventId: shift.event.id,
    actor,
    action: "shift.cancelled",
    entityType: "Shift",
    entityId: shift.id,
    changes: { status: { from: shift.status, to: "cancelled" } },
  })

  // Through the outbox (#311): `notified` counts notifications queued, retried if SMTP fails.
  const outbox = collectNotifications()
  for (const reg of shift.registrations) {
    await prisma.registration.update({ where: { id: reg.id }, data: { status: "cancelled" } })
    await logEvent({
      eventId: shift.event.id,
      actor,
      action: "registration.cancelled",
      entityType: "Registration",
      entityId: reg.id,
      changes: { status: { from: "active", to: "cancelled" }, shiftId: { from: shift.id, to: shift.id } },
      causedByLogId: cancelLogId ?? undefined,
    })
    await outbox.send({
      kind: "shift_cancelled",
      dedupeKey: `shift_cancelled:${reg.id}`,
      recipient: { email: reg.volunteer.email, name: reg.volunteer.firstName },
      data: {
        volunteerName: reg.volunteer.firstName,
        eventTitle: shift.event.title,
        orgSlug: shift.event.organization.slug,
        eventSlug: shift.event.slug,
        shiftLabel: shift.label,
        shiftDate: formatDate(shift.date),
      },
    })
  }
  await enqueueAndDeliver(outbox.payloads)

  return { cancelledRegistrations: shift.registrations.length, notified: outbox.payloads.length }
}
