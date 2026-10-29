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
import { availabilitySubmissionSchema } from "@/lib/event-availability"
import { saveAvailabilityAnswers } from "@/lib/event-availability-data"
import { availabilityLinkView, resolveAvailabilityLink } from "@/lib/event-availability-server"
import { LINK_NOT_FOUND_ERROR } from "@/lib/event-availability-text"
import { firstIssueMessage } from "@/lib/shift-time"

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
const notFound = () => json({ error: LINK_NOT_FOUND_ERROR }, 404)

async function open(req: Request, token: string, use: "availabilityLink" | "availabilityAnswer") {
  if (await tokenLookupsBlocked(req, undefined, "availability")) return { response: tooMany() }
  const request = isTokenShaped(token) ? await resolveAvailabilityLink(token) : null
  if (!request) {
    await recordTokenMiss(req, undefined, "availability")
    return { response: notFound() }
  }
  // Not on another organisation's site (#541): the header comes from the proxy alone.
  const orgSlug = (await headers()).get("x-org-slug")
  if (orgSlug) {
    const resolved = await resolveOrgSlug(orgSlug)
    if (!resolved || resolved.org.id !== request.event.organizationId) {
      await recordTokenMiss(req, undefined, "availability")
      return { response: notFound() }
    }
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
  const parsed = availabilitySubmissionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return json({ error: firstIssueMessage(parsed.error) }, 400)
  const result = await prisma.$transaction((tx) => saveAvailabilityAnswers(tx, { eventId: request.eventId, volunteerId: request.volunteerId, days: parsed.data.days, by: "volunteer", tokenHash: hashToken(token) }))
  if (!result.ok) return result.status === 404 ? notFound() : json({ error: result.error, ...(result.at ? { at: result.at } : {}) }, result.status)
  // Which dates changed, never the ranges (personal data stays out of the log).
  await logEvent({ eventId: request.eventId, actor: { type: "volunteer", id: request.volunteerId }, action: "availability.answered", entityType: "Availability", entityId: request.id, changes: { dates: { from: null, to: parsed.data.days.length } } })
  return json(await availabilityLinkView(request))
}
