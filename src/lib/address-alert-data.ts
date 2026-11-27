// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "./prisma"
import { env } from "./env"
import { IMPORTANT_NOTIFICATION_KINDS, summaryDayKey } from "./delivery-summary"
import { loadAddressStatuses } from "./delivery-outcomes-data"
import { loadSummaryRecipients } from "./delivery-summary-data"
import { addressHash } from "./notifications/smtp-outcome"
import { enqueueNotifications } from "./notifications/outbox"
import { adminMembersToVerifyUrl } from "./notifications/templates/shared"
import { parseNotificationSettings } from "./notification-settings"
import { shiftEndsAt, shiftStartsAt } from "./cancel-deadline"
import { orgTimeZone } from "./time-zone"
import { RETENTION_DAYS } from "./retention"
import {
  ADDRESS_ALERT_LOOKBACK_MINUTES,
  ADDRESS_ALERT_WINDOW_HOURS,
  addressAlertDedupeKey,
  alertWhenText,
  neverReached,
  nextShiftSoon,
  type AddressAlertMember,
} from "./address-alert"

export type OrgAddressAlert = { organizationId: string; members: (AddressAlertMember & { id: string })[] }

/**
 * Members whose current address has just failed for good (an important email rejected since
 * `since`) and who hold a confirmed shift starting soon, per organisation (#1476). Every query is
 * scoped to the organisation of the failed send: a volunteer, a registration or an outcome of
 * another organisation never enters its alert.
 */
export async function loadAddressAlerts(since: Date, now: Date = new Date()): Promise<OrgAddressAlert[]> {
  const rows = await prisma.deliveryOutcome.findMany({
    where: {
      outcome: "rejected_permanent",
      kind: { in: [...IMPORTANT_NOTIFICATION_KINDS] },
      createdAt: { gte: since },
      organizationId: { not: null },
      volunteerId: { not: null },
    },
    select: { organizationId: true, volunteerId: true },
    distinct: ["organizationId", "volunteerId"],
  })
  const byOrg = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!r.organizationId || !r.volunteerId) continue
    byOrg.set(r.organizationId, (byOrg.get(r.organizationId) ?? new Set<string>()).add(r.volunteerId))
  }

  const result: OrgAddressAlert[] = []
  const retentionCutoff = new Date(now.getTime() - RETENTION_DAYS.deliveryOutcome * 24 * 60 * 60 * 1000)
  // A shift's row carries its calendar day at midnight UTC: one day of margin covers every zone.
  const fromDay = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const untilDay = new Date(now.getTime() + (ADDRESS_ALERT_WINDOW_HOURS + 24) * 60 * 60 * 1000)

  for (const [organizationId, idSet] of byOrg) {
    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { timeZone: true } })
    const timeZone = orgTimeZone(org)
    const volunteers = await prisma.volunteer.findMany({
      where: { id: { in: [...idSet] }, organizationId },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    })
    const hashes = new Map(volunteers.map((v) => [v.id, v.email ? addressHash(v.email, env.AUTH_SECRET) : null]))
    const statuses = await loadAddressStatuses(organizationId, volunteers.map((v) => ({ id: v.id, addressHash: hashes.get(v.id) ?? null })), now)
    const flagged = volunteers.filter((v) => statuses.get(v.id)?.kind === "to_verify")
    if (flagged.length === 0) continue

    const registrations = await prisma.registration.findMany({
      where: {
        status: "active",
        volunteerId: { in: flagged.map((v) => v.id) },
        shift: { date: { gte: fromDay, lte: untilDay }, event: { organizationId } },
      },
      select: {
        volunteerId: true,
        shift: { select: { date: true, startTime: true, endTime: true, roleName: true, label: true, event: { select: { title: true } } } },
      },
    })
    const outcomes = await prisma.deliveryOutcome.findMany({
      where: { organizationId, volunteerId: { in: flagged.map((v) => v.id) }, createdAt: { gte: retentionCutoff } },
      select: { volunteerId: true, addressHash: true, outcome: true, createdAt: true, outboxId: true, messageRef: true },
    })

    const members: OrgAddressAlert["members"] = []
    for (const v of flagged) {
      const shifts = registrations
        .filter((r) => r.volunteerId === v.id)
        .map((r) => ({
          startsAt: shiftStartsAt(r.shift, timeZone),
          endsAt: shiftEndsAt(r.shift, timeZone),
          startTime: r.shift.startTime,
          endTime: r.shift.endTime,
          roleName: r.shift.roleName,
          label: r.shift.label,
          eventTitle: r.shift.event.title,
        }))
      const next = nextShiftSoon(shifts, now) as (typeof shifts)[number] | null
      if (!next) continue
      const hash = hashes.get(v.id) ?? null
      members.push({
        id: v.id,
        name: `${v.firstName} ${v.lastName}`.trim(),
        phone: v.phone?.trim() || null,
        eventTitle: next.eventTitle,
        shiftName: next.label && next.label !== next.roleName ? `${next.roleName} · ${next.label}` : next.roleName,
        when: alertWhenText(next, now, timeZone),
        neverReached: neverReached(outcomes.filter((o) => o.volunteerId === v.id && o.addressHash === hash), now),
      })
    }
    if (members.length > 0) result.push({ organizationId, members: members.sort((a, b) => a.name.localeCompare(b.name, "fr")) })
  }
  return result
}

/**
 * Queues the alert for each organisation concerned, to the same recipients and under the same
 * opt-out as the nightly summary. Returns the ids of the queued emails; the outbox drops a repeat
 * of the same people on the same day.
 */
export async function enqueueAddressAlerts(now: Date = new Date()): Promise<string[]> {
  const since = new Date(now.getTime() - ADDRESS_ALERT_LOOKBACK_MINUTES * 60 * 1000)
  const alerts = await loadAddressAlerts(since, now)
  const queued: string[] = []
  for (const alert of alerts) {
    const org = await prisma.organization.findUnique({ where: { id: alert.organizationId }, select: { notificationSettings: true } })
    if (!parseNotificationSettings(org?.notificationSettings).addressesToVerifyAdminEmail) continue
    const recipients = await loadSummaryRecipients(alert.organizationId)
    if (recipients.length === 0) continue
    const dayKey = summaryDayKey(now)
    const ids = await enqueueNotifications(
      recipients.map((r) => ({
        kind: "address_to_verify_alert" as const,
        recipient: { email: r.email, name: r.name },
        organizationId: alert.organizationId,
        dedupeKey: addressAlertDedupeKey(alert.organizationId, dayKey, r.email, alert.members.map((m) => m.id)),
        data: {
          members: alert.members.map(({ name, phone, eventTitle, shiftName, when, neverReached: never }) => ({ name, phone, eventTitle, shiftName, when, neverReached: never })),
          membersUrl: adminMembersToVerifyUrl(),
        },
      })),
    )
    queued.push(...ids)
  }
  return queued
}
