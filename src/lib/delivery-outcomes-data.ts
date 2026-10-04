// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// DeliveryOutcome isn't a tenant model of the org-scoped client (like NotificationOutbox): the
// organization filter is written explicitly here and covered by the cross-tenant test. Read-only
// foundation for #599 (flagging an address "to verify"): this issue (#598) only has to prove the
// data is there, org-scoped and minimal — no admin UI yet.
import { prisma } from "./prisma"

export type DeliveryOutcomeRow = {
  id: string
  volunteerId: string | null
  kind: string
  outcome: string
  reason: string | null
  createdAt: Date
}

/** The member's delivery outcomes for this organization, newest first (#599 will use this to
 * decide whether the member's current address needs checking). */
export async function loadDeliveryOutcomesForVolunteer(
  organizationId: string,
  volunteerId: string,
  limit = 20,
): Promise<DeliveryOutcomeRow[]> {
  return prisma.deliveryOutcome.findMany({
    where: { organizationId, volunteerId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, volunteerId: true, kind: true, outcome: true, reason: true, createdAt: true },
  })
}
