// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "./prisma"
import { env } from "./env"
import { IMPORTANT_NOTIFICATION_KINDS, summaryDayKey } from "./delivery-summary"
import { loadAddressStatuses } from "./delivery-outcomes-data"
import { addressHash } from "./notifications/smtp-outcome"
import { enqueueNotifications } from "./notifications/outbox"
import { adminMembersToVerifyUrl } from "./notifications/templates/shared"
import { parseNotificationSettings } from "./notification-settings"
import { shiftEndsAt, shiftStartsAt } from "./cancel-deadline"
import { orgTimeZone } from "./time-zone"
import { RETENTION_DAYS } from "./retention"
import { ORG_ACCOUNT_ROLE_WHERE } from "./permissions"
import { recordJobRun } from "./job-runs"
import {
  ADDRESS_ALERT_QUIET_HOURS,
  ADDRESS_ALERT_WINDOW_HOURS,
  addressAlertDedupeKey,
  alertWhenText,
  alertWindowStart,
  nextShiftSoon,
  refusalsText,
  type AddressAlertMember,
} from "./address-alert"

export type OrgAddressAlert = { organizationId: string; members: (AddressAlertMember & { id: string })[] }

const HOUR = 60 * 60 * 1000

/**
 * Members whose current address has just failed for good (an important email rejected since
 * `since`) and who hold a confirmed shift starting soon, per organisation (#1476). Every query is
 * scoped to the organisation of the failed send: a volunteer, a registration or an outcome of
 * another organisation never enters its alert. Someone already refused in the quiet period before
 * the window is left out: one alert, not one per bounce.
 */
export async function loadAddressAlerts(since: Date, now: Date = new Date()): Promise<OrgAddressAlert[]> {
  const important = [...IMPORTANT_NOTIFICATION_KINDS]
  const rows = await prisma.deliveryOutcome.findMany({
    where: { outcome: "rejected_permanent", kind: { in: important }, createdAt: { gte: since }, organizationId: { not: null }, volunteerId: { not: null } },
    select: { organizationId: true, volunteerId: true },
    distinct: ["organizationId", "volunteerId"],
  })
  const byOrg = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!r.organizationId || !r.volunteerId) continue
    byOrg.set(r.organizationId, (byOrg.get(r.organizationId) ?? new Set<string>()).add(r.volunteerId))
  }

  const result: OrgAddressAlert[] = []
  const retentionCutoff = new Date(now.getTime() - RETENTION_DAYS.deliveryOutcome * 24 * HOUR)
  const quietFrom = new Date(since.getTime() - ADDRESS_ALERT_QUIET_HOURS * HOUR)
  // A shift's row carries its calendar day at midnight UTC, whatever the organisation's zone: two
  // days of margin on each side cover every zone, and `nextShiftSoon` then filters on real instants.
  const fromDay = new Date(now.getTime() - 48 * HOUR)
  const untilDay = new Date(now.getTime() + (ADDRESS_ALERT_WINDOW_HOURS + 48) * HOUR)

  for (const [organizationId, idSet] of byOrg) {
    // Already refused shortly before this window: told then, or known since.
    const quiet = await prisma.deliveryOutcome.findMany({
      where: { organizationId, volunteerId: { in: [...idSet] }, outcome: "rejected_permanent", kind: { in: important }, createdAt: { gte: quietFrom, lt: since } },
      select: { volunteerId: true },
      distinct: ["volunteerId"],
    })
    const quietIds = new Set(quiet.map((q) => q.volunteerId))
    const candidateIds = [...idSet].filter((id) => !quietIds.has(id))
    if (candidateIds.length === 0) continue

    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { timeZone: true } })
    const timeZone = orgTimeZone(org)
    const volunteers = await prisma.volunteer.findMany({
      where: { id: { in: candidateIds }, organizationId },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    })
    const hashes = new Map(volunteers.map((v) => [v.id, v.email ? addressHash(v.email, env.AUTH_SECRET) : null]))
    const statuses = await loadAddressStatuses(organizationId, volunteers.map((v) => ({ id: v.id, addressHash: hashes.get(v.id) ?? null })), now)
    const flagged = volunteers.filter((v) => statuses.get(v.id)?.kind === "to_verify")
    if (flagged.length === 0) continue
    const flaggedIds = flagged.map((v) => v.id)

    // Confirmed, on a shift that still takes place, in a published event: what the reminders use.
    const registrations = await prisma.registration.findMany({
      where: {
        status: "active",
        volunteerId: { in: flaggedIds },
        shift: { status: { not: "cancelled" }, date: { gte: fromDay, lte: untilDay }, event: { organizationId, publicStatus: "published" } },
      },
      select: {
        volunteerId: true,
        shift: { select: { date: true, startTime: true, endTime: true, roleName: true, label: true, event: { select: { title: true } } } },
      },
    })
    const history = await prisma.deliveryOutcome.findMany({
      where: { organizationId, volunteerId: { in: flaggedIds }, kind: { in: important }, createdAt: { gte: retentionCutoff } },
      select: { volunteerId: true, addressHash: true, outcome: true, kind: true, createdAt: true },
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
        refusals: refusalsText(history.filter((o) => o.volunteerId === v.id && o.addressHash === hash), timeZone),
      })
    }
    if (members.length > 0) result.push({ organizationId, members: members.sort((a, b) => a.name.localeCompare(b.name, "fr")) })
  }
  return result
}

/**
 * Queues the alert for each organisation concerned, under the same opt-out as the nightly summary.
 * Recipients are the organisation's own active administrators only: unlike the summary, this
 * email carries a phone number, so it never falls back to the instance's notification address.
 * Returns the ids of the queued emails.
 */
export async function enqueueAddressAlerts(since: Date, now: Date = new Date()): Promise<string[]> {
  const alerts = await loadAddressAlerts(since, now)
  const queued: string[] = []
  for (const alert of alerts) {
    const org = await prisma.organization.findUnique({ where: { id: alert.organizationId }, select: { notificationSettings: true } })
    if (!parseNotificationSettings(org?.notificationSettings).addressesToVerifyAdminEmail) continue
    const recipients = await prisma.adminUser.findMany({
      where: { organizationId: alert.organizationId, isActive: true, ...ORG_ACCOUNT_ROLE_WHERE },
      select: { email: true, name: true },
    })
    if (recipients.length === 0) continue
    const dayKey = summaryDayKey(now)
    const ids = await enqueueNotifications(
      recipients.map((r) => ({
        kind: "address_to_verify_alert" as const,
        recipient: { email: r.email, name: r.name },
        organizationId: alert.organizationId,
        // A second guard behind the windows: the same people, the same day, one email.
        dedupeKey: addressAlertDedupeKey(alert.organizationId, dayKey, r.email, alert.members.map((m) => m.id)),
        data: {
          members: alert.members.map(({ name, phone, eventTitle, shiftName, when, refusals }) => ({ name, phone, eventTitle, shiftName, when, refusals })),
          membersUrl: adminMembersToVerifyUrl(),
        },
      })),
    )
    queued.push(...ids)
  }
  return queued
}

/**
 * One run, recorded as its own job: its window starts where the previous run started, so two runs
 * never report the same refusal and a missed run is caught up by the next one.
 */
export async function runAddressAlerts(now: Date = new Date()): Promise<string[]> {
  const previous = await prisma.jobRun.findUnique({ where: { job: "address-alerts" }, select: { startedAt: true } })
  const since = alertWindowStart(previous?.startedAt ?? null, now)
  let ids: string[] = []
  await recordJobRun("address-alerts", async () => {
    ids = await enqueueAddressAlerts(since, now)
    return { queued: ids.length }
  })
  return ids
}
