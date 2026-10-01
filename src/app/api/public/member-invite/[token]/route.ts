// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { resolveOrgSlug } from "@/lib/resolve-org"
import { linkToken } from "@/lib/token-vault"
import { allowedReservedRoles, reservedRoles } from "@/lib/role-reservation"

/** One answer for every refusal: an unknown, revoked or foreign invitation looks the same (#541). */
const invalid = () => NextResponse.json({ error: "Lien invalide" }, { status: 404 })

/** The event page reads it once per load; above this, someone is trying tokens. */
const MEMBER_INVITE_READS_PER_HOUR = 30

/**
 * Public endpoint that resolves a MemberInvite token to the volunteer info
 * needed to pre-fill the registration form. Validates that the invite
 * belongs to the same event as the requested slug, and to the organization of the host.
 * Rate limited per client IP before anything is read (#541): the answer holds the member's
 * name, email and phone.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const rl = await rateLimit(getClientIp(req), "member-invite-read", MEMBER_INVITE_READS_PER_HOUR, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 })

  const { token } = await params
  const url = new URL(req.url)
  const expectedSlug = url.searchParams.get("slug")

  const invite = await prisma.memberInvite.findUnique({
    where: linkToken.where(token),
    include: {
      volunteer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          active: true,
          tags: true,
        },
      },
      event: { select: { slug: true, organizationId: true, shifts: { where: { status: { not: "cancelled" } }, select: { roleName: true, reservedTags: true } } } },
    },
  })

  if (!invite || !invite.volunteer.active) return invalid()

  // Defense: refuse to leak volunteer info if the token does not match the
  // event the visitor is currently looking at.
  if (expectedSlug && invite.event.slug !== expectedSlug) return invalid()

  // Nor on another organization's site (#541): event slugs are only unique per organization.
  // The header comes from the proxy alone; without one (no org subdomain), the slug check holds.
  const orgSlug = (await headers()).get("x-org-slug")
  if (orgSlug) {
    const resolved = await resolveOrgSlug(orgSlug)
    if (!resolved || resolved.org.id !== invite.event.organizationId) return invalid()
  }

  return NextResponse.json({
    eventSlug: invite.event.slug,
    // The reserved roles (#470) this invitation opens; the member's tags themselves stay private.
    reservedRolesAllowed: allowedReservedRoles(reservedRoles(invite.event.shifts), invite.volunteer.tags),
    member: {
      firstName: invite.volunteer.firstName,
      lastName: invite.volunteer.lastName,
      email: invite.volunteer.email ?? "",
      phone: invite.volunteer.phone ?? "",
    },
  })
}
