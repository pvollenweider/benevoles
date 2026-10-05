// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The transactional side of erasing a member's personal data (#516): locks the Volunteer row,
 * loads the inventory (src/lib/member-inventory.ts) under that lock, builds the plan with
 * src/lib/member-erasure.ts (pure), applies it, records the erasure in the register and logs that
 * an erasure happened (never who), all in one transaction, the same shape as
 * member-deletion-transaction.ts (#667) and member-merge-transaction.ts (#600).
 *
 * Idempotent: a record already erased is reported as such and nothing is written again (the
 * register line is only re-created if it's missing, e.g. after a restore of an older backup that
 * had the erased record but not its register row).
 *
 * Server-only (Prisma through OrgScopedPrisma, node:crypto through the register module). Never
 * imported from src/lib modules reachable by client components (see CLAUDE.md).
 */

import type { OrgScopedPrisma } from "./prisma-org"
import type { LogActor } from "./event-log"
import { env } from "./env"
import { generateToken } from "./utils"
import { registrationToken } from "./token-vault"
import { addressHash } from "./notifications/smtp-outcome"
import { openPayload } from "./notifications/outbox"
import { countsToFreeze } from "./message-history"
import {
  buildErasurePlan,
  ERASED_REGISTRATION_DATA,
  erasedVolunteerData,
  memberErasureEligibility,
  MemberErasureRefusedError,
  outboxPayloadConcernsMember,
  tombstoneChain,
  type ErasureCounts,
  type ErasureInput,
} from "./member-erasure"
import { erasureEmailHash, registerLine } from "./member-erasure-register"

export class MemberErasureConflictError extends Error {
  constructor(message: string, readonly status: 404 | 409 = 409) {
    super(message)
  }
}

export interface MemberErasureResult {
  id: string
  alreadyErased: boolean
  /** When the record was erased (now, or earlier for an already erased one). */
  erasedAt: Date
  counts: ErasureCounts | null
  outboxDeleted: number
  deliveryOutcomesDeleted: number
}

const MEMBER_SELECT = { id: true, firstName: true, lastName: true, email: true, mergedIntoId: true, erasedAt: true } as const

/** Start of today, UTC: a registration on a shift dated today or later is "upcoming" for the recap. */
function startOfTodayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

type Db = Pick<OrgScopedPrisma, "volunteer" | "registration" | "memberInvite" | "questionAnswer" | "pushSubscription" | "sectorLeader" | "duplicateDismissal">

/** Loads the plan's input for a member through the org-scoped client (or a transaction of it). */
async function loadErasureInput(db: Db, id: string, now: Date): Promise<ErasureInput | null> {
  const member = await db.volunteer.findFirst({ where: { id }, select: MEMBER_SELECT })
  if (!member) return null
  const today = startOfTodayUtc(now)
  const [registrations, invites, answers, pushSubscriptions, sectorLeaders, dismissals, merged] = await Promise.all([
    db.registration.findMany({ where: { volunteerId: id }, select: { id: true, status: true, shift: { select: { date: true } } } }),
    db.memberInvite.findMany({ where: { volunteerId: id }, select: { id: true } }),
    db.questionAnswer.findMany({ where: { volunteerId: id }, select: { id: true } }),
    db.pushSubscription.findMany({ where: { volunteerId: id }, select: { id: true } }),
    member.email
      ? db.sectorLeader.findMany({ where: { email: { equals: member.email.trim(), mode: "insensitive" } }, select: { id: true } })
      : Promise.resolve([] as { id: string }[]),
    db.duplicateDismissal.findMany({ where: { OR: [{ volunteerIdA: id }, { volunteerIdB: id }] }, select: { id: true } }),
    db.volunteer.findMany({ where: { mergedIntoId: { not: null } }, select: { id: true, mergedIntoId: true } }),
  ])
  return {
    member,
    registrations: registrations.map((r) => ({ id: r.id, status: r.status, upcoming: r.shift.date >= today })),
    inviteIds: invites.map((r) => r.id),
    answerIds: answers.map((r) => r.id),
    pushSubscriptionIds: pushSubscriptions.map((r) => r.id),
    sectorLeaderIds: sectorLeaders.map((r) => r.id),
    duplicateDismissalIds: dismissals.map((r) => r.id),
    tombstoneIds: tombstoneChain(id, merged),
  }
}

export type MemberErasurePreview =
  | { eligible: true; counts: ErasureCounts }
  | { eligible: false; reason: string; alreadyErased: boolean }

/** What the confirmation shows (the member page). Null when the record isn't found. */
export async function loadMemberErasurePreview(db: OrgScopedPrisma, id: string, now = new Date()): Promise<MemberErasurePreview | null> {
  const input = await loadErasureInput(db, id, now)
  if (!input) return null
  const eligibility = memberErasureEligibility(input.member)
  if (!eligibility.eligible) return eligibility
  return { eligible: true, counts: buildErasurePlan(input).counts }
}

/**
 * Runs the erasure in one transaction. Throws MemberErasureConflictError (404 not found in this
 * organisation, 409 a merge tombstone) without writing anything; an already erased record returns
 * `alreadyErased: true`.
 */
export async function runMemberErasure(
  db: OrgScopedPrisma,
  organizationId: string,
  actor: LogActor,
  id: string,
  now = new Date(),
): Promise<MemberErasureResult> {
  const result = await db.$transaction(async (tx) => {
    // Lock first: a concurrent edit, merge, deletion or second erasure of the same record waits,
    // then sees it erased. A concurrent registration insert waits too (FK key-share lock).
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Volunteer" WHERE id = ${id} FOR UPDATE`
    if (locked.length === 0) throw new MemberErasureConflictError("Non trouvé", 404)

    const input = await loadErasureInput(tx as unknown as Db, id, now)
    if (!input) throw new MemberErasureConflictError("Non trouvé", 404)
    const { member } = input

    const eligibility = memberErasureEligibility(member)
    if (!eligibility.eligible) {
      if (!eligibility.alreadyErased) throw new MemberErasureConflictError(eligibility.reason, 409)
      // Idempotent: nothing to erase again. Only make sure the register knows about it.
      const known = await tx.erasureRecord.findUnique({ where: { volunteerId: id }, select: { id: true } })
      if (!known) await tx.erasureRecord.create({ data: { organizationId, volunteerId: id, emailHash: null, erasedAt: member.erasedAt! } })
      return { id, alreadyErased: true, erasedAt: member.erasedAt!, counts: null, outboxDeleted: 0, deliveryOutcomesDeleted: 0, registerEntry: null }
    }

    let plan
    try {
      plan = buildErasurePlan(input)
    } catch (e) {
      if (e instanceof MemberErasureRefusedError) throw new MemberErasureConflictError(e.message, 409)
      throw e
    }

    // 1. Outbox rows addressed to or naming the person (no FK to Volunteer: only the sealed payload
    // knows). Pending ones are deleted (never sent); sent and failed ones too, once their count is
    // added to their targeted message's summary, as the nightly cleanup does (#467). A row being
    // sent right now ("sending") is left to the delivery in flight; the nightly cleanup deletes it
    // once sent. A row sealed with a key rotated away since can't be read and is left as is.
    const candidates = await tx.notificationOutbox.findMany({
      where: { organizationId, status: { in: ["pending", "sent", "failed"] } },
      select: { id: true, payload: true, status: true, targetedMessageId: true },
    })
    const identity = { volunteerId: id, email: member.email, firstName: member.firstName, lastName: member.lastName }
    const outboxRows = candidates.filter((row) => {
      try {
        return outboxPayloadConcernsMember(openPayload(row.payload), identity)
      } catch {
        return false
      }
    })
    for (const [messageId, c] of countsToFreeze(outboxRows)) {
      await tx.targetedMessage.update({ where: { id: messageId }, data: { sentCount: { increment: c.sent }, failedCount: { increment: c.failed } } })
    }
    if (outboxRows.length) await tx.notificationOutbox.deleteMany({ where: { id: { in: outboxRows.map((r) => r.id) } } })

    // 2. Rows only the person gave or owns.
    const del = plan.delete
    if (del.answerIds.length) await tx.questionAnswer.deleteMany({ where: { id: { in: del.answerIds } } })
    if (del.inviteIds.length) await tx.memberInvite.deleteMany({ where: { id: { in: del.inviteIds } } })
    if (del.pushSubscriptionIds.length) await tx.pushSubscription.deleteMany({ where: { id: { in: del.pushSubscriptionIds }, volunteerId: id } })
    if (del.sectorLeaderIds.length) await tx.sectorLeader.deleteMany({ where: { id: { in: del.sectorLeaderIds } } })
    if (del.duplicateDismissalIds.length) await tx.duplicateDismissal.deleteMany({ where: { id: { in: del.duplicateDismissalIds } } })
    // SMTP outcomes (#598): the member's own, and any other row of the organisation with their
    // address hash (a send to their address not tied to the record, e.g. as a sector leader).
    const hash = member.email ? addressHash(member.email, env.AUTH_SECRET) : null
    const outcomes = await tx.deliveryOutcome.deleteMany({
      where: { organizationId, OR: [{ volunteerId: id }, ...(hash ? [{ addressHash: hash }] : [])] },
    })
    // Tombstones of records merged into this one (#600): already emptied, but they and the merge
    // mapping would still say "these records were the same person". Never any registration on a
    // tombstone (the merge moves them all); the database refuses the delete otherwise.
    if (del.tombstoneIds.length) await tx.volunteer.deleteMany({ where: { id: { in: del.tombstoneIds }, mergedIntoId: { not: null } } })

    // 3. Registrations kept without identity; every personal link replaced by one nobody is sent.
    if (plan.registrationIdsToScrub.length) {
      await tx.registration.updateMany({ where: { id: { in: plan.registrationIdsToScrub } }, data: { ...ERASED_REGISTRATION_DATA } })
    }
    for (const regId of plan.registrationIdsToRetoken) {
      await tx.registration.update({ where: { id: regId }, data: registrationToken.data(generateToken()) })
    }

    // 4. The record itself.
    await tx.volunteer.update({ where: { id }, data: erasedVolunteerData(now) })

    // 5. Invariant: nothing the person owns is left.
    const [answers, invites, push] = await Promise.all([
      tx.questionAnswer.count({ where: { volunteerId: id } }),
      tx.memberInvite.count({ where: { volunteerId: id } }),
      tx.pushSubscription.count({ where: { volunteerId: id } }),
    ])
    if (answers || invites || push) throw new Error(`member erasure invariant violated for ${id} (answers=${answers} invites=${invites} push=${push})`)

    // 6. Register (replay after a restore) and log: an erasure happened, never who. The admin who
    // did it is the actor, as for every other action.
    const emailHash = member.email ? erasureEmailHash(organizationId, member.email, env.AUTH_SECRET) : null
    await tx.erasureRecord.upsert({
      where: { volunteerId: id },
      create: { organizationId, volunteerId: id, emailHash, erasedAt: now },
      update: { emailHash, erasedAt: now },
    })
    await tx.orgLog.create({
      data: {
        organizationId,
        actorType: actor.type,
        actorId: "id" in actor ? (actor.id ?? null) : null,
        action: "member.erased",
        entityType: "Organization",
        entityId: organizationId,
      },
    })

    return {
      id,
      alreadyErased: false,
      erasedAt: now,
      counts: plan.counts,
      outboxDeleted: outboxRows.length,
      deliveryOutcomesDeleted: outcomes.count,
      registerEntry: { organizationId, volunteerId: id, emailHash, erasedAt: now },
    }
  }, { maxWait: 10_000, timeout: 30_000 })

  // After commit only: the log line is the copy of the register that survives losing the database.
  if (result.registerEntry) console.info(registerLine(result.registerEntry))
  return { id: result.id, alreadyErased: result.alreadyErased, erasedAt: result.erasedAt, counts: result.counts, outboxDeleted: result.outboxDeleted, deliveryOutcomesDeleted: result.deliveryOutcomesDeleted }
}
