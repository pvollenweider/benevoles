// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Loads what member-deletion.ts's pure rule needs, through the org-scoped client (#667). Kept
 * out of member-deletion.ts itself (Prisma import, see that module's own comment).
 */

import type { OrgScopedPrisma } from "./prisma-org"
import { memberDeletionEligibility, type MemberDeletionEligibility, type MemberDeletionSubject } from "./member-deletion"

/** One member's eligibility (the member page). Null when the record isn't found (404 upstream). */
export async function loadMemberDeletionEligibility(db: OrgScopedPrisma, volunteerId: string): Promise<MemberDeletionEligibility | null> {
  const member = await db.volunteer.findFirst({ where: { id: volunteerId }, select: { active: true, mergedIntoId: true } })
  if (!member) return null
  const registrationCount = await db.registration.count({ where: { volunteerId } })
  return memberDeletionEligibility(member, registrationCount)
}

/**
 * Every member's deletion facts in one extra query (the members list, like loadAddressStatuses):
 * groups every Registration row of the organisation by volunteer, any status included. The count
 * is reused by the list's bulk deletion checkbox (#1307), so it needs no request of its own.
 */
export interface MemberDeletionFacts {
  eligibility: MemberDeletionEligibility
  registrationCount: number
}

export async function loadMemberDeletionFacts(db: OrgScopedPrisma, members: (MemberDeletionSubject & { id: string })[]): Promise<Map<string, MemberDeletionFacts>> {
  const counts = await db.registration.groupBy({ by: ["volunteerId"], _count: { _all: true } })
  const countById = new Map(counts.map((c) => [c.volunteerId, c._count._all]))
  const result = new Map<string, MemberDeletionFacts>()
  for (const m of members) {
    const registrationCount = countById.get(m.id) ?? 0
    result.set(m.id, { eligibility: memberDeletionEligibility(m, registrationCount), registrationCount })
  }
  return result
}

/** The eligibility alone, for callers that don't need the registration count. */
export async function loadMemberDeletionEligibilities(db: OrgScopedPrisma, members: (MemberDeletionSubject & { id: string })[]): Promise<Map<string, MemberDeletionEligibility>> {
  const facts = await loadMemberDeletionFacts(db, members)
  return new Map([...facts].map(([id, fact]) => [id, fact.eligibility]))
}
