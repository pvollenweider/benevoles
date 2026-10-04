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
import { collectNotifications } from "./notifications/outbox"
import { linkToken } from "./token-vault"

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
    await outbox.send({ kind: "registration_cancelled", recipient: { email: r.email, name: r.name }, data: shiftData })
  }

  const leaders = await prisma.sectorLeader.findMany({ where: { eventId: event.id, roleName: shift.roleName } })
  for (const leader of leaders) {
    await outbox.send({
      kind: "sector_leader_withdrawal",
      recipient: { email: leader.email, name: leader.name },
      data: {
        ...shiftData,
        leaderName: leader.name,
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
