// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { PUBLIC_ORG_WHERE } from "@/lib/org-approval"
import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { prisma } from "@/lib/prisma"
import { PUBLIC_LIST_WHERE } from "@/lib/event-visibility"

/**
 * Public list of an organization's events: published and listed ones only (#414), scoped to the
 * organization of the host (x-org-slug) or of `?org=`. Never a list across organizations.
 */
export async function GET(req: Request) {
  const orgSlug = (await headers()).get("x-org-slug") ?? new URL(req.url).searchParams.get("org")
  if (!orgSlug) return NextResponse.json({ error: "Organisation introuvable" }, { status: 404 })

  const events = await prisma.event.findMany({
    where: { ...PUBLIC_LIST_WHERE, organization: { slug: orgSlug, ...PUBLIC_ORG_WHERE } },
    include: {
      shifts: {
        where: { status: { in: ["open", "full"] } },
        include: { registrations: { where: { status: "active" } } },
      },
    },
    orderBy: { startDate: "asc" },
  })

  const result = events.map((event) => {
    const totalCapacity = event.shifts.reduce((s, sh) => s + sh.capacity, 0)
    const totalRegistered = event.shifts.reduce((s, sh) => s + sh.registrations.length, 0)
    return {
      id: event.id,
      slug: event.slug,
      title: event.title,
      description: event.description,
      location: event.location,
      startDate: event.startDate,
      endDate: event.endDate,
      totalCapacity,
      totalRegistered,
      spotsLeft: totalCapacity - totalRegistered,
    }
  })

  return NextResponse.json(result)
}
