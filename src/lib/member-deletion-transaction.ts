// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The transactional side of permanently deleting a member (#667, owner decision): locks the
 * Volunteer row, re-checks eligibility under that lock, cancels its pending outbox rows, deletes
 * the record (cascading at the database level to MemberInvite, QuestionAnswer, PushSubscription,
 * DeliveryOutcome and DuplicateDismissal — see prisma/schema.prisma and the schema guard test),
 * and writes the OrgLog entry, all in one transaction, the same shape as
 * src/lib/member-merge-transaction.ts. Bulk deletion (#1305) shares the same write half through
 * `deleteMemberRecord` and the same row lock, batch by batch.
 *
 * The lock is what makes "no race with a concurrent sign-up" true, not just the re-check: holding
 * `FOR UPDATE` on the Volunteer row blocks a concurrent `Registration` insert referencing it,
 * because Postgres takes an implicit `FOR KEY SHARE` lock on the referenced row to enforce the
 * foreign key, and that conflicts with `FOR UPDATE`. So either the sign-up commits first (this
 * transaction then sees a live registration and refuses) or this transaction commits first (the
 * sign-up's insert then fails outright: the member it was inserting against no longer exists) —
 * never a silent in-between where a registration ends up pointing at a deleted member. Proven
 * against a real Postgres in src/__integration__/member-deletion.int.test.ts, the same way
 * member-merge.int.test.ts proves the merge's own row lock.
 *
 * Server-only: imports the generated Prisma client indirectly through OrgScopedPrisma. Never
 * imported from src/lib modules reachable by client components (see CLAUDE.md).
 */

import type { OrgScopedPrisma } from "./prisma-org"
import { memberDeletionEligibility, type MemberDeletionEligibility } from "./member-deletion"
import {
  BULK_DELETE_BATCH_SIZE,
  partitionMembersForBulkDeletion,
  type BulkDeletionResult,
} from "./member-bulk-deletion"
import { cancelOutboxForDeletedMember } from "./outbox-deletion-cancel"
import type { LogActor } from "./event-log"

/** The org-scoped client's transaction, and the delegates the shared write needs. */
type OrgTx = Parameters<Parameters<OrgScopedPrisma["$transaction"]>[0]>[0]
type MemberDeletionTx = Pick<OrgTx, "volunteer" | "orgLog" | "notificationOutbox">

export class MemberDeletionConflictError extends Error {
  constructor(message: string, readonly status: 404 | 409 = 409) {
    super(message)
  }
}

export interface MemberDeletionResult {
  id: string
  outboxCancelled: number
}

/** Message shown in the 409: the pure rule's reason when it's known, a generic fallback otherwise. */
function conflictMessage(eligibility: MemberDeletionEligibility): string {
  return eligibility.eligible ? "La fiche ne peut plus être supprimée." : eligibility.reason
}

/**
 * The write half shared by single and bulk deletion (#667, #1305): cancels the member's pending
 * outbox rows, deletes the record and writes its own OrgLog entry, with the transaction client
 * the caller already locked the row in. Cascades at the database level to MemberInvite,
 * QuestionAnswer, PushSubscription, DeliveryOutcome and DuplicateDismissal (onDelete: Cascade, see
 * prisma/schema.prisma and the schema guard test). Registration has no onDelete clause — if one
 * somehow exists despite the caller's eligibility check (a bug, not the race these functions
 * close), the database itself refuses the delete with a foreign key violation rather than
 * silently orphaning history.
 *
 * Returns the number of outbox rows cancelled. Kept exported so a future deletion path shares this
 * exact shape instead of copying it.
 */
export async function deleteMemberRecord(
  tx: MemberDeletionTx,
  organizationId: string,
  actor: LogActor,
  member: { id: string; email: string | null },
): Promise<number> {
  // NotificationOutbox has no FK to Volunteer (only the sealed payload knows the recipient), so
  // cascading delete can't reach it — cancel what's still pending for this member first.
  const cancelledOutboxIds = await cancelOutboxForDeletedMember(tx, organizationId, { volunteerId: member.id, email: member.email })

  await tx.volunteer.delete({ where: { id: member.id } })

  // Id only, no personal data (owner decision, #667) — same discipline as member.merged.
  await tx.orgLog.create({
    data: {
      organizationId,
      actorType: actor.type,
      actorId: "id" in actor ? (actor.id ?? null) : null,
      action: "member.deleted",
      entityType: "Member",
      entityId: member.id,
    },
  })

  return cancelledOutboxIds.length
}

/**
 * Runs the deletion in one transaction: locks the row, re-validates eligibility under lock
 * (guards the race with a concurrent sign-up, see the module comment above), then deletes through
 * `deleteMemberRecord` — all or nothing. Throws MemberDeletionConflictError (404 if the row
 * vanished, 409 if it's no longer eligible) instead of deleting anything in that case.
 */
export async function runMemberDeletion(
  db: OrgScopedPrisma,
  organizationId: string,
  actor: LogActor,
  id: string,
): Promise<MemberDeletionResult> {
  return db.$transaction(async (tx) => {
    // Lock the row first: see the module comment for why this alone closes the sign-up race.
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Volunteer" WHERE id = ${id} FOR UPDATE`
    if (locked.length === 0) throw new MemberDeletionConflictError("Non trouvé", 404)

    const member = await tx.volunteer.findFirst({ where: { id }, select: { id: true, email: true, active: true, mergedIntoId: true } })
    if (!member) throw new MemberDeletionConflictError("Non trouvé", 404)

    const registrationCount = await tx.registration.count({ where: { volunteerId: id } })
    const eligibility = memberDeletionEligibility(member, registrationCount)
    if (!eligibility.eligible) throw new MemberDeletionConflictError(conflictMessage(eligibility), 409)

    const outboxCancelled = await deleteMemberRecord(tx, organizationId, actor, member)
    return { id, outboxCancelled }
  }, { maxWait: 10_000, timeout: 30_000 })
}

/**
 * The bulk deletion of #1305. The ids are handled in batches, each in one transaction: the batch's
 * rows of this organisation are locked first (the same `FOR UPDATE` as the single action, so a
 * concurrent sign-up either commits before this check or fails once the member is gone), then
 * loaded through the org-scoped client and split by the pure rule. Ineligible records are returned
 * as `skipped` without any write, so one of them never cancels the others. Only an unexpected
 * database failure (not a per-member business reason) aborts its batch; ids of another
 * organisation are simply absent from the scoped read and end up as "not found".
 */
export async function runBulkMemberDeletion(
  db: OrgScopedPrisma,
  organizationId: string,
  actor: LogActor,
  ids: readonly string[],
): Promise<BulkDeletionResult> {
  const unique = [...new Set(ids)]
  const result: BulkDeletionResult = { deleted: [], skipped: [] }

  for (let start = 0; start < unique.length; start += BULK_DELETE_BATCH_SIZE) {
    const batch = unique.slice(start, start + BULK_DELETE_BATCH_SIZE)
    const batchResult = await db.$transaction(async (tx) => {
      // Lock this batch's rows that belong to the organisation before reading anything. Filtering
      // on organizationId here means another tenant's rows are never locked, and the org-scoped
      // read below then treats them exactly like missing ids.
      await tx.$queryRaw`SELECT id FROM "Volunteer" WHERE "organizationId" = ${organizationId} AND id = ANY(${batch}::text[]) ORDER BY id FOR UPDATE`

      const members = await tx.volunteer.findMany({
        where: { id: { in: batch } },
        select: { id: true, firstName: true, lastName: true, email: true, active: true, mergedIntoId: true },
      })
      const counts = await tx.registration.groupBy({
        by: ["volunteerId"],
        where: { volunteerId: { in: batch } },
        _count: { _all: true },
      })
      const countById = new Map(counts.map((row) => [row.volunteerId, row._count._all]))

      const partition = partitionMembersForBulkDeletion(batch, members, countById)
      for (const member of partition.deletable) {
        await deleteMemberRecord(tx, organizationId, actor, member)
      }
      return { deleted: partition.deletable.map((member) => member.id), skipped: partition.skipped }
    }, { maxWait: 10_000, timeout: 30_000 })

    result.deleted.push(...batchResult.deleted)
    result.skipped.push(...batchResult.skipped)
  }

  return result
}
