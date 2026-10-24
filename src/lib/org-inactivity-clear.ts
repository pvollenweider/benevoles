// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Prisma } from "@/generated/prisma/client"

type Tx = Prisma.TransactionClient

/**
 * Everything the procedure holds, cleared in the caller's transaction when it stops (activity,
 * answer, upcoming event, postponement, exclusion) or ends: the step rows, the planned date, the
 * blocked mark, every keep link, and the copies of its emails still waiting to leave.
 */
export async function clearProcedure(tx: Tx, organizationId: string): Promise<void> {
  // The organisation's row first, before any outbox row: the same order as every other writer of
  // the organisation's state (operator decisions, reactivation, nightly deactivation, keep link), so
  // two of them never wait on each other. Already held by a caller that took it: no effect.
  await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${organizationId} FOR UPDATE`
  const steps = await tx.orgInactivityStep.findMany({ where: { organizationId }, select: { id: true } })
  if (steps.length > 0) {
    await tx.notificationOutbox.updateMany({
      where: { inactivityStepId: { in: steps.map((s) => s.id) }, status: "pending" },
      data: { status: "cancelled", lastError: "Vérification d'inactivité arrêtée : message annulé.", claimedAt: null },
    })
    await tx.orgInactivityStep.deleteMany({ where: { organizationId } })
  }
  await tx.organization.update({
    where: { id: organizationId },
    data: { inactivityNoticeAt: null, inactivityEmailsSent: 0, inactivityPlannedAt: null, inactivityBlockedAt: null },
  })
  await tx.orgKeepLink.deleteMany({ where: { organizationId } })
}

