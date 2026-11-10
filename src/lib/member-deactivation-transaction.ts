// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The write half of deactivating a member (#1307): the same soft delete as the single
 * `DELETE /api/admin/members/[id]` action — `active: false` and one `member.deactivated` OrgLog
 * entry, id only — shared by the single action, the new bulk deactivation and the
 * `deactivateKept` option of the bulk deletion, instead of duplicating it.
 *
 * `runBulkMemberDeactivation` handles the ids in batches, each in one transaction: the batch's
 * rows of this organisation are locked first (the same `SELECT … FOR UPDATE` as the bulk
 * deletion), then loaded through the org-scoped client and split by the pure rule. An already
 * inactive record, a merged tombstone or a foreign id writes nothing and is returned as skipped.
 *
 * Server-only: imports the generated Prisma client indirectly through OrgScopedPrisma. Never
 * imported from src/lib modules reachable by client components (see CLAUDE.md).
 */

import type { OrgScopedPrisma } from "./prisma-org"
import {
  BULK_DEACTIVATE_BATCH_SIZE,
  partitionMembersForBulkDeactivation,
  type BulkDeactivationResult,
} from "./member-bulk-deactivation"
import type { LogActor } from "./event-log"

/** The org-scoped client's transaction, and the delegates the shared write needs. */
type OrgTx = Parameters<Parameters<OrgScopedPrisma["$transaction"]>[0]>[0]
type MemberDeactivationTx = Pick<OrgTx, "volunteer" | "orgLog">

/**
 * The write shared by the single and bulk deactivation: marks the record inactive and writes its
 * own `member.deactivated` OrgLog entry (id only, no personal data), with the client — or the
 * transaction client — the caller already checked the record with. This is exactly the effect of
 * `DELETE /api/admin/members/[id]`.
 */
export async function deactivateMemberRecord(
  client: MemberDeactivationTx,
  organizationId: string,
  actor: LogActor,
  memberId: string,
): Promise<void> {
  await client.volunteer.update({ where: { id: memberId }, data: { active: false } })

  await client.orgLog.create({
    data: {
      organizationId,
      actorType: actor.type,
      actorId: "id" in actor ? (actor.id ?? null) : null,
      action: "member.deactivated",
      entityType: "Member",
      entityId: memberId,
    },
  })
}

/**
 * The bulk deactivation of #1307. Each batch is one transaction: the rows of this organisation are
 * locked, read through the org-scoped client, then the active records that aren't merged tombstones
 * go through `deactivateMemberRecord` (one log entry each). Already inactive, merged and foreign
 * ids are returned as `skipped`, and never stop the others.
 */
export async function runBulkMemberDeactivation(
  db: OrgScopedPrisma,
  organizationId: string,
  actor: LogActor,
  ids: readonly string[],
): Promise<BulkDeactivationResult> {
  const unique = [...new Set(ids)]
  const result: BulkDeactivationResult = { deactivated: [], skipped: [] }

  for (let start = 0; start < unique.length; start += BULK_DEACTIVATE_BATCH_SIZE) {
    const batch = unique.slice(start, start + BULK_DEACTIVATE_BATCH_SIZE)
    const batchResult = await db.$transaction(async (tx) => {
      // Filtering on organizationId means another tenant's rows are never locked, and the scoped
      // read below then treats them exactly like missing ids.
      await tx.$queryRaw`SELECT id FROM "Volunteer" WHERE "organizationId" = ${organizationId} AND id = ANY(${batch}::text[]) ORDER BY id FOR UPDATE`

      const members = await tx.volunteer.findMany({
        where: { id: { in: batch } },
        select: { id: true, firstName: true, lastName: true, active: true, mergedIntoId: true },
      })

      const partition = partitionMembersForBulkDeactivation(batch, members)
      for (const member of partition.deactivatable) {
        await deactivateMemberRecord(tx, organizationId, actor, member.id)
      }
      return { deactivated: partition.deactivatable.map((member) => member.id), skipped: partition.skipped }
    }, { maxWait: 10_000, timeout: 30_000 })

    result.deactivated.push(...batchResult.deactivated)
    result.skipped.push(...batchResult.skipped)
  }

  return result
}
