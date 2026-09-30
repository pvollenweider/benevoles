// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { listOrgLogs, type OrgLogEntry } from "@/lib/org-log-read"
import { activityCsv, exportFileName } from "@/lib/data-export"
import { orgTimeZone } from "@/lib/time-zone"
// Reads the Organization row for its name and time zone, not a tenant-scoped model.
// eslint-disable-next-line no-restricted-imports
import { prisma } from "@/lib/prisma"

/** The whole activity log of the organization as CSV (#384), oldest entry first. */
export async function GET() {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { organizationId } = guard

  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true, timeZone: true } })
  // listOrgLogs pages by 200 and already resolves actor names; walk every page.
  const entries: OrgLogEntry[] = []
  let cursor: string | undefined
  do {
    const page = await listOrgLogs(organizationId, { limit: 200, cursor })
    entries.push(...page.entries)
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  entries.reverse()

  const now = new Date()
  return new NextResponse(activityCsv(entries, orgTimeZone(org)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(`${org?.name ?? "organisation"}-journal`, now, "csv")}"`,
      "Cache-Control": "no-store",
    },
  })
}
