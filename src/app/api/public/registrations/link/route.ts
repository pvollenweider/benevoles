// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { getClientIp, rateLimit } from "@/lib/rate-limit"
import { linkTargetInclude, LIVE_STATUSES, sendPersonalLink } from "@/lib/personal-link-send"
import { LINK_REQUEST_RESPONSE } from "@/lib/personal-link"
import { validationError } from "@/lib/api-error"

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(200) })

/**
 * « Je n'ai plus mon lien » (#376): given an email, re-send the personal link of every event
 * of this organization where the address has a live registration. The answer is the same
 * whether the address is known or not, so the form can't be used to list who is registered.
 */
export async function POST(req: Request) {
  const rl = await rateLimit(getClientIp(req), "reg-link-request", 5, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return validationError(parsed.error, { useIssueMessage: true })

  // The organization the proxy resolved from the host (x-org-slug; from `?org=` in development
  // only through the proxy itself): a link is only re-sent within it, never across organizations.
  const orgSlug = (await headers()).get("x-org-slug")
  const done = NextResponse.json({ ok: true, message: LINK_REQUEST_RESPONSE })
  if (!orgSlug) return done

  const regs = await prisma.registration.findMany({
    where: {
      status: { in: [...LIVE_STATUSES] },
      volunteer: { email: { equals: parsed.data.email, mode: "insensitive" }, organization: { slug: orgSlug } },
      event: { endDate: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    },
    include: linkTargetInclude,
    orderBy: { createdAt: "desc" },
  })
  // One email per event: the newest registration carries the page for all of them.
  const seen = new Set<string>()
  for (const reg of regs) {
    if (seen.has(reg.eventId)) continue
    seen.add(reg.eventId)
    await sendPersonalLink(reg)
  }
  return done
}
