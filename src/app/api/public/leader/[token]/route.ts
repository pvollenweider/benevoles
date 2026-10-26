// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ORG_LIFECYCLE_SELECT, orgLinksOpen } from "@/lib/org-lifecycle"
import { orgUnavailableResponse } from "@/lib/org-lifecycle-response"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { contactPhone } from "@/lib/contact-phone"
import { linkToken } from "@/lib/token-vault"
import { shiftStaffingState } from "@/lib/staffing"
import { leaderPageHeading, leaderScopeOf, scopeRoleNames } from "@/lib/leader-scope"
import { loadPosteSectors } from "@/lib/leader-scope-data"
import { sectorsAdopted } from "@/lib/sectors"

// Read-only roster for a leader (#186): who's signed up on the postes of their scope, one poste or
// one sector (#1169). No mutation here: read-only on purpose, see prisma/schema.prisma's SectorLeader doc.
// The scope is resolved first, at each request (src/lib/leader-scope.ts), and every query below is
// limited to its postes: counts and totals never include another poste (B05), a poste moved out of
// the sector is gone on the next request (B02). Never internal notes nor question answers.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(getClientIp(req), "leader-token-read", 30, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 })

  const { token } = await params

  const leader = await prisma.sectorLeader.findUnique({
    where: linkToken.where(token),
    include: { event: { select: { id: true, title: true, slug: true, sectorsEnabled: true, sectorsAdoptedAt: true, organization: { select: ORG_LIFECYCLE_SELECT } } } },
  })
  if (!leader) return NextResponse.json({ error: "Lien introuvable." }, { status: 404 })
  // No roster at all while the organisation is deactivated or suspended.
  if (!orgLinksOpen(leader.event.organization)) return orgUnavailableResponse()

  const scope = leaderScopeOf(leader)
  if (!scope) return NextResponse.json({ error: "Lien introuvable." }, { status: 404 })

  let scopeName: string
  let roles: string[]
  if (scope.kind === "poste") {
    scopeName = scope.roleName
    roles = [scope.roleName]
  } else {
    // The leader's sector, of this event only.
    const sector = await prisma.sector.findFirst({ where: { id: scope.sectorId, eventId: leader.eventId }, select: { name: true } })
    if (!sector) return NextResponse.json({ error: "Lien introuvable." }, { status: 404 })
    scopeName = sector.name
    roles = scopeRoleNames(leader, await loadPosteSectors(prisma, leader.eventId))
  }
  const roleWhere = scope.kind === "poste" ? scope.roleName : { in: roles }

  const [registrations, minShifts] = roles.length === 0 ? [[], []] : await Promise.all([
    prisma.registration.findMany({
      where: {
        eventId: leader.eventId,
        status: { in: ["active", "waiting"] },
        shift: { roleName: roleWhere },
      },
      include: { volunteer: true, shift: true },
      orderBy: [{ shift: { date: "asc" } }, { shift: { startTime: "asc" } }],
    }),
    // Shifts of the scope that have a minimum of people (#949), with their state, so the leader sees
    // which ones can't run yet, including those nobody has signed up for. None without a minimum.
    prisma.shift.findMany({
      where: { eventId: leader.eventId, roleName: roleWhere, status: { not: "cancelled" }, minVolunteers: { not: null } },
      select: {
        id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, capacity: true, minVolunteers: true,
        registrations: { where: { status: { in: ["active", "requested"] } }, select: { status: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
  ])

  return NextResponse.json({
    event: { title: leader.event.title, slug: leader.event.slug },
    scope: { kind: scope.kind, name: scopeName },
    heading: leaderPageHeading(scopeName, scope.kind, sectorsAdopted(leader.event)),
    // The scope's name, kept for a page loaded before #1169.
    roleName: scopeName,
    postes: roles,
    leaderName: leader.name,
    registrations: registrations.map((r) => ({
      id: r.id,
      status: r.status,
      comment: r.comment,
      volunteer: {
        firstName: r.volunteer.firstName,
        lastName: r.volunteer.lastName,
        email: r.volunteer.email,
        phone: contactPhone(r) ?? "",
      },
      shift: {
        roleName: r.shift.roleName,
        label: r.shift.label,
        date: r.shift.date,
        startTime: r.shift.startTime,
        endTime: r.shift.endTime,
      },
    })),
    staffing: minShifts.map((s) => {
      const active = s.registrations.filter((r) => r.status === "active").length
      const requested = s.registrations.length - active
      return {
        roleName: s.roleName, label: s.label, date: s.date, startTime: s.startTime, endTime: s.endTime,
        capacity: s.capacity, minVolunteers: s.minVolunteers, active,
        state: shiftStaffingState({ capacity: s.capacity, minVolunteers: s.minVolunteers, active, requested }),
      }
    }),
  })
}
