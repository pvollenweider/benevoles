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
  const orgSlug =
    (await headers()).get("x-org-slug") ??
    new URL(_req.url).searchParams.get("org")

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
