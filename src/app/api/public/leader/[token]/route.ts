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

// Read-only roster for a sector leader (#186): who's signed up for their roleName's shifts.
// No mutation here — v1 is intentionally read-only, see prisma/schema.prisma's SectorLeader doc.
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(getClientIp(req), "leader-token-read", 30, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 })

  const { token } = await params

  const leader = await prisma.sectorLeader.findUnique({
    where: linkToken.where(token),
    include: { event: { select: { id: true, title: true, slug: true, organization: { select: ORG_LIFECYCLE_SELECT } } } },
  })
  if (!leader) return NextResponse.json({ error: "Lien introuvable." }, { status: 404 })
  // No roster at all while the organisation is deactivated or suspended.
  if (!orgLinksOpen(leader.event.organization)) return orgUnavailableResponse()

  const registrations = await prisma.registration.findMany({
    where: {
      eventId: leader.eventId,
      status: { in: ["active", "waiting"] },
      shift: { roleName: leader.roleName },
    },
    include: { volunteer: true, shift: true },
    orderBy: [{ shift: { date: "asc" } }, { shift: { startTime: "asc" } }],
  })

  // Shifts of the role that have a minimum of people (#949), with their state, so the leader sees
  // which ones can't run yet, including those nobody has signed up for. None without a minimum.
  const minShifts = await prisma.shift.findMany({
    where: { eventId: leader.eventId, roleName: leader.roleName, status: { not: "cancelled" }, minVolunteers: { not: null } },
    select: {
      id: true, label: true, date: true, startTime: true, endTime: true, capacity: true, minVolunteers: true,
      registrations: { where: { status: { in: ["active", "requested"] } }, select: { status: true } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  })

  return NextResponse.json({
    event: { title: leader.event.title, slug: leader.event.slug },
    roleName: leader.roleName,
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
        label: s.label, date: s.date, startTime: s.startTime, endTime: s.endTime,
        capacity: s.capacity, minVolunteers: s.minVolunteers, active,
        state: shiftStaffingState({ capacity: s.capacity, minVolunteers: s.minVolunteers, active, requested }),
      }
    }),
  })
}
