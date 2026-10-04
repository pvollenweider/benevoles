// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { exportFileName, memberHoursCsv } from "@/lib/data-export"
import { orgTimeZone } from "@/lib/time-zone"
import { defaultPeriod, memberHourTotals, volunteerHourEntries, type Period } from "@/lib/volunteer-hours"
// Reads the Organization row for its name and time zone, not a tenant-scoped model.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Hours by volunteer for a period (#557): one line per member with at least one confirmed shift in
 * the period, events, shift count, planned and attested hours, and a total line. `includeAll=1`
 * also lists members without one, at zero — answers "who hasn't taken part since…" without a new
 * screen. Same counting rules as the certificate (#556): active registrations on a shift that was
 * never cancelled, a shift belongs to a period by its local start date.
 */
export async function GET(req: Request) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, timeZone: true } })
  const timeZone = orgTimeZone(org)
  const now = new Date()

  const url = new URL(req.url)
  const qFrom = url.searchParams.get("from")
  const qTo = url.searchParams.get("to")
  const hasExplicitPeriod = ISO_DATE.test(qFrom ?? "") && ISO_DATE.test(qTo ?? "")
  if (hasExplicitPeriod && qFrom! > qTo!) {
    return NextResponse.json({ error: "La période est invalide : la date de fin précède la date de début." }, { status: 400 })
  }
  const period: Period = hasExplicitPeriod ? { from: qFrom!, to: qTo! } : defaultPeriod(now, timeZone)
  const includeAll = url.searchParams.get("includeAll") === "1"

  // One query for every member's registrations in the period (filtered at the database level by
  // the shift's calendar day), then pure aggregation — no per-member round trip.
  const fromDate = new Date(`${period.from}T00:00:00Z`)
  const toDate = new Date(`${period.to}T00:00:00Z`)
  const volunteers = await db.volunteer.findMany({
    select: {
      id: true, firstName: true, lastName: true,
      registrations: {
        where: { status: "active", shift: { date: { gte: fromDate, lte: toDate } } },
        select: {
          id: true, status: true, checkedInAt: true,
          shift: { select: { id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, status: true } },
          event: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })

  const entries = volunteerHourEntries(
    volunteers.flatMap((v) => v.registrations.map((r) => ({ ...r, volunteerId: v.id }))),
    timeZone,
    period,
  )
  const totalsByVolunteer = new Map(memberHourTotals(entries).map((t) => [t.volunteerId, t]))

  const rows = volunteers
    .map((v) => {
      const t = totalsByVolunteer.get(v.id)
      return {
        firstName: v.firstName,
        lastName: v.lastName,
        eventsCount: t?.eventsCount ?? 0,
        shiftsCount: t?.shiftsCount ?? 0,
        plannedHours: Math.round(((t?.plannedMinutes ?? 0) / 60) * 100) / 100,
        attestedHours: Math.round(((t?.attestedMinutes ?? 0) / 60) * 100) / 100,
      }
    })
    .filter((r) => includeAll || r.shiftsCount > 0)

  const csv = memberHoursCsv(rows)
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(`${org?.name ?? "organisation"}-heures-benevoles`, now, "csv")}"`,
      "Cache-Control": "no-store",
    },
  })
}
