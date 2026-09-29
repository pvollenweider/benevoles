import { prisma } from "./prisma"
import { orgBaseUrl } from "./urls"
import { logEvent, SYSTEM_ACTOR } from "./event-log"
import { OCCUPYING_STATUSES, canOfferSpot, lockShifts } from "./registration-capacity"
import { reportError } from "./report-error"
import { registrationToken } from "./token-vault"
import { APP_TIME_ZONE } from "./time-zone"
import { enqueueAndDeliver } from "./notifications/outbox"

/**
 * When a spot opens on a shift, offer it to the first person on the waitlist.
 * Called after a registration is cancelled or an offered spot expires.
 *
 * `causedByLogId` links this offer back to the EventLog entry for whatever freed the spot
 * (a cancellation, most often) so narrative mode can tell "X cancelled, which let Y move up
 * the waitlist" as one causal chain instead of two coincidentally-timed entries.
 */
export async function promoteNextInWaitlist(shiftId: string, causedByLogId?: string): Promise<void> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  // Under a lock on the shift (#264): two cancellations freeing two spots at once must offer
  // them to two different people, and a spot is only offered if one is actually free — callers
  // don't have to know whether their cancellation really freed one (already-cancelled row,
  // over-capacity shift, spot already re-taken).
  const offeredId = await prisma.$transaction(async (tx) => {
    await lockShifts(tx, [shiftId])
    const shift = await tx.shift.findUnique({ where: { id: shiftId }, select: { capacity: true, status: true } })
    if (!shift) return null
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
    return candidate.id
  })
  if (!offeredId) return

  const next = await prisma.registration.findUniqueOrThrow({
    where: { id: offeredId },
    include: {
      volunteer: true,
      shift: true,
      event: { include: { organization: { select: { slug: true, name: true } } } },
    },
  })

  await logEvent({
    eventId: next.eventId,
    actor: SYSTEM_ACTOR,
    action: "registration.waitlist_offered",
    entityType: "Registration",
    entityId: next.id,
    changes: { status: { from: "waiting", to: "offered" } },
    causedByLogId,
  })

  const orgSlug = next.event.organization.slug
  const confirmUrl = `${orgBaseUrl(orgSlug)}/waitlist/${registrationToken.reveal(next)}/confirm`
  const expiresAtLabel = expiresAt.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: APP_TIME_ZONE,
  })

  // Through the outbox (#311): retried if SMTP fails, the caller isn't slowed down.
  await enqueueAndDeliver([{
    kind: "waitlist_offered",
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
  }]).catch(reportError("notification.waitlist_offered"))
}
