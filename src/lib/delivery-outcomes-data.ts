// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

// DeliveryOutcome isn't a tenant model of the org-scoped client (like NotificationOutbox): the
// organization filter is written explicitly here and covered by the cross-tenant test. Read-only
// foundation for #599 (flagging an address "to verify"): this issue (#598) only has to prove the
// data is there, org-scoped and minimal — no admin UI yet.
import { prisma } from "./prisma"
import { addressStatus, type AddressStatus } from "./address-status"
import { RETENTION_DAYS } from "./retention"

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

export type AddressHashOutcomeRow = { volunteerId: string | null; addressHash: string | null; outcome: string; createdAt: Date }

/**
 * Every outcome of the organization's members within the retention window, one query (#599):
 * the members list and the dashboard each need this for every member at once, not one row at a
 * time. `volunteerIds` narrows it to the members actually shown (the members list passes every
 * active+inactive id it already loaded).
 */
export async function loadDeliveryOutcomesForVolunteers(
  organizationId: string,
  volunteerIds: string[],
  now: Date = new Date(),
): Promise<AddressHashOutcomeRow[]> {
  if (volunteerIds.length === 0) return []
  const cutoff = new Date(now.getTime() - RETENTION_DAYS.deliveryOutcome * 24 * 60 * 60 * 1000)
  return prisma.deliveryOutcome.findMany({
    where: { organizationId, volunteerId: { in: volunteerIds }, createdAt: { gte: cutoff } },
    select: { volunteerId: true, addressHash: true, outcome: true, createdAt: true },
  })
}

/**
 * Address status of every member passed in, in one extra query (#599): groups the organization's
 * recent outcomes by volunteer and applies the pure `addressStatus` rule. The caller hashes each
 * member's current address first (AUTH_SECRET is server-only, and this module stays free of it so
 * it keeps working the same whether or not the caller happens to need the real env module — see
 * the cross-tenant isolation tests, which mock prisma but not env). A member without an email
 * passes a null hash and always comes back "ok" (nothing to check).
 */
export async function loadAddressStatuses(
  organizationId: string,
  members: { id: string; addressHash: string | null }[],
  now: Date = new Date(),
): Promise<Map<string, AddressStatus>> {
  const outcomes = await loadDeliveryOutcomesForVolunteers(organizationId, members.map((m) => m.id), now)
  const byVolunteer = new Map<string, AddressHashOutcomeRow[]>()
  for (const o of outcomes) {
    if (!o.volunteerId) continue
    const list = byVolunteer.get(o.volunteerId) ?? []
    list.push(o)
    byVolunteer.set(o.volunteerId, list)
  }
  const result = new Map<string, AddressStatus>()
  for (const m of members) {
    result.set(m.id, addressStatus(m.addressHash, byVolunteer.get(m.id) ?? [], now))
  }
  return result
}
