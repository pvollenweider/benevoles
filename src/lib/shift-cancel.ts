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
import { collectNotifications, deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import { endSwapsIn } from "./shift-swap-server"

export type CancellableShift = {
  id: string
  label: string
  date: Date
  status: string
  event: { id: string; title: string; slug: string; organizationId: string; organization: { slug: string } }
  registrations: {
    id: string
    /** Its status before the cancellation (a request is restored as a request); "active" when absent. */
    status?: string
    volunteerId: string
    volunteer: { email: string | null; firstName: string }
  }[]
}

export type CancelShiftOptions = {
  /**
   * Whether the people registered are emailed (default true). The organiser may leave them out
   * when cancelling a shift by its status (AUTHZ-15): a test shift, or people already told by phone.
   * The choice is logged on the shift's cancellation.
   */
  notify?: boolean
}

export async function cancelShift(shift: CancellableShift, actor: LogActor, options: CancelShiftOptions = {}): Promise<{ cancelledRegistrations: number; notified: number; unpublished: boolean }> {
  const notify = options.notify !== false
  // Through the outbox (#311): `notified` counts notifications queued, retried if SMTP fails.
  const outbox = collectNotifications()
  for (const reg of notify ? shift.registrations : []) {
    await outbox.send({
      kind: "shift_cancelled",
      dedupeKey: `shift_cancelled:${reg.id}`,
      recipient: { email: reg.volunteer.email, name: reg.volunteer.firstName },
      volunteerId: reg.volunteerId,
      organizationId: shift.event.organizationId,
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

  // The cancellation and its notifications commit together (#352): no cancelled registration
  // whose volunteer is never told.
  const { outboxIds, unpublished } = await prisma.$transaction(async (tx) => {
    await tx.shift.update({ where: { id: shift.id }, data: { status: "cancelled" } })
    for (const reg of shift.registrations) {
      await tx.registration.update({ where: { id: reg.id }, data: { status: "cancelled" } })
    }
    // Swap requests on this shift end with it (#1174 E09), in the same commit.
    await endSwapsIn(tx, { shiftIds: [shift.id] }, "shift_cancelled", actor)
    // A published event can't be created or published without a live shift; losing its last
    // one puts it back to draft in the same transaction, so the public page never stays open on
    // nothing. Logged below as its own entry, caused by the cancellation.
    let unpublished = false
    const remaining = await tx.shift.count({ where: { eventId: shift.event.id, status: { not: "cancelled" } } })
    if (remaining === 0) {
      const { count } = await tx.event.updateMany({ where: { id: shift.event.id, publicStatus: "published" }, data: { publicStatus: "draft" } })
      unpublished = count > 0
    }
    const outboxIds = await enqueueNotifications(outbox.payloads, tx, { organizationId: shift.event.organizationId })
    return { outboxIds, unpublished }
  })

  const cancelLogId = await logEvent({
    eventId: shift.event.id,
    actor,
    action: "shift.cancelled",
    entityType: "Shift",
    entityId: shift.id,
    changes: {
      status: { from: shift.status, to: "cancelled" },
      // Whether the people registered were told (AUTHZ-15), when there were any.
      ...(shift.registrations.length > 0 ? { volunteersNotified: { from: null, to: notify } } : {}),
    },
  })
  for (const reg of shift.registrations) {
    await logEvent({
      eventId: shift.event.id,
      actor,
      action: "registration.cancelled",
      entityType: "Registration",
      entityId: reg.id,
      // The status it had (Codex, AUTHZ-15): « Rétablir » gives a request back as a request.
      changes: { status: { from: reg.status ?? "active", to: "cancelled" }, shiftId: { from: shift.id, to: shift.id } },
      causedByLogId: cancelLogId ?? undefined,
    })
  }
  if (unpublished) {
    await logEvent({
      eventId: shift.event.id,
      actor,
      action: "event.unpublished",
      entityType: "Event",
      entityId: shift.event.id,
      changes: { publicStatus: { from: "published", to: "draft" } },
      causedByLogId: cancelLogId ?? undefined,
    })
  }
  deliverAfterResponse(outboxIds)

  return { cancelledRegistrations: shift.registrations.length, notified: outbox.payloads.length, unpublished }
}
