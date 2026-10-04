// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { resolveOrgSlug } from "@/lib/resolve-org"
import { linkToken } from "@/lib/token-vault"
import { logEvent } from "@/lib/event-log"

/** One answer for every refusal: an unknown, revoked or foreign invitation looks the same (#541). */
const invalid = () => NextResponse.json({ error: "Lien invalide" }, { status: 404 })

/** A handful of confirmations per hour is plenty for one real person; above that, token guessing. */
const MEMBER_INVITE_DECLINE_PER_HOUR = 10

/**
 * « Je ne suis pas disponible pour cet événement » (#558): the confirmation step of the second
 * action offered from the invitation (email and event page). Never a GET — a link scanner in a
 * mail client must not answer for the person — so this is reached only by the explicit confirm
 * button. Mirrors the other MemberInvite public route: rate limited per IP before any read, the
 * token looked up by its hash, the same 404 for an unknown, revoked or foreign invitation, and
 * idempotent (re-confirming changes nothing and is not logged again).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const rl = await rateLimit(getClientIp(req), "member-invite-decline", MEMBER_INVITE_DECLINE_PER_HOUR, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 })

  const { token } = await params
  const url = new URL(req.url)
  const expectedSlug = url.searchParams.get("slug")

  const invite = await prisma.memberInvite.findUnique({
    where: linkToken.where(token),
    select: {
      id: true,
      volunteerId: true,
      eventId: true,
      declinedAt: true,
      volunteer: { select: { active: true } },
      event: { select: { slug: true, organizationId: true } },
    },
  })

  if (!invite || !invite.volunteer.active) return invalid()
  if (expectedSlug && invite.event.slug !== expectedSlug) return invalid()

  const orgSlug = (await headers()).get("x-org-slug")
  if (orgSlug) {
    const resolved = await resolveOrgSlug(orgSlug)
    if (!resolved || resolved.org.id !== invite.event.organizationId) return invalid()
  }

  // Conditional on declinedAt still being null (#558): a double submit (two tabs, a retried
  // request) changes nothing the second time, and is not logged twice.
  const { count } = await prisma.memberInvite.updateMany({
    where: { id: invite.id, declinedAt: null },
    data: { declinedAt: new Date() },
  })

  if (count > 0) {
    // No personal data in `changes` (#558): the subject is already named by entityId/eventId.
    await logEvent({
      eventId: invite.eventId,
      actor: { type: "volunteer", id: invite.volunteerId },
      action: "memberinvite.declined",
      entityType: "MemberInvite",
      entityId: invite.id,
    })
  }

  return NextResponse.json({ success: true })
}
