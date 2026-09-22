import { prisma } from "./prisma"
import { sendNotification } from "./notifications"
import { orgBaseUrl } from "./urls"
import { logEvent, SYSTEM_ACTOR } from "./event-log"

/**
 * When a spot opens on a shift, offer it to the first person on the waitlist.
 * Called after a registration is cancelled or an offered spot expires.
 *
 * `causedByLogId` links this offer back to the EventLog entry for whatever freed the spot
 * (a cancellation, most often) so narrative mode can tell "X cancelled, which let Y move up
 * the waitlist" as one causal chain instead of two coincidentally-timed entries.
 */
export async function promoteNextInWaitlist(shiftId: string, causedByLogId?: string): Promise<void> {
  // Find the first waiting registration for this shift (oldest = lowest position)
  const next = await prisma.registration.findFirst({
    where: { shiftId, status: "waiting" },
    orderBy: { waitingPosition: "asc" },
    include: {
      volunteer: true,
      shift: true,
      event: { include: { organization: { select: { slug: true, name: true } } } },
    },
  })
  if (!next) return

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await prisma.registration.update({
    where: { id: next.id },
    data: {
      status: "offered",
      waitingOfferedAt: new Date(),
      waitingExpiresAt: expiresAt,
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
  const confirmUrl = `${orgBaseUrl(orgSlug)}/waitlist/${next.editToken}/confirm`
  const expiresAtLabel = expiresAt.toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  })

  await sendNotification({
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
  }).catch(() => {})
}
