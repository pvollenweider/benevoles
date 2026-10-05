// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The transactional side of a member merge (#600): loads both records and their relations under
 * lock, builds the plan with src/lib/member-merge.ts (pure), applies it, regenerates the tokens
 * of every row moved (same mechanism as #542, src/lib/token-vault.ts), turns the absorbed record
 * into a tombstone, and writes the audit entry — all with the transaction's own client, so the
 * merge and its trace commit together (OrgLog.create here never swallows an error, unlike
 * src/lib/org-log.ts's logOrgEvent).
 *
 * Server-only: imports the generated Prisma client. Never imported from src/lib modules reachable
 * by client components (see CLAUDE.md) — only from the API route.
 */

import type { OrgScopedPrisma } from "./prisma-org"
import { generateToken } from "./utils"
import { registrationToken, linkToken } from "./token-vault"
import { addressHash } from "./notifications/smtp-outcome"
import { env } from "./env"
import {
  buildMergePlan,
  refuseMerge,
  resolvedFields,
  type MemberMergeChoices,
  type MemberMergeInput,
  type MergePlan,
  type VolunteerLite,
} from "./member-merge"
import type { LogActor } from "./event-log"
import { cancelOutboxForMergedMember } from "./outbox-merge-cancel"

export class MergeConflictError extends Error {
  constructor(message: string, readonly status: 404 | 409 = 409) {
    super(message)
  }
}

function toLite(v: {
  id: string; firstName: string; lastName: string; email: string | null; phone: string | null
  tags: string[]; notes: string | null; birthDate: Date | null; availabilityPeriods: string[]
  availabilityNote: string | null; active: boolean; createdAt: Date; organizationId: string | null; mergedIntoId: string | null
}): VolunteerLite {
  return { ...v }
}

const VOLUNTEER_SELECT = {
  id: true, firstName: true, lastName: true, email: true, phone: true, tags: true, notes: true,
  birthDate: true, availabilityPeriods: true, availabilityNote: true, active: true, createdAt: true,
  organizationId: true, mergedIntoId: true,
} as const

const SHIFT_SELECT = { id: true, eventId: true, roleName: true, label: true, date: true, startTime: true, endTime: true, minAge: true, maxPerVolunteer: true, reservedTags: true } as const

export interface MemberMergeResult {
  keepId: string
  absorbId: string
  plan: MergePlan
  tokensRegenerated: { registrations: number; invites: number }
  outboxCancelled: number
}

/**
 * Loads everything the pure planner needs, builds the plan and — unless `dryRun` — applies it.
 * `dryRun: true` is the preview endpoint: it locks nothing and writes nothing.
 */
export async function loadMergeInput(db: OrgScopedPrisma, keepId: string, absorbId: string): Promise<MemberMergeInput | { error: string }> {
  const [keepRow, absorbRow] = await Promise.all([
    db.volunteer.findFirst({ where: { id: keepId }, select: VOLUNTEER_SELECT }),
    db.volunteer.findFirst({ where: { id: absorbId }, select: VOLUNTEER_SELECT }),
  ])
  if (!keepRow || !absorbRow) return { error: "Non trouvé" }
  const keep = toLite(keepRow)
  const absorb = toLite(absorbRow)
  const refusal = refuseMerge({ keep, absorb })
  if (refusal) return { error: refusal }

  const [keepRegistrations, absorbRegistrations, keepInvites, absorbInvites, keepAnswers, absorbAnswers, absorbPushSubscriptions, absorbDeliveryOutcomes, sectorLeadersMatchingAbsorbed] = await Promise.all([
    db.registration.findMany({ where: { volunteerId: keepId }, select: { id: true, eventId: true, shiftId: true, status: true, checkedInAt: true } }),
    db.registration.findMany({ where: { volunteerId: absorbId }, select: { id: true, eventId: true, shiftId: true, status: true, checkedInAt: true } }),
    db.memberInvite.findMany({ where: { volunteerId: keepId }, select: { id: true, eventId: true, usedAt: true } }),
    db.memberInvite.findMany({ where: { volunteerId: absorbId }, select: { id: true, eventId: true, usedAt: true } }),
    db.questionAnswer.findMany({ where: { volunteerId: keepId }, select: { id: true, questionId: true, eventId: true, values: true } }),
    db.questionAnswer.findMany({ where: { volunteerId: absorbId }, select: { id: true, questionId: true, eventId: true, values: true } }),
    db.pushSubscription.findMany({ where: { volunteerId: absorbId }, select: { id: true, endpoint: true } }),
    db.deliveryOutcome.findMany({ where: { volunteerId: absorbId }, select: { id: true, addressHash: true } }),
    absorb.email
      ? db.sectorLeader.findMany({ where: { email: { equals: absorb.email, mode: "insensitive" } }, select: { id: true, eventId: true, roleName: true, email: true } })
      : Promise.resolve([]),
  ])

  const shiftIds = [...new Set([...keepRegistrations, ...absorbRegistrations].map((r) => r.shiftId))]
  const shifts = shiftIds.length ? await db.shift.findMany({ where: { id: { in: shiftIds } }, select: SHIFT_SELECT }) : []

  // The DeliveryOutcome rule compares against the KEPT member's final address (what the member's
  // address will actually be once the merge's field choices are applied), not necessarily its
  // pre-merge one.
  const keepAddressHash = null // resolved by the caller once choices are known (see mergeInputWithAddressHash)

  return {
    keep, absorb, shifts,
    keepRegistrations, absorbRegistrations, keepInvites, absorbInvites, keepAnswers, absorbAnswers,
    absorbPushSubscriptions, absorbDeliveryOutcomes, sectorLeadersMatchingAbsorbed,
    keepAddressHash,
  }
}

/** Fills in `keepAddressHash` once the final resolved email is known (depends on the field choices). */
export function withKeepAddressHash(input: MemberMergeInput, finalEmail: string | null): MemberMergeInput {
  return { ...input, keepAddressHash: finalEmail ? addressHash(finalEmail, env.AUTH_SECRET) : null }
}

/**
 * Runs the merge in one transaction: locks both rows (fixed id order), re-validates under lock
 * (guards the double-submit / concurrent-merge race), applies the plan, regenerates tokens, turns
 * the absorbed record into a tombstone, and writes the OrgLog entry — all or nothing.
 */
export async function runMemberMerge(
  db: OrgScopedPrisma,
  organizationId: string,
  actor: LogActor,
  keepId: string,
  absorbId: string,
  choices: MemberMergeChoices,
): Promise<MemberMergeResult> {
  return db.$transaction(async (tx) => {
    // Lock both rows in a fixed order (ascending id) so two concurrent merges touching the same
    // pair never deadlock.
    const [a, b] = [keepId, absorbId].sort()
    await tx.$queryRaw`SELECT id FROM "Volunteer" WHERE id = ANY(${[a, b]}::text[]) ORDER BY id FOR UPDATE`

    const loaded = await loadMergeInput(tx as unknown as OrgScopedPrisma, keepId, absorbId)
    if ("error" in loaded) throw new MergeConflictError(loaded.error, loaded.error === "Non trouvé" ? 404 : 409)

    // The DeliveryOutcome rule compares against the kept member's FINAL address (after the field
    // choices are applied), not necessarily its pre-merge one — resolvedFields doesn't depend on
    // keepAddressHash, so this is safe to compute before building the real plan.
    const finalEmail = resolvedFields(loaded, choices).email
    const input = withKeepAddressHash(loaded, finalEmail)
    const plan = buildMergePlan(input, choices)

    // 1. Resolve same-shift conflicts first: cancel the losing registration(s) before reassigning,
    // so the partial unique index (shiftId, volunteerId) for live statuses is never hit.
    for (const { id } of plan.registrationsToCancel) {
      const before = await tx.registration.findFirstOrThrow({ where: { id }, select: { eventId: true, shiftId: true } })
      await tx.registration.update({ where: { id }, data: { status: "cancelled" } })
      await tx.eventLog.create({
        data: {
          eventId: before.eventId,
          actorType: actor.type,
          actorId: "id" in actor ? (actor.id ?? null) : null,
          action: "registration.cancelled",
          entityType: "Registration",
          entityId: id,
          changes: { reason: { from: "member_merge_conflict", to: "cancelled" } },
        },
      })
    }

    // 2. Delete the losing rows of same-question / same-event conflicts outright (they'd
    // otherwise collide with the winner once reassigned to the same volunteerId).
    if (plan.answerIdsToDrop.length) await tx.questionAnswer.deleteMany({ where: { id: { in: plan.answerIdsToDrop } } })
    if (plan.inviteIdsToDelete.length) await tx.memberInvite.deleteMany({ where: { id: { in: plan.inviteIdsToDelete } } })

    // 3. Reassign every remaining relation of the inventory from the absorbed record to the kept one.
    if (plan.registrationsToReassign.length) await tx.registration.updateMany({ where: { id: { in: plan.registrationsToReassign } }, data: { volunteerId: keepId } })
    if (plan.inviteIdsToReassign.length) await tx.memberInvite.updateMany({ where: { id: { in: plan.inviteIdsToReassign } }, data: { volunteerId: keepId } })
    if (plan.answerIdsToReassign.length) await tx.questionAnswer.updateMany({ where: { id: { in: plan.answerIdsToReassign } }, data: { volunteerId: keepId } })
    if (plan.deliveryOutcomeIdsToReassign.length) await tx.deliveryOutcome.updateMany({ where: { id: { in: plan.deliveryOutcomeIdsToReassign } }, data: { volunteerId: keepId } })
    // Push subscriptions are dropped, never moved (owner decision, #600): a device subscribed
    // through the absorbed record's wrong-address link may belong to someone else.
    if (plan.pushSubscriptionIdsToDelete.length) await tx.pushSubscription.deleteMany({ where: { id: { in: plan.pushSubscriptionIdsToDelete } } })

    // 4. Turn the absorbed record into an inactive tombstone: no personal data left, mapped to
    // the kept record so old ids keep resolving (event-log-read.ts, member-activity-data.ts).
    // Done BEFORE the kept record takes its new values: when the organizer keeps the absorbed
    // record's address, it must be released first, or the unique (organizationId, email) index
    // refuses the kept record's update and the whole merge fails (seen in production).
    await tx.volunteer.update({
      where: { id: absorbId },
      data: {
        firstName: "", lastName: "", email: null, phone: null, notes: null, birthDate: null,
        tags: [], availabilityPeriods: [], availabilityNote: null,
        active: false,
        mergedIntoId: keepId,
        mergedAt: new Date(),
      },
    })

    // 5. Apply the resolved field values to the kept record.
    await tx.volunteer.update({
      where: { id: keepId },
      data: {
        firstName: plan.fields.firstName,
        lastName: plan.fields.lastName,
        email: plan.fields.email,
        phone: plan.fields.phone,
        birthDate: plan.fields.birthDate,
        availabilityNote: plan.fields.availabilityNote,
        notes: plan.fields.notes,
        tags: plan.fields.tags,
        availabilityPeriods: plan.fields.availabilityPeriods,
      },
    })

    // 6. Regenerate the tokens of every row just moved (#542 mechanism): a moved registration or
    // invite link may have been delivered to whoever actually holds the absorbed record's wrong
    // address. Old links then hit the existing "lien plus valide" page.
    for (const id of plan.tokenRegeneration.registrationIds) {
      await tx.registration.update({ where: { id }, data: registrationToken.data(generateToken()) })
    }
    for (const id of plan.tokenRegeneration.inviteIds) {
      await tx.memberInvite.update({ where: { id }, data: linkToken.data(generateToken()) })
    }

    // 6b. Cancel pending outbox rows addressed to the absorbed record's (pre-merge) address —
    // owner decision, #600. NotificationOutbox has no FK to Volunteer (only the sealed payload
    // knows the recipient), so it can't be "reassigned" like the rest of the inventory; cancelling
    // is what stops an email still queued for the address the organizer just confirmed was wrong.
    // Uses `loaded.absorb`, captured before the tombstone update (step 4) cleared its email.
    const cancelledOutboxIds = await cancelOutboxForMergedMember(tx, organizationId, { volunteerId: absorbId, email: loaded.absorb.email })

    // 7. Invariant: no relation may remain on the absorbed record, except the DeliveryOutcome
    // rows deliberately left (owner decision, #600) for the retention purge to cascade-delete.
    const [regCount, inviteCount, answerCount, pushCount] = await Promise.all([
      tx.registration.count({ where: { volunteerId: absorbId } }),
      tx.memberInvite.count({ where: { volunteerId: absorbId } }),
      tx.questionAnswer.count({ where: { volunteerId: absorbId } }),
      tx.pushSubscription.count({ where: { volunteerId: absorbId } }),
    ])
    if (regCount || inviteCount || answerCount || pushCount) {
      throw new Error(`member merge invariant violated: absorbed record ${absorbId} still has relations (reg=${regCount} invite=${inviteCount} answer=${answerCount} push=${pushCount})`)
    }

    // 8. Audit, written with the transaction's own client so it commits with the merge (unlike
    // logOrgEvent, which uses the global client and swallows errors). No personal data in `changes`.
    await tx.orgLog.create({
      data: {
        organizationId,
        actorType: actor.type,
        actorId: "id" in actor ? (actor.id ?? null) : null,
        action: "member.merged",
        entityType: "Member",
        entityId: keepId,
        changes: {
          absorbedId: { from: absorbId, to: null },
          registrationsMoved: { from: null, to: plan.registrationsToReassign.length },
          registrationsCancelled: { from: null, to: plan.registrationsToCancel.length },
          invitesMoved: { from: null, to: plan.inviteIdsToReassign.length },
          invitesDeleted: { from: null, to: plan.inviteIdsToDelete.length },
          answersMoved: { from: null, to: plan.answerIdsToReassign.length },
          answersDropped: { from: null, to: plan.answerIdsToDrop.length },
          pushSubscriptionsDropped: { from: null, to: plan.pushSubscriptionIdsToDelete.length },
          deliveryOutcomesReassigned: { from: null, to: plan.deliveryOutcomeIdsToReassign.length },
          outboxCancelled: { from: null, to: cancelledOutboxIds.length },
        },
      },
    })

    return {
      keepId,
      absorbId,
      plan,
      tokensRegenerated: { registrations: plan.tokenRegeneration.registrationIds.length, invites: plan.tokenRegeneration.inviteIds.length },
      outboxCancelled: cancelledOutboxIds.length,
    }
  }, { maxWait: 10_000, timeout: 30_000 })
}
