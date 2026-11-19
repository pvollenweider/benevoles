// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Queues and sends the organisation-wide personal link (#1429, lot A), always through the outbox.
 * One email, never one per event, and never the link itself in a JSON response.
 *
 * « J'ai perdu mon lien » and the old event page's « Retrouver toutes mes inscriptions » share
 * the same per-volunteer throttle (`sendOrgLinkNow`). A renewal skips it: it already had to pass
 * the link's own rate limit, and it must not be silently dropped (the old link is gone).
 */

import { enqueueNotifications, deliverAfterResponse } from "./notifications/outbox"
import type { NotificationPayload } from "./notifications/types"
import type { OrgLinkIssued } from "./org-link"
import { rateLimit } from "./rate-limit"
import { LINK_REQUEST_LIMIT, LINK_REQUEST_WINDOW_MS } from "./personal-link"

export type OrgLinkRecipient = {
  id: string
  firstName: string
  lastName: string
  email: string | null
}

export type OrgLinkOrganization = { id: string; name: string; slug: string }

export type OrgLinkEmailKind = "org_personal_link" | "org_personal_link_renewed"

const displayName = (v: Pick<OrgLinkRecipient, "firstName" | "lastName">) => `${v.firstName} ${v.lastName}`.trim()

/** The payload of the one email, shared by the transaction paths and the request paths. */
export function orgLinkNotification(input: {
  kind: OrgLinkEmailKind
  volunteer: Pick<OrgLinkRecipient, "firstName" | "lastName" | "email">
  volunteerId: string
  organization: OrgLinkOrganization
  token: string
}): NotificationPayload {
  return {
    kind: input.kind,
    organizationId: input.organization.id,
    volunteerId: input.volunteerId,
    recipient: { email: input.volunteer.email, name: displayName(input.volunteer) },
    data: {
      volunteerName: displayName(input.volunteer),
      organizationName: input.organization.name,
      orgSlug: input.organization.slug,
      orgToken: input.token,
    },
  }
}

/** Queues the email and schedules its delivery; returns the outbox ids. Without an address: none. */
export async function enqueueOrgLink(input: {
  kind: OrgLinkEmailKind
  volunteer: OrgLinkRecipient
  organization: OrgLinkOrganization
  link: OrgLinkIssued
  db?: Parameters<typeof enqueueNotifications>[1]
}): Promise<string[]> {
  if (!input.volunteer.email) return []
  const ids = await enqueueNotifications([
    orgLinkNotification({
      kind: input.kind,
      volunteer: input.volunteer,
      volunteerId: input.volunteer.id,
      organization: input.organization,
      token: input.link.token,
    }),
  ], input.db)
  return ids
}

/**
 * Sends a lost link or the old page's link now, throttled per volunteer like the per-event re-send
 * (LINK_REQUEST_LIMIT per hour). `throttled` means nothing was queued.
 */
export async function sendOrgLinkNow(input: {
  kind: OrgLinkEmailKind
  volunteer: OrgLinkRecipient
  organization: OrgLinkOrganization
  link: OrgLinkIssued
}): Promise<"sent" | "throttled" | "no_email"> {
  if (!input.volunteer.email) return "no_email"
  const allowed = await rateLimit(input.volunteer.id, "reg-org-link-resend", LINK_REQUEST_LIMIT, LINK_REQUEST_WINDOW_MS)
  if (!allowed.ok) return "throttled"
  const ids = await enqueueOrgLink(input)
  deliverAfterResponse(ids)
  return "sent"
}
