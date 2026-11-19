// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { LINKS_OPEN_WHERE } from "@/lib/org-lifecycle"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { LIVE_STATUSES } from "@/lib/registration-capacity"
import { ensureOrgLink, type OrgLinkDb } from "@/lib/org-link"
import { sendOrgLinkNow } from "@/lib/org-link-send"
import { LINK_REQUEST_RESPONSE } from "@/lib/personal-link"
import { validationError } from "@/lib/api-error"
import { reportError } from "@/lib/report-error"

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(200) })

/**
 * « Je n'ai plus mon lien » (#376, organisation-wide since #1429): given an email, send ONE email
 * with the organisation's personal link — issued lazily — when the address has a live registration
 * in this organisation. The answer is the same whether the address is known or not, so the form
 * can't be used to list who is registered. The link itself is never in the response.
 */
export async function POST(req: Request) {
  const rl = await rateLimit(getClientIp(req), "reg-link-request", 5, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives. Réessaie dans une heure." }, { status: 429 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error, { useIssueMessage: true })

  // The organization the proxy resolved from the host (x-org-slug; from `?org=` in development
  // only through the proxy itself): a link is only re-sent within it, never across organizations.
  const orgSlug = (await headers()).get("x-org-slug")
  const done = NextResponse.json({ ok: true, message: LINK_REQUEST_RESPONSE })
  if (!orgSlug) return done

  const reg = await prisma.registration.findFirst({
    where: {
      status: { in: [...LIVE_STATUSES] },
      // Never for a deactivated or suspended organisation: its links open nothing (src/lib/org-lifecycle.ts).
      volunteer: { email: { equals: parsed.data.email, mode: "insensitive" }, organization: { slug: orgSlug, ...LINKS_OPEN_WHERE } },
      event: { endDate: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    },
    select: {
      volunteerId: true,
      volunteer: { select: { firstName: true, lastName: true, email: true } },
      event: { select: { organizationId: true, organization: { select: { id: true, name: true, slug: true } } } },
    },
    orderBy: { createdAt: "desc" },
  })
  if (reg?.volunteer.email) {
    // One email, not one per event. A request over the per-volunteer throttle sends nothing,
    // silently, and a queue failure must not change the answer either: it is the same whether the
    // address is known or not.
    try {
      const link = await ensureOrgLink(prisma as unknown as OrgLinkDb, reg.volunteerId, reg.event.organizationId)
      if (link) {
        await sendOrgLinkNow({
          kind: "org_personal_link",
          volunteer: { id: reg.volunteerId, ...reg.volunteer },
          organization: { id: reg.event.organization.id, name: reg.event.organization.name, slug: reg.event.organization.slug },
          link,
        })
      }
    } catch (e) {
      reportError("org-link.request")(e)
    }
  }
  return done
}
