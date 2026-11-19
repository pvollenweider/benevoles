// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ORG_LIFECYCLE_SELECT, orgLinksOpen } from "@/lib/org-lifecycle"
import { orgUnavailableResponse } from "@/lib/org-lifecycle-response"
import { registrationToken } from "@/lib/token-vault"
import { ensureOrgLink, type OrgLinkDb } from "@/lib/org-link"
import { sendOrgLinkNow } from "@/lib/org-link-send"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { LIVE_STATUSES } from "@/lib/registration-capacity"
import { ORG_LINK_ALREADY_REQUESTED_RESPONSE, ORG_LINK_EMAILED_RESPONSE } from "@/lib/personal-link"
import { reportError } from "@/lib/report-error"

/**
 * « Retrouver toutes mes inscriptions » on an event's personal page (#1429, lot A): emails the
 * organisation-wide link to the address already known behind this event token. The event token
 * never displays, returns or derives the organisation link; the answer is the same whether the
 * address is known or not, and the per-volunteer throttle is the lost-link one.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(getClientIp(req), "reg-link-resend-ip", 10, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives. Réessaie dans une heure." }, { status: 429 })

  const { token } = await params
  const reg = await prisma.registration.findFirst({
    where: { ...registrationToken.where(token), status: { in: [...LIVE_STATUSES] } },
    select: {
      volunteerId: true,
      volunteer: { select: { firstName: true, lastName: true, email: true } },
      event: {
        select: {
          organizationId: true,
          organization: { select: { id: true, name: true, slug: true, ...ORG_LIFECYCLE_SELECT } },
        },
      },
    },
  })
  if (!reg) return NextResponse.json({ error: "Inscription introuvable ou déjà annulée." }, { status: 404 })
  if (!orgLinksOpen(reg.event.organization)) return orgUnavailableResponse()

  try {
    const link = reg.volunteer.email
      ? await ensureOrgLink(prisma as unknown as OrgLinkDb, reg.volunteerId, reg.event.organizationId)
      : null
    if (link) {
      const outcome = await sendOrgLinkNow({
        kind: "org_personal_link",
        volunteer: { id: reg.volunteerId, ...reg.volunteer },
        organization: { id: reg.event.organization.id, name: reg.event.organization.name, slug: reg.event.organization.slug },
        link,
      })
      // No address behind the event link, or the per-volunteer throttle sent one recently: the
      // same 200 and a neutral answer, so the status never reveals whether an address exists.
      if (outcome === "throttled") return NextResponse.json({ ok: true, message: ORG_LINK_ALREADY_REQUESTED_RESPONSE })
    }
  } catch (e) {
    reportError("org-link.old-page")(e)
  }
  // No email address, or no token that could be re-sent: still the same neutral answer.
  return NextResponse.json({ ok: true, message: ORG_LINK_EMAILED_RESPONSE })
}
