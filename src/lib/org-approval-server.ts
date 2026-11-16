// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The one validation of a space awaiting it (#810, #1371). Both the operator's manual review and
 * the future scheduled validation call this function, so the two paths share every line: the
 * conditional grant, the organisation log, the operator log and the queued « espace activé »
 * emails.
 *
 * It runs inside the caller's transaction and never calls `deliverAfterResponse`: the caller
 * delivers `outboxIds` once the transaction has committed.
 *
 * Server only (takes a Prisma transaction client).
 */

import type { Prisma } from "@/generated/prisma/client"
import { AUTOMATIC_APPROVAL_LABEL } from "@/lib/org-approval"
import type { OrgState } from "@/lib/org-suspension"
import { enqueueNotifications } from "@/lib/notifications/outbox"
import { logOperator, organizationTarget, type OperatorLogSource } from "@/lib/operator-log"
import { ORG_ACCOUNT_ROLE_WHERE } from "@/lib/permissions"

/** Who validates: the operator from the super admin space, or the automatic validation. */
export type ApprovalActor =
  | { type: "operator"; id: string | null; label: string | null }
  | { type: "automatic" }

/**
 * `pending` cannot come out of `approveOrganization`: the conditional grant matches every active,
 * non-suspended row missing a grant. It keeps `approvalRefusalReason` honest for the pure helper.
 */
export type ApprovalRefusalReason = "not_found" | "pending" | "already_approved" | "inactive" | "suspended"

export type ApproveOrganizationResult =
  | { approved: true; outboxIds: string[] }
  | { approved: false; reason: ApprovalRefusalReason }

export type ApproveOrganizationInput = {
  organizationId: string
  actor: ApprovalActor
  now: Date
}

/**
 * The grant's conditions: an organisation still active, not suspended, with **at least one** of
 * the two grants empty. A space is pending as soon as either grant is missing (`orgStatus` and
 * `decideReview` say so), so a half-granted space is approved as it was before #1371. The `id` is
 * added by the caller. The write always fills both timestamps, as the route did before this
 * branch. A single conditional write means two approvals can never both win, even without the
 * row lock.
 */
export const APPROVAL_GRANT_WHERE: {
  active: true
  suspendedAt: null
  OR: ({ publicationApprovedAt: null } | { outboundEmailApprovedAt: null })[]
} = {
  active: true,
  suspendedAt: null,
  OR: [{ publicationApprovedAt: null }, { outboundEmailApprovedAt: null }],
}

/** Why a failed conditional grant happened, from the row re-read once under the lock. */
export function approvalRefusalReason(
  org: Pick<OrgState, "active" | "suspendedAt" | "publicationApprovedAt" | "outboundEmailApprovedAt"> | null,
): ApprovalRefusalReason {
  if (!org) return "not_found"
  if (org.suspendedAt) return "suspended"
  if (!org.active) return "inactive"
  // `already_approved` only when both grants are set: a row still waiting for one would have
  // matched the conditional write, so this is only the honest answer for the pure helper.
  if (org.publicationApprovedAt === null || org.outboundEmailApprovedAt === null) return "pending"
  return "already_approved"
}

/** The fields the lock and the failed-grant read need from the organisation. */
const ORG_STATE_SELECT = {
  active: true,
  suspendedAt: true,
  publicationApprovedAt: true,
  outboundEmailApprovedAt: true,
} as const

export async function approveOrganization(
  tx: Prisma.TransactionClient,
  { organizationId, actor, now }: ApproveOrganizationInput,
): Promise<ApproveOrganizationResult> {
  // Lock order, and the reason there is no cycle with account activation: approval takes the
  // `Organization` row only. It reads the administrators with a plain SELECT, so it never waits
  // for an `AdminUser` row. Refusal and activation take the administrator rows first, then the
  // organisation (src/lib/org-refusal-server.ts, src/lib/account-activation-server.ts).
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`

  const [org] = await tx.organization.updateManyAndReturn({
    where: { id: organizationId, ...APPROVAL_GRANT_WHERE },
    data: { publicationApprovedAt: now, outboundEmailApprovedAt: now },
    select: { id: true, name: true, slug: true },
  })

  // No row matched: read the row once, after the failed write, to tell which refusal it is. No
  // log entry and no email is written on this path.
  if (!org) {
    const current = await tx.organization.findUnique({ where: { id: organizationId }, select: ORG_STATE_SELECT })
    return { approved: false, reason: approvalRefusalReason(current) }
  }

  const automatic = actor.type === "automatic"
  const source: OperatorLogSource = automatic ? "automatic" : "operator"

  await tx.orgLog.create({
    data: {
      organizationId,
      // An automatic approval has no acting account; the read side names it « Validation automatique ».
      actorType: automatic ? "system" : "admin",
      actorId: automatic ? null : actor.id,
      action: "organization.approved",
      entityType: "Organization",
      entityId: organizationId,
      changes: { source: { from: null, to: source } },
    },
  })

  await logOperator(tx, {
    action: "organization.approved",
    actor: automatic ? { id: null, name: AUTOMATIC_APPROVAL_LABEL } : { id: actor.id, name: actor.label },
    entityType: "Organization",
    entityId: organizationId,
    target: organizationTarget(org),
    source,
  })

  // The administrators are told, not a front-desk account (#1142).
  const admins = await tx.adminUser.findMany({
    where: { organizationId, ...ORG_ACCOUNT_ROLE_WHERE },
    select: { email: true, name: true },
  })
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")
  const outboxIds = await enqueueNotifications(admins.map((a) => ({
    kind: "space_approved" as const,
    organizationId,
    recipient: { email: a.email, name: a.name },
    dedupeKey: `space_approved:${organizationId}:${a.email}`,
    data: { adminName: a.name, organizationName: org.name, adminUrl: `${base}/admin/events` },
  })), tx)

  return { approved: true, outboxIds }
}
