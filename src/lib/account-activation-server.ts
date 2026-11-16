// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Activation of an invited account by its password (#352, #1077, #1142). The one-time link is
 * consumed atomically, a front-desk account gets no organiser welcome email, an owner's address
 * becomes the organisation's reply-to when it has none, and the welcome email is queued — all in
 * the caller's transaction, so the change and its notification commit or roll back together.
 *
 * Runs inside the caller's transaction. Server only (takes a Prisma transaction client).
 */

import type { Prisma } from "@/generated/prisma/client"
import { enqueueNotifications } from "@/lib/notifications/outbox"
import { replyToOnActivation } from "@/lib/org-reply-to"
import { isOwnerRole, FRONT_DESK_ROLE } from "@/lib/permissions"
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
  admin: ActivationAccount
  organization: ActivationOrganization | null
  token: string
  passwordHash: string
}

/**
 * Returns the outbox ids to deliver after commit, `[]` when the account is a front-desk account
 * or has no organisation, or `null` when the link no longer matches (already consumed, replaced
 * or expired): nothing else happened.
 */
export async function activateAccount(
  tx: Prisma.TransactionClient,
  { admin, organization, token, passwordHash }: ActivateAccountInput,
): Promise<string[] | null> {
  // Consumes the link atomically: the update only matches while the account is still inactive
  // and carries this token, unexpired. A concurrent request that activated it first, a link
  // replaced by a new invitation or one expired during bcrypt match no row, and nothing else
  // happens: a setup token can never replace the password of an already active account (#1142).
  const { count } = await tx.adminUser.updateMany({
    where: {
      id: admin.id,
      isActive: false,
      setupTokenHash: hashToken(token),
      OR: [{ setupTokenExpiresAt: null }, { setupTokenExpiresAt: { gt: new Date() } }],
    },
    data: {
      passwordHash,
      isActive: true,
      setupTokenHash: null,
      setupTokenExpiresAt: null,
      // A front-desk account never receives the organisation's product-update emails (#1142):
      // they are off by default for it, and no later path turns them on.
      ...(admin.role === FRONT_DESK_ROLE ? { receiveProductUpdates: false } : {}),
    },
  })
  if (count === 0) return null
  // A front-desk account (#1142) is no organiser: the welcome email's links point to pages it
  // cannot open. Its invitation already said everything it needs, and it lands on its own page.
  if (admin.role === FRONT_DESK_ROLE) return []
  if (!organization || !admin.organizationId) return []
  // An owner's now-confirmed address becomes the reply-to of an organization that has none
  // (#1077), only while it is still null: never over a value an owner set, nor after an owner
  // changed it in the email settings (a cleared value stays cleared). No address in the log.
  // Row lock on the organization: a settings save that starts meanwhile waits for this fill and
  // then writes the value the owner chose, so a clear saved at the same moment still wins.
  //
  // Lock order, shared with the refusal (src/lib/org-refusal-server.ts): this transaction has
  // just locked the account's `AdminUser` row with the update above, and takes the `Organization`
  // row after it. A refusal locks the organisation's administrator rows (id order) first, then
  // the organisation, so the two can never deadlock.
  if (isOwnerRole(admin.role)) await tx.$queryRaw`SELECT 1 FROM "Organization" WHERE "id" = ${admin.organizationId} FOR UPDATE`
  const editedInSettings = isOwnerRole(admin.role) && (await tx.$queryRaw<unknown[]>`
    SELECT 1 FROM "OrgLog"
    WHERE "organizationId" = ${admin.organizationId}
      AND "action" = 'organization.notifications_updated'
      AND ("changes" -> 'replyToEmail') IS NOT NULL
    LIMIT 1`).length > 0
  const replyTo = replyToOnActivation(admin.role, admin.email, editedInSettings)
  if (replyTo) {
    const { count } = await tx.organization.updateMany({
      where: { id: admin.organizationId, replyToEmail: null },
      data: { replyToEmail: replyTo },
    })
    if (count > 0) {
      await tx.orgLog.create({
        data: {
          organizationId: admin.organizationId,
          actorType: "admin",
          actorId: admin.id,
          action: "organization.reply_to_defaulted",
          entityType: "Organization",
          entityId: admin.organizationId,
        },
      })
    }
  }
  return enqueueNotifications([{
    kind: "admin_welcome",
    organizationId: admin.organizationId,
    dedupeKey: `admin_welcome:${admin.id}`,
    recipient: { email: admin.email, name: admin.name },
    data: {
      adminName: admin.name,
      organizationName: organization.name,
      adminUrl: `${orgBaseUrl(organization.slug)}/admin/events`,
    },
  }], tx)
}
