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

