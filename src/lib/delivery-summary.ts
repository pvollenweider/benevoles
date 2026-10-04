// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { NotificationKind } from "./notifications/types"

/**
 * Daily summary of addresses to verify (#599, owner decision 2026-10-04): sent to an
 * organization's admins only when a permanent failure of one of these kinds happened since the
 * last run — never for every "to verify" member, and never for a temporary incident alone.
 * `reminder_j2`/`j1`/`dd` are only ever sent a few days before the shift (#598's own reminders
 * cron), so "a reminder for a shift in the next 7 days" holds for every one of them by
 * construction: no separate shift-date lookup is needed here.
 */
export const IMPORTANT_NOTIFICATION_KINDS: ReadonlySet<NotificationKind> = new Set([
  "registration_confirmation",
  "waitlist_offered",
  "reminder_j2",
  "reminder_j1",
  "reminder_dd",
])

export function isImportantNotificationKind(kind: string): boolean {
  return IMPORTANT_NOTIFICATION_KINDS.has(kind as NotificationKind)
}

/** How far back the nightly cron looks for new permanent failures: since its own last run, the
 * night before (#599's cron runs once a day, k8s/cronjob-cleanup.yaml). */
export const SUMMARY_WINDOW_HOURS = 24

/** "YYYY-MM-DD" (UTC): the day component of the outbox dedupe key, so at most one summary email
 * goes out per organization per admin per day however many times the cron happens to run. */
export function summaryDayKey(now: Date): string {
  return now.toISOString().slice(0, 10)
}
