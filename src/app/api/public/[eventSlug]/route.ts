// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { PUBLIC_ORG_WHERE } from "@/lib/org-approval"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { publicEventInclude, toPublicEvent } from "@/lib/public-event"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ eventSlug: string }> }
) {
  const { eventSlug } = await params
  // The organization the proxy resolved (src/lib/org-subdomain.ts): from the host, or from
  // `?org=` only where that is allowed. Never read from the query here.
  const orgSlug = (await headers()).get("x-org-slug")

  if (!orgSlug) return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 })

  const event = await prisma.event.findFirst({
    where: {
      slug: eventSlug,
      publicStatus: "published",
      organization: { slug: orgSlug, ...PUBLIC_ORG_WHERE },
    },
    include: publicEventInclude,
  })

  if (!event) return NextResponse.json({ error: "Événement non trouvé" }, { status: 404 })

  return NextResponse.json(toPublicEvent(event))
}
