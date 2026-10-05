// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Server-side loader for the « Doublons possibles » view (#601): loads this organization's members
 * and recent address outcomes (reusing #599's own loader), feeds them to the pure
 * src/lib/member-duplicates.ts, and drops pairs already dismissed with the same signal
 * combination. Deliberately thin — every actual rule lives in the pure module so it stays testable
 * without a database.
 */
import { addressHash } from "./notifications/smtp-outcome"
import { env } from "./env"
import { loadAddressStatuses } from "./delivery-outcomes-data"
import { findDuplicatePairs, withoutDismissed, type DuplicateMemberInput, type DuplicatePair } from "./member-duplicates"

export type DuplicateMemberView = { id: string; firstName: string; lastName: string; active: boolean }

export type DuplicatePairView = DuplicatePair & {
  memberA: DuplicateMemberView
  memberB: DuplicateMemberView
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrgScopedDb = any

/**
 * Every possible-duplicate pair of this organization, ranked, dismissed ones already removed.
 * `db` is the org-scoped client (requireOrgSession/getOrgContext) — every query below is
 * automatically filtered to the caller's organization.
 */
export async function loadDuplicatePairs(db: OrgScopedDb, organizationId: string): Promise<DuplicatePairView[]> {
  const volunteers: {
    id: string
    firstName: string
    lastName: string
    email: string | null
    phone: string | null
    birthDate: Date | null
    active: boolean
    mergedIntoId: string | null
  }[] = await db.volunteer.findMany({
    // Merged tombstones (#600) and erased records (#516, all named « Bénévole effacé ») are never suggested.
    where: { mergedIntoId: null, erasedAt: null },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, birthDate: true, active: true, mergedIntoId: true },
  })
  if (volunteers.length < 2) return []

  const addressStatuses = await loadAddressStatuses(
    organizationId,
    volunteers.map((v) => ({ id: v.id, addressHash: v.email ? addressHash(v.email, env.AUTH_SECRET) : null })),
  )

  const inputs: DuplicateMemberInput[] = volunteers.map((v) => ({
    id: v.id,
    firstName: v.firstName,
    lastName: v.lastName,
    email: v.email,
    phone: v.phone,
    birthDate: v.birthDate,
    active: v.active,
    addressToVerify: (addressStatuses.get(v.id) ?? { kind: "ok" as const }).kind === "to_verify",
    mergedIntoId: v.mergedIntoId,
  }))

  const pairs = findDuplicatePairs(inputs)
  if (pairs.length === 0) return []

  const dismissals: { volunteerIdA: string; volunteerIdB: string; signalsFingerprint: string }[] = await db.duplicateDismissal.findMany({
    select: { volunteerIdA: true, volunteerIdB: true, signalsFingerprint: true },
  })
  const remaining = withoutDismissed(pairs, dismissals)

  const byId = new Map(volunteers.map((v) => [v.id, v]))
  const view = (id: string): DuplicateMemberView => {
    const m = byId.get(id)!
    return { id: m.id, firstName: m.firstName, lastName: m.lastName, active: m.active }
  }
  return remaining.map((p) => ({ ...p, memberA: view(p.memberIdA), memberB: view(p.memberIdB) }))
}

/** Just the count, for the members page header's « Doublons possibles (N) » link. */
export async function countDuplicatePairs(db: OrgScopedDb, organizationId: string): Promise<number> {
  return (await loadDuplicatePairs(db, organizationId)).length
}
