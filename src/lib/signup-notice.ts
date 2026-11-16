// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "./prisma"
import { registrationToken } from "./token-vault"
import { deliverAfterResponse, enqueueNotifications } from "./notifications/outbox"
import { rateLimit } from "./rate-limit"
import { reportError } from "./report-error"
import { LINK_REQUEST_LIMIT, LINK_REQUEST_WINDOW_MS } from "./personal-link"
import { COMMITTED_STATUSES, LIVE_STATUSES, type Tx } from "./registration-capacity"
import type { NotificationPayload } from "./notifications/types"
import { signupConflictReason, type SignupConflict } from "./signup-conflict"

export type { SignupConflict } from "./signup-conflict"

type Db = Pick<Tx, "volunteer" | "event" | "registration">

/**
 * The notice to the owner of the address, or null (no address, throttled, unknown event). Read and
 * stamped with `db`: the sign-up's own transaction, so the request does the same locked work and
 * commits an outbox row whether it was recorded or not (AUTHZ-01); its personal link when they hold
 * a live registration on the event. Throttled per volunteer with the link re-send (3 an hour):
 * throttled, nothing is queued, the answer is the same.
 */
export async function signupNotice(db: Db, input: { volunteerId: string; eventId: string; conflict: SignupConflict }): Promise<NotificationPayload | null> {
  const volunteer = await db.volunteer.findFirst({
    where: { id: input.volunteerId },
    select: { email: true, firstName: true, lastName: true },
  })
  if (!volunteer?.email) return null
  if (!(await rateLimit(input.volunteerId, "reg-link-resend", LINK_REQUEST_LIMIT, LINK_REQUEST_WINDOW_MS)).ok) return null
  const event = await db.event.findFirst({
    where: { id: input.eventId },
    select: { title: true, organizationId: true, organization: { select: { slug: true } } },
  })
  if (!event) return null
  // A place or a request first, else the newest waitlisted or offered one: the same page.
  const reg = await db.registration.findFirst({
    where: { volunteerId: input.volunteerId, eventId: input.eventId, status: { in: [...COMMITTED_STATUSES] } },
    select: { editTokenHash: true, editTokenEnc: true, editTokenLegacy: true },
  }) ?? await db.registration.findFirst({
    where: { volunteerId: input.volunteerId, eventId: input.eventId, status: { in: [...LIVE_STATUSES] } },
    select: { editTokenHash: true, editTokenEnc: true, editTokenLegacy: true },
    orderBy: { createdAt: "desc" },
  })
  const editToken = reg ? registrationToken.reveal(reg) : null
  if (editToken) {
    await db.registration.updateMany({
      where: { volunteerId: input.volunteerId, eventId: input.eventId, status: { in: [...LIVE_STATUSES] } },
      data: { linkEmailedAt: new Date() },
    })
  }
  const name = `${volunteer.firstName} ${volunteer.lastName}`
  return {
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
  }
}

/** The same notice outside a sign-up transaction (the rare race lost at the unique index). */
export async function sendSignupNotice(input: { volunteerId: string; eventId: string; conflict: SignupConflict }): Promise<void> {
  try {
    const payload = await signupNotice(prisma, input)
    if (payload) deliverAfterResponse(await enqueueNotifications([payload]))
  } catch (e) {
    // Never the answer's business: the form says the same whatever happens here.
    reportError("signup_notice.send")(e)
  }
}
