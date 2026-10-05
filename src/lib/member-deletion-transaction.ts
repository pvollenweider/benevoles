// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The transactional side of permanently deleting a member (#667, owner decision): locks the
 * Volunteer row, re-checks eligibility under that lock, cancels its pending outbox rows, deletes
 * the record (cascading at the database level to MemberInvite, QuestionAnswer, PushSubscription,
 * DeliveryOutcome and DuplicateDismissal — see prisma/schema.prisma and the schema guard test),
 * and writes the OrgLog entry, all in one transaction, the same shape as
 * src/lib/member-merge-transaction.ts.
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
import { cancelOutboxForDeletedMember } from "./outbox-deletion-cancel"
import type { LogActor } from "./event-log"

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
 * Runs the deletion in one transaction: locks the row, re-validates eligibility under lock
 * (guards the race with a concurrent sign-up, see the module comment above), cancels pending
 * outbox rows, deletes the record and writes the audit entry — all or nothing. Throws
 * MemberDeletionConflictError (404 if the row vanished, 409 if it's no longer eligible) instead
 * of deleting anything in that case.
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

    // NotificationOutbox has no FK to Volunteer (only the sealed payload knows the recipient), so
    // cascading delete can't reach it — cancel what's still pending for this member first.
    const cancelledOutboxIds = await cancelOutboxForDeletedMember(tx, organizationId, { volunteerId: id, email: member.email })

    // Cascades at the database level to MemberInvite, QuestionAnswer, PushSubscription,
    // DeliveryOutcome and DuplicateDismissal (onDelete: Cascade, see prisma/schema.prisma and the
    // schema guard test). Registration has no onDelete clause — if one somehow exists despite the
    // check above (a bug, not the race this function already closes), the database itself refuses
    // the delete with a foreign key violation rather than silently orphaning history.
    await tx.volunteer.delete({ where: { id } })

    // Id only, no personal data (owner decision, #667) — same discipline as member.merged.
    await tx.orgLog.create({
      data: {
        organizationId,
        actorType: actor.type,
        actorId: "id" in actor ? (actor.id ?? null) : null,
        action: "member.deleted",
        entityType: "Member",
        entityId: id,
      },
    })

    return { id, outboxCancelled: cancelledOutboxIds.length }
  }, { maxWait: 10_000, timeout: 30_000 })
}
