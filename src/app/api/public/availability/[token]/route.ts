// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { orgLinksOpen } from "@/lib/org-lifecycle"
import { orgUnavailableResponse } from "@/lib/org-lifecycle-response"
import { resolveOrgSlug } from "@/lib/resolve-org"
import { recordTokenMiss, tokenLookupsBlocked, tokenUseAllowed } from "@/lib/token-rate-limit"
import { hashToken } from "@/lib/token-hash"
import { isTokenShaped } from "@/lib/token-path"
import { logEvent } from "@/lib/event-log"
import { availabilitySubmissionSchema, submissionIssue } from "@/lib/event-availability"
import { saveAvailabilityAnswers } from "@/lib/event-availability-data"
import { availabilityLinkView, resolveAvailabilityLink } from "@/lib/event-availability-server"
import { LINK_NOT_FOUND_ERROR } from "@/lib/event-availability-text"
import { queueAvailabilityChangeNotifications } from "@/lib/availability-change-notifications"
import { randomUUID } from "node:crypto"
import { deliverAfterResponse } from "@/lib/notifications/outbox"
import { reportError } from "@/lib/report-error"

/**
 * The link « Indiquer mes disponibilités » (#1146): GET reads the person's own answer, PUT saves the
 * dates sent. Only through the link's secret (looked up by its hash), never another person's
 * answer. Failed lookups count per IP in their own family, valid use per link; an unknown, revoked,
 * foreign or stopped link answers the same 404. Writes only by PUT with a JSON body (no GET write,
 * nothing a mail scanner can trigger). Private, never cached.
 */

const NO_STORE = { "Cache-Control": "private, no-store" }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const tooMany = () => json({ error: "Trop de tentatives." }, 429)
/**
 * The same answer for an unknown, revoked or foreign link. The organisation's name comes from the
 * site the page is on (its subdomain), never from the link: the person learns whom to ask for a new
 * link, and nothing about the link. No address here (the organisation's reply address is shown only
 * behind a valid link); the email that carried the link can be answered.
 */
const notFound = (site: { name: string } | null) => json({ error: LINK_NOT_FOUND_ERROR, ...(site ? { organizationName: site.name } : {}) }, 404)

async function open(req: Request, token: string, use: "availabilityLink" | "availabilityAnswer") {
  // The site's organisation (#541): the header comes from the proxy alone.
  const orgSlug = (await headers()).get("x-org-slug")
  const site = orgSlug ? (await resolveOrgSlug(orgSlug))?.org ?? null : null
  if (await tokenLookupsBlocked(req, undefined, "availability")) return { response: tooMany() }
  const request = isTokenShaped(token) ? await resolveAvailabilityLink(token) : null
  if (!request) {
    await recordTokenMiss(req, undefined, "availability")
    return { response: notFound(site) }
  }
  // Not on another organisation's site.
  if (orgSlug && (!site || site.id !== request.event.organizationId)) {
    await recordTokenMiss(req, undefined, "availability")
    return { response: notFound(site) }
  }
  if (!orgLinksOpen(request.event.organization)) return { response: orgUnavailableResponse() }
  if (!(await tokenUseAllowed(token, use))) return { response: tooMany() }
  return { request }
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { request, response } = await open(req, token, "availabilityLink")
  if (response) return response
  return json(await availabilityLinkView(request))
}

export async function PUT(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { request, response } = await open(req, token, "availabilityAnswer")
  if (response) return response
  const body = await req.json().catch(() => null)
  const parsed = availabilitySubmissionSchema.safeParse(body)
  if (!parsed.success) return json(submissionIssue(parsed.error, body), 400)
  const result = await prisma.$transaction((tx) => saveAvailabilityAnswers(tx, { eventId: request.eventId, volunteerId: request.volunteerId, days: parsed.data.days, by: "volunteer", tokenHash: hashToken(token) }))
  if (!result.ok) return result.status === 404 ? notFound(null) : json({ error: result.error, ...(result.at ? { at: result.at } : {}) }, result.status)
  // Which dates changed, never the ranges (personal data stays out of the log).
  await logEvent({ eventId: request.eventId, actor: { type: "volunteer", id: request.volunteerId }, action: "availability.answered", entityType: "Availability", entityId: request.id, changes: { dates: { from: null, to: parsed.data.days.length } } })
  // Corrected after a publication of drafts (#1146, lot C): the organisers are told, nobody moves.
  if (result.afterPublication?.changed) {
    try {
      const person = await prisma.volunteer.findUnique({ where: { id: request.volunteerId }, select: { firstName: true, lastName: true } })
      deliverAfterResponse(await queueAvailabilityChangeNotifications({
        event: { id: request.eventId, title: request.event.title, organizationId: request.event.organizationId },
        volunteerId: request.volunteerId,
        volunteerName: `${person?.firstName ?? ""} ${person?.lastName ?? ""}`.trim(),
        outside: result.afterPublication.newlyOutside,
        changeId: randomUUID(),
      }))
    } catch (e) {
      // The answer and its « à revoir » flag are saved: the page shows it even without the email.
      reportError("availability.notify")(e)
    }
  }
  return json(await availabilityLinkView(request))
}
