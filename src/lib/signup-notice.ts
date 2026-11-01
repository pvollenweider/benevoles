// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "./prisma"
import { registrationToken } from "./token-vault"
import { deliverAfterResponse, enqueueNotifications } from "./notifications/outbox"
import { rateLimit } from "./rate-limit"
import { reportError } from "./report-error"
import { LINK_REQUEST_LIMIT, LINK_REQUEST_WINDOW_MS } from "./personal-link"
import { COMMITTED_STATUSES, LIVE_STATUSES } from "./registration-capacity"
import { signupConflictReason, type SignupConflict } from "./signup-conflict"

export type { SignupConflict } from "./signup-conflict"

/**
 * Tells the owner of the address, through the outbox after the response (no mail time in the
 * answer), with their personal link when they hold a live registration on the event. Throttled per
 * volunteer with the link re-send (3 an hour): throttled, nothing is sent, the answer is the same.
 */
export async function sendSignupNotice(input: { volunteerId: string; eventId: string; conflict: SignupConflict }): Promise<void> {
  try {
    const volunteer = await prisma.volunteer.findFirst({
      where: { id: input.volunteerId },
      select: { email: true, firstName: true, lastName: true },
    })
    if (!volunteer?.email) return
    if (!(await rateLimit(input.volunteerId, "reg-link-resend", LINK_REQUEST_LIMIT, LINK_REQUEST_WINDOW_MS)).ok) return
    const event = await prisma.event.findFirst({
      where: { id: input.eventId },
      select: { title: true, organizationId: true, organization: { select: { slug: true } } },
    })
    if (!event) return
    // A place or a request first, else the newest waitlisted or offered one: the same page.
    const reg = await prisma.registration.findFirst({
      where: { volunteerId: input.volunteerId, eventId: input.eventId, status: { in: [...COMMITTED_STATUSES] } },
      select: { editTokenHash: true, editTokenEnc: true, editTokenLegacy: true },
    }) ?? await prisma.registration.findFirst({
      where: { volunteerId: input.volunteerId, eventId: input.eventId, status: { in: [...LIVE_STATUSES] } },
      select: { editTokenHash: true, editTokenEnc: true, editTokenLegacy: true },
      orderBy: { createdAt: "desc" },
    })
    const editToken = reg ? registrationToken.reveal(reg) : null
    const name = `${volunteer.firstName} ${volunteer.lastName}`
    const ids = await enqueueNotifications([{
      kind: "registration_link_resend",
      organizationId: event.organizationId,
      volunteerId: input.volunteerId,
      recipient: { email: volunteer.email, name },
      data: {
        volunteerName: name,
        eventTitle: event.title,
        orgSlug: event.organization.slug,
        editToken,
        notRecorded: { reason: signupConflictReason(input.conflict) },
      },
    }])
    if (editToken) {
      await prisma.registration.updateMany({
        where: { volunteerId: input.volunteerId, eventId: input.eventId, status: { in: [...LIVE_STATUSES] } },
        data: { linkEmailedAt: new Date() },
      })
    }
    deliverAfterResponse(ids)
  } catch (e) {
    // Never the answer's business: the form says the same whatever happens here.
    reportError("signup_notice.send")(e)
  }
}
