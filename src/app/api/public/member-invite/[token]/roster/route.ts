// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { getClientIp, isRateLimited, rateLimit } from "@/lib/rate-limit"
import { hashToken } from "@/lib/token-hash"
import { resolveOrgSlug } from "@/lib/resolve-org"
import { linkToken } from "@/lib/token-vault"
import { orgTimeZone } from "@/lib/time-zone"
import { inviteRosterAudience, rosterOpen } from "@/lib/shift-roster"
import { loadShiftRoster } from "@/lib/roster-read"

/**
 * The shift roster of a member invitation (#1068): what the event page shows behind « Voir qui est
 * inscrit » to a member the organisation invited to this event, before they sign up. The link was
 * emailed to that member only (it identifies them, unlike a group link). Only names given under
 * the current text reach an invited member (noticeReaches); a member who already holds a confirmed
 * place sees the roster as a confirmed volunteer. Nothing unless the invitation is of this event,
 * on this organisation's site, still open (inviteRosterAudience), the event published with its
 * roster open. Every refusal answers the same 404 and counts against the client's address;
 * private, never cached.
 */

const NO_STORE = { "Cache-Control": "private, no-store" }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const invalid = () => json({ error: "Lien invalide" }, 404)
const HOUR = 60 * 60 * 1000

/** Refusals per IP per hour (unknown, other event's or closed invitation, roster closed), then refused. */
const INVITE_ROSTER_MISSES = 20
/** Reads per valid invitation per hour: the page reads it once per switch. */
const INVITE_ROSTER_READS = 60
const MISS_ROUTE = "member-invite-roster-miss"

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = getClientIp(req)
  if (await isRateLimited(ip, MISS_ROUTE, INVITE_ROSTER_MISSES)) return json({ error: "Trop de tentatives." }, 429)
  const miss = async () => {
    await rateLimit(ip, MISS_ROUTE, INVITE_ROSTER_MISSES, HOUR)
    return invalid()
  }

  const { token } = await params
  const slug = new URL(req.url).searchParams.get("slug")
  // The organisation's site only: the event page is never served without its host.
  const orgSlug = (await headers()).get("x-org-slug")
  if (!slug || !orgSlug) return miss()

  const invite = await prisma.memberInvite.findUnique({
    where: linkToken.where(token),
    select: {
      volunteerId: true, usedAt: true, declinedAt: true,
      volunteer: { select: { active: true, erasedAt: true, mergedIntoId: true } },
      event: { select: { id: true, slug: true, organizationId: true, publicStatus: true, shiftRosterEnabled: true, personalDataAnonymizedAt: true, startDate: true, endDate: true, organization: { select: { timeZone: true } } } },
    },
  })
  if (!invite || invite.event.slug !== slug) return miss()
  const resolved = await resolveOrgSlug(orgSlug)
  if (!resolved || resolved.org.id !== invite.event.organizationId) return miss()

  if (!(await rateLimit(hashToken(token), "member-invite-roster-link", INVITE_ROSTER_READS, HOUR)).ok) return json({ error: "Trop de tentatives." }, 429)

  const { event, volunteer } = invite
  const open = event.publicStatus === "published" && rosterOpen(event, new Date(), orgTimeZone(event.organization))
  const confirmedOnEvent = open && (await prisma.registration.count({ where: { volunteerId: invite.volunteerId, eventId: event.id, status: "active" } })) > 0
  const audience = open
    ? inviteRosterAudience({
        active: volunteer.active, erased: !!volunteer.erasedAt, merged: !!volunteer.mergedIntoId,
        declined: !!invite.declinedAt, used: !!invite.usedAt, confirmedOnEvent,
      })
    : null
  if (!audience) return miss()

  const shifts = await loadShiftRoster({ eventId: event.id, viewerId: invite.volunteerId, audience, eventStart: event.startDate })
  return json({ available: true, shifts })
}
