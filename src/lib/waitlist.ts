// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "./prisma"
import { acceptsRegistrations } from "./registration-window"
import { orgBaseUrl } from "./urls"
import { logEvent, SYSTEM_ACTOR } from "./event-log"
import { OCCUPYING_STATUSES, canOfferSpot, lockShifts } from "./registration-capacity"
import { registrationToken } from "./token-vault"
import { orgTimeZone } from "./time-zone"
import { deliverAfterResponse, enqueueNotifications } from "./notifications/outbox"

/**
 * When a spot opens on a shift, offer it to the first person on the waitlist.
 * Called after a registration is cancelled or an offered spot expires.
 *
 * `causedByLogId` links this offer back to the EventLog entry for whatever freed the spot
 * (a cancellation, most often) so narrative mode can tell "X cancelled, which let Y move up
 * the waitlist" as one causal chain instead of two coincidentally-timed entries.
 */
export async function promoteNextInWaitlist(shiftId: string, causedByLogId?: string): Promise<boolean> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  // Under a lock on the shift (#264): two cancellations freeing two spots at once must offer
  // them to two different people, and a spot is only offered if one is actually free — callers
  // don't have to know whether their cancellation really freed one (already-cancelled row,
  // over-capacity shift, spot already re-taken).
  const offered = await prisma.$transaction(async (tx) => {
    await lockShifts(tx, [shiftId])
    const shift = await tx.shift.findUnique({
      where: { id: shiftId },
      select: { capacity: true, status: true, event: { select: { publicStatus: true, registrationsOpen: true, registrationOpensAt: true, registrationClosesAt: true } } },
    })
    if (!shift) return null
    // Registrations closed (#463): a freed spot is not offered; offers already made stay valid.
    if (shift.event && !acceptsRegistrations(shift.event)) return null
    const occupied = await tx.registration.count({ where: { shiftId, status: { in: [...OCCUPYING_STATUSES] } } })
    if (!canOfferSpot({ capacity: shift.capacity, occupied, shiftStatus: shift.status })) return null

    // First waiting registration for this shift (oldest = lowest position)
    const candidate = await tx.registration.findFirst({
      where: { shiftId, status: "waiting" },
      orderBy: { waitingPosition: "asc" },
      select: { id: true },
    })
    if (!candidate) return null

    await tx.registration.update({
      where: { id: candidate.id },
      data: {
        status: "offered",
        waitingOfferedAt: new Date(),
        waitingExpiresAt: expiresAt,
      },
    })

    const next = await tx.registration.findUniqueOrThrow({
      where: { id: candidate.id },
      include: {
        volunteer: true,
        shift: true,
        event: { include: { organization: { select: { slug: true, name: true, timeZone: true } } } },
      },
    })
    const orgSlug = next.event.organization.slug
    const confirmUrl = `${orgBaseUrl(orgSlug)}/waitlist/${registrationToken.reveal(next)}/confirm`
    const expiresAtLabel = expiresAt.toLocaleDateString("fr-FR", {
      weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: orgTimeZone(next.event.organization),
    })

    // Stored in the same transaction as the offer (#352): an offer is never left without its
    // email, which is the only way the volunteer learns about it before it expires. Delivered
    // after commit, retried by the cron if SMTP fails (#311).
    const outboxIds = await enqueueNotifications([{
      kind: "waitlist_offered",
      organizationId: next.event.organizationId,
      volunteerId: next.volunteerId,
      dedupeKey: `waitlist_offered:${next.id}:${expiresAt.toISOString()}`,
      recipient: { email: next.volunteer.email, name: next.volunteer.firstName },
      data: {
        volunteerName: next.volunteer.firstName,
        eventTitle: next.event.title,
        shiftLabel: next.shift.label,
        shiftDate: next.shift.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
        shiftStart: next.shift.startTime,
        shiftEnd: next.shift.endTime,
        confirmUrl,
        expiresAt: expiresAtLabel,
      },
    }], tx)
    return { next, outboxIds }
  })
  if (!offered) return false
  const { next, outboxIds } = offered

  await logEvent({
    eventId: next.eventId,
    actor: SYSTEM_ACTOR,
    action: "registration.waitlist_offered",
    entityType: "Registration",
    entityId: next.id,
    changes: { status: { from: "waiting", to: "offered" } },
    causedByLogId,
  })

  deliverAfterResponse(outboxIds)
  return true
}

/** Upper bound of offers made for one shift in one reconciliation run (a shift is small). */
export const RECONCILE_MAX_OFFERS_PER_SHIFT = 50

/**
 * Catches up on promotions that didn't happen (audit): a cancellation commits first, then the
 * promotion runs on its own; if that fails (a database blip), the freed spot would stay free while
 * people wait. Run by the hourly cron: for every upcoming shift with someone waiting, offer spots
 * until none is free. promoteNextInWaitlist locks the shift and checks the spot, so this is a no-op
 * when everything already went well, and safe next to a concurrent cancellation.
 */
export async function reconcileWaitlists(
  now: Date = new Date(),
  promote: (shiftId: string) => Promise<boolean> = (id) => promoteNextInWaitlist(id),
): Promise<{ shifts: number; offered: number }> {
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`)
  const rows = await prisma.registration.findMany({
    where: { status: "waiting", shift: { status: { not: "cancelled" }, date: { gte: today } } },
    select: { shiftId: true },
    distinct: ["shiftId"],
  })
  let offered = 0
  for (const { shiftId } of rows) {
    for (let i = 0; i < RECONCILE_MAX_OFFERS_PER_SHIFT; i++) {
      if (!(await promote(shiftId))) break
      offered++
    }
  }
  return { shifts: rows.length, offered }
}
