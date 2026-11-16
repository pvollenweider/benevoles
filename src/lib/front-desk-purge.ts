// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Purge of front-desk accounts (#1142, owner decision of 2026-11-16): once every access of a
 * `front_desk` account is over and the latest end is more than RETENTION_DAYS.frontDeskAccount
 * days old, the account is deleted, and its grants go with it (onDelete: Cascade). This is the
 * data-side counterpart of the pure decision in src/lib/front-desk-access.ts
 * (frontDeskAccountPurgeDecision); the cleanup cron calls it as its own numbered step.
 *
 * Never an owner, an organiser or a super admin: the role is both in the candidate query and in
 * the delete statement, so a role changed between the read and the delete is spared.
 *
 * Candidates are read by bounded batches (the table is never loaded whole; see issue #1369),
 * narrowed in SQL as far as the rule allows, then decided again by the pure function. Each
 * deletion runs in its own transaction: the account row is locked (`FOR UPDATE`, the same lock
 * the invitation and revocation routes take), the accesses and the pure decision are re-read
 * under that lock, and only then a conditional `deleteMany` on id AND role runs. An owner who
 * re-opens an access at that moment therefore either lands before the lock (the re-read sees a
 * live access and the account is kept) or waits until the account is gone.
 *
 * Every deletion writes one OrgLog entry with a system actor, naming neither the person nor their
 * address: « un compte d'accès accueil » in the action label, and the event's title in `changes`.
 */
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "./prisma"
import { FRONT_DESK_ROLE } from "./permissions"
import { DAY_MS, daysAgo, RETENTION_DAYS } from "./retention"
import { orgTimeZone } from "./time-zone"
import { frontDeskAccessEndAt, frontDeskAccountPurgeDecision } from "./front-desk-access"

/** Accounts read, decided and deleted per batch: never the whole table at once (#1369). */
export const FRONT_DESK_PURGE_BATCH = 100

export type FrontDeskPurgeCandidate = {
  id: string
  organizationId: string | null
  createdAt: Date
  organization: { timeZone: string | null } | null
  eventAccesses: {
    revokedAt: Date | null
    expiresAt: Date | null
    event: { endDate: Date; title: string }
  }[]
}

export type FrontDeskPurgeTx = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>
  adminUser: {
    findFirst(args: unknown): Promise<FrontDeskPurgeCandidate | null>
    deleteMany(args: { where: { id: string; role: string } }): Promise<{ count: number }>
  }
  orgLog: { create(args: unknown): Promise<unknown> }
}

export type FrontDeskPurgeDb = {
  adminUser: {
    findMany(args: unknown): Promise<FrontDeskPurgeCandidate[]>
  }
  $transaction<R>(fn: (tx: FrontDeskPurgeTx) => Promise<R>, options?: { maxWait?: number; timeout?: number }): Promise<R>
}

export type FrontDeskPurgeResult = {
  /** Count only: a job summary never names a person or an address. */
  deleted: number
}

/**
 * The SQL narrowing of the candidate query. An account is a candidate when it is a front-desk
 * account and NONE of its accesses could still be recent: every access is either revoked, or
 * expired at/before the cutoff, or tied to an event whose date makes its end certainly past.
 *
 * `revokedAt` is deliberately not compared to the cutoff: an access revoked long ago is old even
 * if its event is recent, so excluding it here would only lose a candidate. The pure function
 * makes the exact decision. The event bound keeps two days of margin on `endDate` (a stored UTC
 * midnight): the event ends at 06:00 local the next day, at most 42 hours later, so an end date
 * at least two days before the cutoff can no longer end after it.
 */
export function frontDeskPurgeCandidateWhere(now: Date): Prisma.AdminUserWhereInput {
  const cutoff = daysAgo(now, RETENTION_DAYS.frontDeskAccount)
  const eventMayStillEndAfterCutoff = new Date(cutoff.getTime() - 2 * DAY_MS)
  return {
    role: FRONT_DESK_ROLE,
    organizationId: { not: null },
    eventAccesses: {
      none: {
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: cutoff } }],
        event: { endDate: { gte: eventMayStillEndAfterCutoff } },
      },
    },
  }
}

const CANDIDATE_SELECT = {
  id: true,
  organizationId: true,
  createdAt: true,
  organization: { select: { timeZone: true } },
  eventAccesses: {
    select: {
      revokedAt: true,
      expiresAt: true,
      event: { select: { endDate: true, title: true } },
    },
  },
} as const

/** The event whose end is the account's reference date (the last one to end), or null when it has no access. */
function lastEventTitle(accesses: FrontDeskPurgeCandidate["eventAccesses"], timeZone: string, referenceAt: Date): string | null {
  const latest = accesses.find((access) => frontDeskAccessEndAt(access, timeZone).getTime() === referenceAt.getTime())
  return latest?.event.title ?? null
}

/**
 * Deletes the front-desk accounts due at `now`, batch by batch, and returns only how many were
 * deleted. The default client is the application's; tests pass doubles (see
 * src/lib/__tests__/front-desk-purge.test.ts and src/__integration__/front-desk-purge.int.test.ts).
 */
export async function purgeDueFrontDeskAccounts(
  now: Date,
  db: FrontDeskPurgeDb = prisma as unknown as FrontDeskPurgeDb,
): Promise<FrontDeskPurgeResult> {
  const where = frontDeskPurgeCandidateWhere(now)
  let deleted = 0
  let cursor: string | null = null

  for (;;) {
    const candidates: FrontDeskPurgeCandidate[] = (await db.adminUser.findMany({
      where: { ...where, role: FRONT_DESK_ROLE, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" },
      take: FRONT_DESK_PURGE_BATCH,
      select: CANDIDATE_SELECT,
    })) ?? []
    if (candidates.length === 0) break
    cursor = candidates[candidates.length - 1].id

    for (const candidate of candidates) {
      const organizationId = candidate.organizationId
      // The candidate query already requires an organisation; the check keeps the log write safe.
      if (!organizationId) continue
      const createdAt = candidate.createdAt instanceof Date ? candidate.createdAt : now
      const accesses = candidate.eventAccesses ?? []
      const timeZone = orgTimeZone(candidate.organization)
      const decision = frontDeskAccountPurgeDecision({ createdAt, accesses }, timeZone, now)
      if (!decision.due) continue
      const eventTitle = lastEventTitle(accesses, timeZone, decision.referenceAt)

      const removed = await db.$transaction(async (tx) => {
        // The same lock as the invitation and revocation routes (src/app/api/admin/events/[id]/
        // front-desk-access): a re-opening waits here, then finds the account gone.
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM "AdminUser"
          WHERE id = ${candidate.id} AND role = ${FRONT_DESK_ROLE} AND "organizationId" = ${organizationId}
          FOR UPDATE`
        if (locked.length === 0) return false

        // Re-read under the lock: an access re-opened between the batch read and here is live now.
        const fresh = await tx.adminUser.findFirst({
          where: { id: candidate.id, role: FRONT_DESK_ROLE, organizationId },
          select: CANDIDATE_SELECT,
        })
        if (!fresh) return false
        const freshAccesses = fresh.eventAccesses ?? []
        const freshDecision = frontDeskAccountPurgeDecision(
          { createdAt: fresh.createdAt, accesses: freshAccesses },
          orgTimeZone(fresh.organization),
          now,
        )
        if (!freshDecision.due) return false
        const freshTitle = lastEventTitle(freshAccesses, orgTimeZone(fresh.organization), freshDecision.referenceAt)

        // The role condition is part of the delete itself, not only of the read above.
        const { count } = await tx.adminUser.deleteMany({ where: { id: candidate.id, role: FRONT_DESK_ROLE } })
        if (count !== 1) return false

        // System actor, no name and no address: an entry that named the person would outlive them.
        await tx.orgLog.create({
          data: {
            organizationId,
            actorType: "system",
            actorId: null,
            action: "frontdesk.account_purged",
            entityType: "AdminUser",
            entityId: candidate.id,
            changes: {
              eventTitle: { from: null, to: freshTitle ?? eventTitle },
            },
          },
        })
        return true
      })
      if (removed) deleted++
    }

    if (candidates.length < FRONT_DESK_PURGE_BATCH) break
  }

  return { deleted }
}
