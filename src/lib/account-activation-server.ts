// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Activation of an invited account by its password (#352, #1077). The one-time link is consumed
 * atomically, an owner's address becomes the organisation's reply-to when it has none, and the
 * welcome email is queued — all in the caller's transaction, so the change and its notification
 * commit or roll back together.
 *
 * Runs inside the caller's transaction. Server only (takes a Prisma transaction client).
 */

import type { Prisma } from "@/generated/prisma/client"
import { enqueueNotifications } from "@/lib/notifications/outbox"
import { replyToOnActivation } from "@/lib/org-reply-to"
import { isOwnerRole } from "@/lib/permissions"
import { hashToken } from "@/lib/token-hash"
import { orgBaseUrl } from "@/lib/urls"

/** The account the caller looked up from its invite token, before the transaction. */
export type ActivationAccount = {
  id: string
  name: string
  email: string
  role: string
  organizationId: string | null
}

/** The organisation the account belongs to, as read with the token. */
export type ActivationOrganization = { name: string; slug: string }

export type ActivateAccountInput = {
  account: ActivationAccount
  organization: ActivationOrganization | null
  token: string
  passwordHash: string
  now?: Date
}

/**
 * Returns the outbox ids to deliver after commit, `[]` when the account has no organisation, or
 * `null` when the link no longer matches (already consumed, replaced or expired): nothing else
 * happened.
 */
export async function activateAccount(
  tx: Prisma.TransactionClient,
  { account, organization, token, passwordHash, now = new Date() }: ActivateAccountInput,
): Promise<string[] | null> {
  // Consumes the link atomically: the update only matches while the account still carries this
  // token, unexpired. A concurrent request that consumed it first, a link replaced by a new
  // invitation or one expired during bcrypt match no row, and nothing else happens.
  const { count } = await tx.adminUser.updateMany({
    where: {
      id: account.id,
      setupTokenHash: hashToken(token),
      OR: [{ setupTokenExpiresAt: null }, { setupTokenExpiresAt: { gt: now } }],
    },
    data: {
      passwordHash,
      isActive: true,
      setupTokenHash: null,
      setupTokenExpiresAt: null,
    },
  })
  if (count === 0) return null
  if (!organization || !account.organizationId) return []

  // An owner's now-confirmed address becomes the reply-to of an organization that has none
  // (#1077), only while it is still null: never over a value an owner set, nor after an owner
  // changed it in the email settings (a cleared value stays cleared). No address in the log.
  //
  // Lock order, shared with the refusal (src/lib/org-refusal-server.ts): this transaction has
  // just locked the account's `AdminUser` row with the update above, and takes the `Organization`
  // row after it. A refusal locks the organisation's administrator rows (id order) first, then
  // the organisation, so the two can never deadlock.
  if (isOwnerRole(account.role)) await tx.$queryRaw`SELECT 1 FROM "Organization" WHERE "id" = ${account.organizationId} FOR UPDATE`
  const editedInSettings = isOwnerRole(account.role) && (await tx.$queryRaw<unknown[]>`
    SELECT 1 FROM "OrgLog"
    WHERE "organizationId" = ${account.organizationId}
      AND "action" = 'organization.notifications_updated'
      AND ("changes" -> 'replyToEmail') IS NOT NULL
    LIMIT 1`).length > 0
  const replyTo = replyToOnActivation(account.role, account.email, editedInSettings)
  if (replyTo) {
    const { count } = await tx.organization.updateMany({
      where: { id: account.organizationId, replyToEmail: null },
      data: { replyToEmail: replyTo },
    })
    if (count > 0) {
      await tx.orgLog.create({
        data: {
          organizationId: account.organizationId,
          actorType: "admin",
          actorId: account.id,
          action: "organization.reply_to_defaulted",
          entityType: "Organization",
          entityId: account.organizationId,
        },
      })
    }
  }
  return enqueueNotifications([{
    kind: "admin_welcome",
    organizationId: account.organizationId,
    dedupeKey: `admin_welcome:${account.id}`,
    recipient: { email: account.email, name: account.name },
    data: {
      adminName: account.name,
      organizationName: organization.name,
      adminUrl: `${orgBaseUrl(organization.slug)}/admin/events`,
    },
  }], tx)
}
