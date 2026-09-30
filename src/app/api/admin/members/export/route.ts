// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { exportFileName, membersCsv } from "@/lib/data-export"
import { orgTimeZone } from "@/lib/time-zone"
// Reads the Organization row for its name and time zone, not a tenant-scoped model.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"

/** Every member of the organization as CSV (#384), inactive ones included. */
export async function GET() {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard

  const [org, members] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, timeZone: true } }),
    db.volunteer.findMany({
      select: {
        firstName: true, lastName: true, email: true, phone: true, tags: true, active: true, notes: true, birthDate: true,
        availabilityPeriods: true, availabilityNote: true, createdAt: true,
        _count: { select: { registrations: { where: { status: "active" } } } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ])
  const now = new Date()
  const csv = membersCsv(members.map(({ _count, ...m }) => ({ ...m, registrationCount: _count.registrations })), orgTimeZone(org))
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(`${org?.name ?? "organisation"}-membres`, now, "csv")}"`,
      "Cache-Control": "no-store",
    },
  })
}
