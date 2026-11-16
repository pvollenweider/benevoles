// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The refusal of a space awaiting validation (#810): delete the organisation with its accounts,
 * as the nightly cleanup does for a deactivated one, and keep the decision in the operator log
 * only (the organisation's own log goes with it).
 *
 * Runs inside the caller's transaction. Server only (takes a Prisma transaction client).
 */

import type { Prisma } from "@/generated/prisma/client"
import { decideReview } from "@/lib/org-review"
import { logOperator, organizationTarget } from "@/lib/operator-log"
import type { OperatorLogInput } from "@/lib/operator-log"

export type RefuseOrganizationInput = {
  organizationId: string
  actor: OperatorLogInput["actor"]
}

export type RefuseOrganizationResult =
  | { refused: true }
  | { refused: false; status: 400 | 404 | 409; error: string }

export async function refuseOrganization(
  tx: Prisma.TransactionClient,
  { organizationId, actor }: RefuseOrganizationInput,
): Promise<RefuseOrganizationResult> {
  // Lock order, shared with account activation (src/lib/account-activation-server.ts): the
  // organisation's administrator rows first, in id order, then the `Organization` row. The
  // activation updates one administrator row and then locks the organisation; taking the two
  // locks in the same order means an owner activating while the operator refuses can wait, never
  // deadlock. (Approval takes the organisation row only: it reads administrators without locking.)
  await tx.$queryRaw`SELECT id FROM "AdminUser" WHERE "organizationId" = ${organizationId} ORDER BY id FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`

  // Decided again under the locks, so an approval or a suspension that committed first is never
  // undone by a refusal decided from the route's older read.
  const current = await tx.organization.findUnique({
    where: { id: organizationId },
    select: {
      name: true,
      slug: true,
      active: true,
      suspendedAt: true,
      publicationApprovedAt: true,
      outboundEmailApprovedAt: true,
    },
  })
  if (!current) return { refused: false, status: 404, error: "Organisation non trouvée" }
  const again = decideReview(current, "refuse")
  if (!again.ok) return { refused: false, status: again.status, error: again.error }

  // Admins are only SET NULL by the organisation's deletion: removed with it, as the cleanup does.
  await tx.adminUser.deleteMany({ where: { organizationId } })
  await tx.organization.delete({ where: { id: organizationId } })
  // The organisation's own log goes with it: the decision is kept in the operator's log, with the
  // name and slug read under the locks (the more correct ones under a concurrent rename).
  await logOperator(tx, {
    action: "organization.refused",
    actor,
    entityType: "Organization",
    entityId: organizationId,
    target: organizationTarget(current),
  })
  return { refused: true }
}
