// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { OrgScopedPrisma } from "./prisma-org"
import { memberRecordState, type MemberRecordState, type RecordStateSource } from "./member-record-state"

const SELECT = { id: true, firstName: true, lastName: true, mergedIntoId: true, mergedAt: true, erasedAt: true } as const

/**
 * One member's record state (#1014) for its own page, through the organisation-scoped client:
 * walks the merge chain (capped at 5 hops, like event-log-read.ts) to the record that holds the
 * person now. Null when the member isn't found in this organisation.
 */
export async function loadMemberRecordState(db: OrgScopedPrisma, id: string, timeZone: string): Promise<MemberRecordState | null> {
  const member = await db.volunteer.findFirst({ where: { id }, select: SELECT })
  if (!member) return null
  const byId = new Map<string, RecordStateSource>([[member.id, member]])
  let next = member.mergedIntoId
  for (let hops = 0; next && hops < 5 && !byId.has(next); hops++) {
    const row = await db.volunteer.findFirst({ where: { id: next }, select: SELECT })
    if (!row) break
    byId.set(row.id, row)
    next = row.mergedIntoId
  }
  return memberRecordState(member, byId, timeZone)
}
