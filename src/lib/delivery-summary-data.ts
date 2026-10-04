// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "./prisma"
import { env } from "./env"
import { IMPORTANT_NOTIFICATION_KINDS } from "./delivery-summary"
import { loadAddressStatuses } from "./delivery-outcomes-data"
import { addressHash } from "./notifications/smtp-outcome"

export type OrgAddressSummary = { organizationId: string; members: { id: string; name: string }[] }

/**
 * Organizations with at least one member whose CURRENT address is still "to verify" (#599)
 * because of an important kind (confirmation, waitlist offer, reminder) that failed permanently
 * since `since`. Candidate volunteers come from DeliveryOutcome, grouped by organization; each one
 * is then re-checked against the full address-status rule (loadAddressStatuses, same as the
 * members list) so a meanwhile-fixed or since-changed address is excluded — "latest wins" applies
 * here exactly as it does for the member page.
 */
export async function loadOrganizationsWithNewAddressesToVerify(
  since: Date,
  now: Date = new Date(),
  /** Scopes the whole computation to one organization (the dashboard, which only ever needs its
   * own count); omitted, it covers every organization (the nightly cron). */
  organizationId?: string,
): Promise<OrgAddressSummary[]> {
  const rows = await prisma.deliveryOutcome.findMany({
    where: {
      outcome: "rejected_permanent",
      kind: { in: [...IMPORTANT_NOTIFICATION_KINDS] },
      createdAt: { gte: since },
      organizationId: organizationId ?? { not: null },
      volunteerId: { not: null },
    },
    select: { organizationId: true, volunteerId: true },
    distinct: ["organizationId", "volunteerId"],
  })

  const byOrg = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!r.organizationId || !r.volunteerId) continue
    const set = byOrg.get(r.organizationId) ?? new Set<string>()
    set.add(r.volunteerId)
    byOrg.set(r.organizationId, set)
  }

  const result: OrgAddressSummary[] = []
  for (const [organizationId, idSet] of byOrg) {
    const ids = [...idSet]
    const volunteers = await prisma.volunteer.findMany({
      where: { id: { in: ids }, organizationId },
      select: { id: true, firstName: true, lastName: true, email: true },
    })
    const statuses = await loadAddressStatuses(
      organizationId,
      volunteers.map((v) => ({ id: v.id, addressHash: v.email ? addressHash(v.email, env.AUTH_SECRET) : null })),
      now,
    )
    const members = volunteers
      .filter((v) => statuses.get(v.id)?.kind === "to_verify")
      .map((v) => ({ id: v.id, name: `${v.firstName} ${v.lastName}` }))
    if (members.length > 0) result.push({ organizationId, members })
  }
  return result
}

export type SummaryRecipient = { email: string; name: string }

/** Active admins of the organization, falling back to ADMIN_NOTIFICATION_EMAIL when it has none
 * (same rule as sendAdminNotification, notification-helpers.ts). */
export async function loadSummaryRecipients(organizationId: string): Promise<SummaryRecipient[]> {
  const admins = await prisma.adminUser.findMany({
    where: { organizationId, isActive: true },
    select: { email: true, name: true },
  })
  if (admins.length > 0) return admins
  return env.ADMIN_NOTIFICATION_EMAIL ? [{ email: env.ADMIN_NOTIFICATION_EMAIL, name: "Admin" }] : []
}
