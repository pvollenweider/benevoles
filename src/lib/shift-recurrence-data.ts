// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { getOrgClient } from "@/lib/prisma-org"
import { COMMITTED_STATUSES } from "@/lib/registration-capacity"
import type { RuleShift } from "@/lib/shift-recurrence"

/**
 * A recurring permanence (#866) and its shifts, through the organisation's scoped client: null
 * when the rule belongs to another organisation (or doesn't exist). Server only.
 */
export async function loadRuleShifts(db: ReturnType<typeof getOrgClient>, ruleId: string) {
  const rule = await db.shiftRecurrence.findFirst({
    where: { id: ruleId },
    include: { event: { select: { id: true, title: true, slug: true, organizationId: true, publicStatus: true, organization: { select: { slug: true } } } } },
  })
  if (!rule) return null
  const rows = await db.shift.findMany({
    where: { recurrenceId: ruleId },
    select: { id: true, date: true, startTime: true, status: true, registrations: { select: { status: true } } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  })
  const committed = new Set<string>(COMMITTED_STATUSES)
  const shifts: RuleShift[] = rows.map((s) => ({
    id: s.id,
    date: s.date.toISOString().slice(0, 10),
    startTime: s.startTime,
    status: s.status,
    committed: s.registrations.filter((r) => committed.has(r.status)).length,
    hasHistory: s.registrations.length > 0,
  }))
  return { rule, shifts }
}
