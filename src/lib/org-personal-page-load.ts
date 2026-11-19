// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Server read of /mes-inscriptions/<token> (#1429, lot A). Kept out of the page file so tests can
 * exercise the scope and the data without rendering, and so generateMetadata and the page share
 * one cached read per request.
 *
 * The token is the only input: the volunteer and the organisation come from it, and the
 * registrations are constrained by both. A manipulated registration or event id never reaches
 * this query.
 */

import { cache } from "react"
import { prisma } from "./prisma"
import { lookupOrgLink, type OrgLinkDb, type OrgLinkTarget } from "./org-link"
import { orgLinksOpen } from "./org-lifecycle"
import { orgBaseUrl } from "./urls"
import { orgTimeZone } from "./time-zone"
import { contactEmail } from "./site"
import { buildOrgPageData, type OrgPageData } from "./org-personal-page"
import { LIVE_STATUSES } from "./registration-capacity"
import { guardTokenLookup, pageClient } from "./token-page-guard"
import { tokenUseAllowed } from "./token-rate-limit"
import { registrationToken } from "./token-vault"
import { calendarFeedKeyFromEnv, orgCalendarFeedToken, orgCalendarFeedUrls } from "./calendar-feed"

export type OrgPageLoaded =
  /** The connection used up its unknown-link budget. */
  | { state: "blocked" }
  /** No volunteer holds this token. */
  | { state: "invalid" }
  | { state: "unavailable"; contact: string | null }
  | { state: "ok"; data: OrgPageData }

export const loadOrgPage = cache(async (token: string): Promise<OrgPageLoaded> => {
  const guarded = await guardTokenLookup<OrgLinkTarget | null>(
    await pageClient(),
    () => lookupOrgLink(prisma as unknown as OrgLinkDb, token),
    (target) => target === null,
  )
  if (guarded.blocked) return { state: "blocked" }
  const target = guarded.value
  if (!target) return { state: "invalid" }
  if (!orgLinksOpen(target.organization)) return { state: "unavailable", contact: contactEmail() }
  // A valid link is read at most 60 times an hour, like the event page's API: a page left open in
  // a loop must not query the database without end.
  if (!(await tokenUseAllowed(token, "read"))) return { state: "blocked" }

  const timeZone = orgTimeZone(target.organization)
  const registrations = await prisma.registration.findMany({
    where: {
      volunteerId: target.id,
      // Every live state the volunteer can see and act on; the organisation comes from the token,
      // never from a parameter of the request.
      status: { in: [...LIVE_STATUSES] },
      event: { organizationId: target.organizationId },
    },
    select: {
      id: true,
      status: true,
      waitingPosition: true,
      waitingExpiresAt: true,
      shift: { select: { id: true, roleName: true, label: true, date: true, startTime: true, endTime: true } },
      event: { select: { id: true, title: true, slug: true, publicStatus: true, cancelDeadlineDays: true, cancelDeadlineHours: true } },
    },
    orderBy: [{ shift: { date: "asc" } }, { shift: { startTime: "asc" } }],
  })

  const baseUrl = orgBaseUrl(target.organization.slug)
  // The organisation calendar feed (#1429, lot C): its own read-only address, derived from the
  // organisation link's current hash and issued only when the app can derive its key. Nothing is
  // stored; a renewed or cleared link changes the hash and revokes the address with it.
  const feedKey = calendarFeedKeyFromEnv()
  const calendarFeed =
    feedKey && target.orgLinkTokenHash
      ? orgCalendarFeedUrls(baseUrl, orgCalendarFeedToken(target.id, target.orgLinkTokenHash, feedKey))
      : null

  const data = buildOrgPageData({
    volunteer: { firstName: target.firstName, lastName: target.lastName, email: target.email },
    organization: { name: target.organization.name, slug: target.organization.slug, timeZone: target.organization.timeZone },
    registrations,
    now: new Date(),
    timeZone,
    orgHomeUrl: baseUrl,
    contactEmail: contactEmail(),
    calendarFeed,
  })

  return { state: "ok", data }
})

export type OrgEventTargetLoaded =
  | { state: "blocked" }
  | { state: "invalid" }
  | { state: "unavailable"; contact: string | null }
  /** The event is not one of this volunteer's upcoming registrations in this organisation. */
  | { state: "not_found" }
  | { state: "redirect"; editToken: string }

/**
 * Server-side hop from the organisation page to an event's own personal page (#1429): the event
 * token is resolved after the organisation token proved the same volunteer and organisation, and
 * only for an event they still hold a live registration on. It is then reached by a redirect, so
 * the organisation page's HTML never contains another volunteer's link.
 */
export const loadOrgEventTarget = cache(async (token: string, eventId: string): Promise<OrgEventTargetLoaded> => {
  const guarded = await guardTokenLookup<OrgLinkTarget | null>(
    await pageClient(),
    () => lookupOrgLink(prisma as unknown as OrgLinkDb, token),
    (target) => target === null,
  )
  if (guarded.blocked) return { state: "blocked" }
  const target = guarded.value
  if (!target) return { state: "invalid" }
  if (!orgLinksOpen(target.organization)) return { state: "unavailable", contact: contactEmail() }
  if (!(await tokenUseAllowed(token, "read"))) return { state: "blocked" }

  const registration = await prisma.registration.findFirst({
    where: {
      volunteerId: target.id,
      eventId,
      status: { in: [...LIVE_STATUSES] },
      event: { organizationId: target.organizationId },
    },
    select: { editTokenEnc: true, editTokenLegacy: true },
  })
  if (!registration) return { state: "not_found" }
  try {
    return { state: "redirect", editToken: registrationToken.reveal(registration) }
  } catch {
    // The encryption key that would open the event page is not configured here: no link to give.
    return { state: "not_found" }
  }
})
