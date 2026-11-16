// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { randomBytes } from "crypto"
import { prisma } from "./prisma"
import { hashToken } from "./token-hash"
import { enqueueNotifications } from "./notifications/outbox"
import { recipientWindowKey, sendLimits } from "./notifications/send-limits"
import type { Tx } from "./registration-capacity"

/**
 * Password recovery links (« Mot de passe oublié »), one per account: a request replaces the
 * previous link, a reset or a password change consumes or revokes it.
 *
 * A request is all or nothing, in one transaction with the account row locked (`FOR UPDATE`):
 *  - the account must still be the one the request read: same address, same sessionVersion
 *    (bumped by every password change or reset), still active. A request that started before a
 *    password change or an address change never writes a link after it;
 *  - the per-recipient cap (EMAIL_LIMIT_RECIPIENT_PER_HOUR, the same window as the other public
 *    emails) is taken here, atomically. Over it, nothing changes: the link already received keeps
 *    working, no email is queued. Taking the cap at delivery instead would replace the link
 *    first and drop its email afterwards, leaving the account with a link nobody received;
 *  - the new link and its email are written together; the email leaves after the commit, never
 *    inside the transaction (no network call while the row is locked).
 * The public answer is the same in every case.
 */

export { RESET_LINK_REVOKED } from "./password-reset-revocation"

export const RESET_LINK_TTL_MS = 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

export type RecoveryAccount = { id: string; email: string; name: string; organizationId: string | null; sessionVersion: number; isActive: boolean }

export type RecoveryOutcome =
  | { status: "queued"; outboxIds: string[] }
  | { status: "over_cap" }
  | { status: "stale" }

/** Whether the account, read again under the lock, is still the one the request started from. */
export function recoveryStillCurrent(readAtStart: Pick<RecoveryAccount, "email" | "sessionVersion">, locked: { email: string; sessionVersion: number; isActive: boolean } | null): boolean {
  return !!locked && locked.isActive && locked.email === readAtStart.email && locked.sessionVersion === readAtStart.sessionVersion
}

/**
 * Takes one unit of the per-recipient window in the transaction, only if the window is not full:
 * the conditional upsert returns no row once `limit` is reached, and nothing is counted. Rolled
 * back with the transaction, so a request that fails afterwards does not use up the budget.
 */
export async function takeRecipientBudget(tx: Pick<Tx, "$queryRaw">, key: string, limit: number, windowMs: number = HOUR): Promise<boolean> {
  const rows = await tx.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt")
    VALUES (${key}, 1, now() + ${windowMs}::integer * interval '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "count"   = CASE WHEN "RateLimit"."resetAt" <= now() THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" <= now() THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
    WHERE "RateLimit"."resetAt" <= now() OR "RateLimit"."count" < ${limit}
    RETURNING "count"`
  return rows.length === 1
}

/** The link emailed to the administrator. */
export function resetLink(appUrl: string | undefined, token: string): string {
  return `${(appUrl ?? "http://localhost:3000").replace(/\/$/, "")}/admin/reset-password?token=${token}`
}

/** One recovery request for an account read by the route (see the module comment). */
export async function requestPasswordRecovery(account: RecoveryAccount, now: Date = new Date()): Promise<RecoveryOutcome> {
  const token = randomBytes(32).toString("hex")
  const resetUrl = resetLink(process.env.NEXT_PUBLIC_APP_URL, token)
  return prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<{ email: string; sessionVersion: number; isActive: boolean }[]>`
      SELECT email, "sessionVersion", "isActive" FROM "AdminUser" WHERE id = ${account.id} FOR UPDATE`
    if (!recoveryStillCurrent(account, locked ?? null)) return { status: "stale" as const }
    if (!(await takeRecipientBudget(tx, recipientWindowKey(account.email, "password_reset"), sendLimits().recipientPerHour))) {
      return { status: "over_cap" as const }
    }
    await tx.adminUser.update({
      where: { id: account.id },
      data: { passwordResetTokenHash: hashToken(token), passwordResetExpiresAt: new Date(now.getTime() + RESET_LINK_TTL_MS) },
    })
    const outboxIds = await enqueueNotifications([{
      kind: "password_reset",
      organizationId: account.organizationId,
      recipient: { email: account.email, name: account.name },
      data: { adminName: account.name, resetUrl },
    }], tx)
    return { status: "queued" as const, outboxIds }
  })
}
