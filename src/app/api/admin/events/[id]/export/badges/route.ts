// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { badgeOptionsFrom, renderBadges } from "@/lib/print-badges"
import { ORG_LOGO_SELECT, orgLogoOf } from "@/lib/org-logo"

/** GET /api/admin/events/[id]/export/badges (#190): printable badges of the event's active volunteers. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params

  const event = await guard.db.event.findFirst({
    where: { id },
    select: {
      title: true,
      accentColorKey: true,
      organization: { select: { name: true, logo: ORG_LOGO_SELECT } },
      shifts: {
        where: { status: { not: "cancelled" } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }, { displayOrder: "asc" }],
        select: {
          id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, capacity: true, colorKey: true,
          registrations: {
            where: { status: "active" },
            select: { volunteer: { select: { id: true, firstName: true, lastName: true, email: true } } },
          },
        },
      },
    },
  })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const html = renderBadges({
    eventTitle: event.title,
    organizationName: event.organization.name,
    logo: orgLogoOf(guard.organizationId, event.organization.logo),
    accentColorKey: event.accentColorKey,
    shifts: event.shifts.map((s) => ({
      id: s.id, roleName: s.roleName, label: s.label, date: s.date.toISOString().slice(0, 10),
      startTime: s.startTime, endTime: s.endTime, capacity: s.capacity, colorKey: s.colorKey,
      registrations: s.registrations.map((r) => ({ id: r.volunteer.id, firstName: r.volunteer.firstName, lastName: r.volunteer.lastName, email: r.volunteer.email, phone: null })),
    })),
  }, badgeOptionsFrom(new URL(req.url).searchParams))

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })
}
