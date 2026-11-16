// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The events the members page offers in « Inviter à un événement » (#1098): published, and not
 * over on the organisation's calendar day. Event dates are stored as UTC midnights of their
 * calendar day, so the last day is compared with today's date in the organisation's zone
 * (`today`, "YYYY-MM-DD", from localToday), never with the clock. Pure, no Prisma import.
 */
export function inviteTargetsWhere(today: string) {
  return { publicStatus: "published", endDate: { gte: new Date(`${today}T00:00:00Z`) } }
}

/** The same rule on one event, for tests and in-memory lists. */
export function isInviteTarget(event: { publicStatus: string; endDate: Date }, today: string): boolean {
  const where = inviteTargetsWhere(today)
  return event.publicStatus === where.publicStatus && event.endDate.getTime() >= where.endDate.gte.getTime()
}
