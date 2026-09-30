// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "./prisma"
import { registrationToken } from "./token-vault"
import { deliverAfterResponse, enqueueNotifications } from "./notifications/outbox"
import { rateLimit } from "./rate-limit"
import { LINK_REQUEST_LIMIT, LINK_REQUEST_WINDOW_MS } from "./personal-link"

/**
 * Sends a volunteer their personal link again (#376), through the outbox, and remembers when.
 * One email per event: the link is per registration, but every live registration of the
 * volunteer on the event shares the same page, so the newest one is enough.
 */

export const LIVE_STATUSES = ["active", "waiting", "offered"] as const

type LinkTarget = {
  id: string
  eventId: string
  volunteerId: string
  editTokenHash: string
  editTokenEnc: string | null
  editTokenLegacy: string | null
  volunteer: { firstName: string; lastName: string; email: string | null }
  event: { id: string; title: string; organizationId: string; organization: { slug: string } }
}

export const linkTargetInclude = {
  volunteer: { select: { firstName: true, lastName: true, email: true } },
  event: { select: { id: true, title: true, organizationId: true, organization: { select: { slug: true } } } },
} as const

/** Throttled per volunteer, like the re-send from the sign-up form. False when throttled or without email. */
export async function sendPersonalLink(reg: LinkTarget): Promise<"sent" | "throttled" | "no_email"> {
  if (!reg.volunteer.email) return "no_email"
  if (!(await rateLimit(reg.volunteerId, "reg-link-resend", LINK_REQUEST_LIMIT, LINK_REQUEST_WINDOW_MS)).ok) return "throttled"
  const name = `${reg.volunteer.firstName} ${reg.volunteer.lastName}`
  const ids = await enqueueNotifications([{
    kind: "registration_link_resend",
    organizationId: reg.event.organizationId,
    recipient: { email: reg.volunteer.email, name },
    data: { volunteerName: name, eventTitle: reg.event.title, orgSlug: reg.event.organization.slug, editToken: registrationToken.reveal(reg) },
  }])
  await prisma.registration.updateMany({
    where: { volunteerId: reg.volunteerId, eventId: reg.eventId, status: { in: [...LIVE_STATUSES] } },
    data: { linkEmailedAt: new Date() },
  })
  deliverAfterResponse(ids)
  return "sent"
}
