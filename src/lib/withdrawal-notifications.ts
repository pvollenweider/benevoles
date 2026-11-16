// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Notifications of a volunteer's withdrawal (#559): built into an outbox collector and returned
 * as payloads, each with its dedupe key (#315), the same way `buildSignupNotifications` does for
 * a sign-up. The DELETE route enqueues them after the registration is cancelled (and the freed
 * spot possibly offered to the waitlist).
 *
 * Only a withdrawal that held a spot (a confirmed place or a pending request) calls this: see
 * `planVolunteerWithdraw().notifiesOrganizers`. Leaving the waitlist or declining an offer never
 * does.
 */

import { prisma } from "./prisma"
import { parseNotificationSettings } from "./notification-settings"
import type { NotificationPayload } from "./notifications"
import { collectNotifications, enqueueNotifications } from "./notifications/outbox"
import { digestDelayMs, queueDigestItem } from "./notifications/digest"
import { linkToken } from "./token-vault"
import { leadersCoveringRole } from "./leader-scope-data"
import { deadlineMoment } from "./cancel-deadline"
import { APP_TIME_ZONE, localDateTimeToUtc } from "./time-zone"

export type WithdrawalNotificationInput = {
  registrationId: string
  event: { id: string; title: string; organizationId: string; organization: { slug: string } }
  shift: { id: string; roleName: string; label: string; date: Date; startTime: string; endTime: string }
  volunteerName: string
  /** The volunteer's optional note, trimmed; never stored anywhere but this outbox payload. */
  message: string | null
  /** Whether the freed spot was immediately offered to the next person on the waitlist. */
  waitlistTookSpot: boolean
  /** How many places are missing on the shift once this withdrawal (and any promotion) settled. */
  placesMissing: number
  /**
   * Less than 24 hours before the shift's start (#946, `isLateWithdrawal`): sent at once, never
   * grouped, worded « Désistement de dernière minute » with the shift's start.
   */
  late?: boolean
  /** The organisation's zone, for the start of a late withdrawal's shift. */
  timeZone?: string
}

/**
 * Admins (same recipients as `sendAdminNotification`, #381) and the role's sector leaders (same
 * lookup as `notifySectorLeadersOfSignup`, #186), gated by one setting (`withdrawalAdminEmail`,
 * #559): off means neither group is told, there is no separate switch for leaders.
 */
export async function buildWithdrawalNotifications(
  input: WithdrawalNotificationInput,
): Promise<(NotificationPayload & { dedupeKey: string })[]> {
  const { event, shift } = input
  const org = await prisma.organization.findUnique({ where: { id: event.organizationId }, select: { notificationSettings: true } })
  if (!parseNotificationSettings(org?.notificationSettings).withdrawalAdminEmail) return []

  const outbox = collectNotifications()

  const shiftData = {
    eventId: event.id,
    eventTitle: event.title,
    volunteerName: input.volunteerName,
    shiftId: shift.id,
    shiftLabel: shift.label,
    roleName: shift.roleName,
    shiftDate: shift.date.toLocaleDateString("fr-FR"),
    startTime: shift.startTime,
    endTime: shift.endTime,
    placesMissing: input.placesMissing,
    waitlistTookSpot: input.waitlistTookSpot,
    message: input.message,
    ...(input.late ? { late: true, startsAt: deadlineMoment(startInstant(shift, input.timeZone), input.timeZone ?? APP_TIME_ZONE) } : {}),
  }

  const admins = await prisma.adminUser.findMany({
    where: { organizationId: event.organizationId, isActive: true },
    select: { email: true, name: true },
  })
  // Same fallback as sendAdminNotification: only when the org has no active admin on record.
  // Read directly off process.env (not the validated `env` export) so importing this module
  // never forces the env schema check: a route that only reads a registration (GET) must not
  // start requiring DATABASE_URL/AUTH_SECRET in tests that never touch a withdrawal.
  const fallbackEmail = process.env.ADMIN_NOTIFICATION_EMAIL
  const adminRecipients = admins.length > 0
    ? admins
    : fallbackEmail
      ? [{ email: fallbackEmail, name: "Admin" }]
      : []
  for (const r of adminRecipients) {
    await outbox.send({ kind: "registration_cancelled", recipient: { email: r.email, name: r.name }, organizationId: event.organizationId, data: shiftData })
  }

  // The poste's leaders and its sector's (#1169), once per address.
  const leaders = await leadersCoveringRole(prisma, event.id, shift.roleName)
  for (const leader of leaders) {
    await outbox.send({
      kind: "sector_leader_withdrawal",
      recipient: { email: leader.email, name: leader.name },
      organizationId: event.organizationId,
      data: {
        ...shiftData,
        leaderName: leader.name,
        ...(leader.sectorId ? { sectorName: leader.sector?.name ?? null } : {}),
        orgSlug: event.organization.slug,
        token: linkToken.reveal(leader),
      },
    })
  }

  // One key per notification of this withdrawal (#315): a repeated enqueue (double click) stores
  // it once. The registration's conditional status update already makes this the only run in
  // practice, but the dedupe key is kept as the defence this project uses everywhere else.
  return outbox.payloads.map((p) => ({
    ...p,
    dedupeKey: `${p.kind}:${input.registrationId}:${p.recipient.email ?? ""}`,
  }))
}

/** The shift's start as an instant, for the « commence le … » of a late withdrawal. */
function startInstant(shift: WithdrawalNotificationInput["shift"], timeZone: string | undefined): Date {
  return localDateTimeToUtc(shift.date, shift.startTime, timeZone ?? APP_TIME_ZONE)
}

/** How long a withdrawal email waits for others of the same event (#869): one email for several. */
export const WITHDRAWAL_DIGEST_DELAY_MS = 5 * 60 * 1000

/** The per-withdrawal part of the email; the rest (event, leader) is shared by the group. */
const ITEM_KEYS = ["volunteerName", "shiftId", "shiftLabel", "roleName", "shiftDate", "startTime", "endTime", "placesMissing", "waitlistTookSpot", "message"] as const

/**
 * Queues the withdrawal emails grouped (#869): several withdrawals of one event within a few
 * minutes reach each organiser and sector leader as one email listing them, instead of one each.
 */
export async function queueWithdrawalNotifications(input: WithdrawalNotificationInput, now: Date = new Date()): Promise<string[]> {
  const payloads = await buildWithdrawalNotifications(input)
  // A last-minute withdrawal (#946) skips the grouping: due now, one email per withdrawal, so a
  // replacement can be found while there is still time. Its own key: never merged into a digest.
  if (input.late) {
    if (payloads.length === 0) return []
    return enqueueNotifications(payloads.map((p) => ({ ...p, dedupeKey: `${p.kind}:late:${input.registrationId}:${(p.recipient.email ?? "").toLowerCase()}` })))
  }
  const delayMs = digestDelayMs(WITHDRAWAL_DIGEST_DELAY_MS)
  const dueIds: string[] = []
  for (const payload of payloads) {
    const data = payload.data as Record<string, unknown>
    const item = Object.fromEntries(ITEM_KEYS.map((k) => [k, data[k]]))
    const base = Object.fromEntries(Object.entries(data).filter(([k]) => !(ITEM_KEYS as readonly string[]).includes(k)))
    const dueId = await queueDigestItem({
      kind: payload.kind,
      groupKey: `${payload.kind}:${input.event.id}:${(payload.recipient.email ?? "").toLowerCase()}`,
      recipient: payload.recipient,
      organizationId: input.event.organizationId,
      base,
      item,
      itemKey: input.registrationId,
      now,
      delayMs,
    })
    if (dueId) dueIds.push(dueId)
  }
  // Due at once only without a delay (DIGEST_DELAY_SECONDS=0): the caller delivers them now.
  return dueIds
}
