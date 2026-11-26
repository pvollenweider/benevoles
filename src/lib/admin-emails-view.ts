// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { NotificationKind } from "@/lib/notifications/types"
import { civilDate } from "@/lib/operator-activity"
import { kindLabel } from "@/lib/outbox-view"
import { APP_TIME_ZONE } from "@/lib/time-zone"

/**
 * The emails an organisation's administrators received: what the operator sees on the
 * organisation's page, grouped by civil day in APP_TIME_ZONE and by kind, from the per-recipient
 * DeliveryOutcome rows kept RETENTION_DAYS.deliveryOutcome days. No address, no content: only
 * the kind, the day and whether the relay accepted the message or refused/failed it.
 *
 * Pure and Prisma-free: the grouped rows come from src/lib/admin-emails-data.ts.
 */

/** The anchor of the section on an organisation's page. */
export const ADMIN_EMAILS_ANCHOR = "org-admin-emails"

/** At most this many (day, kind) rows: past it the page says only the latest are shown. */
export const ADMIN_EMAILS_MAX_ROWS = 60

/** Said when the section holds more rows than it shows. */
export const ADMIN_EMAILS_TRUNCATED_SENTENCE = `Seules les ${ADMIN_EMAILS_MAX_ROWS} lignes les plus récentes sont affichées ; les suivantes ne le sont pas.`

/**
 * Kinds sent to an organisation's administrators, read from the templates and their callers.
 * `product_update` (super admin → organisation admins) is listed even though no DeliveryOutcome
 * row is written for it (NOT_RECORDED_KINDS in delivery-outcomes.ts): it is still addressed to
 * administrators, and the classification test wants every kind on one side or the other.
 *
 * `signup_confirmation` and `signup_account_link` go to the person asking for a space, who becomes
 * its owner/administrator. `front_desk_invite` and `password_reset` reach staff accounts (an
 * event's front desk included), never volunteers, members or sector leaders.
 */
export const ADMIN_EMAIL_KINDS: ReadonlySet<NotificationKind> = new Set<NotificationKind>([
  "addresses_to_verify_summary",
  "admin_invite",
  "admin_notification",
  "admin_welcome",
  "answers_changed",
  "availability_changed",
  "front_desk_invite",
  "milestone_owner_reminder",
  "org_inactivity_deactivated",
  "org_inactivity_notice",
  "org_reactivation",
  "past_event_notice",
  "password_reset",
  "product_update",
  "registration_cancelled",
  "shift_swap_approval_needed",
  "signup_account_link",
  "signup_confirmation",
  "space_approved",
])

/**
 * Every other notification kind, addressed to volunteers, members, sector leaders or the
 * operator. Listed explicitly so a new kind must be classified here or in ADMIN_EMAIL_KINDS.
 */
export const NOT_ADMIN_EMAIL_KINDS: ReadonlySet<NotificationKind> = new Set<NotificationKind>([
  "availability_request",
  "manual_reminder",
  "member_invite",
  "open_shifts",
  "operator_alert",
  "org_personal_link",
  "org_personal_link_renewed",
  "registration_added_by_organizer",
  "registration_confirmation",
  "registration_link_resend",
  "registration_refused",
  "registration_removed",
  "registration_requested",
  "registration_restored",
  "registration_withdrawn",
  "release_available",
  "reminder_dd",
  "reminder_j1",
  "reminder_j2",
  "reminder_rule",
  "sector_leader_answers_changed",
  "sector_leader_invite",
  "sector_leader_new_signup",
  "sector_leader_withdrawal",
  "shift_cancelled",
  "shift_modified",
  "shift_swap_applied",
  "shift_swap_ended",
  "shift_swap_offered",
  "signup_email_confirmation",
  "targeted_message",
  "waitlist_confirmation",
  "waitlist_offered",
])

/** « Jours en heure de Zurich. »: the day wording of the section, sibling of zoneSentence. */
export function dayZoneSentence(timeZone: string): string {
  const city = timeZone.split("/").pop()?.replace(/_/g, " ") || timeZone
  return `Jours en heure de ${city}.`
}

/** One DeliveryOutcome row reduced to what the grouping needs. */
export type AdminEmailOutcomeRow = { kind: string; outcome: string; createdAt: Date }

/** A per-day, per-kind, per-outcome count, as the database aggregates it. */
export type AdminEmailCountRow = { day: string; kind: string; outcome: string; count: number }

export type AdminEmailLine = {
  /** "YYYY-MM-DD" in APP_TIME_ZONE. */
  day: string
  kind: string
  /** The kind in French, as the section shows it. */
  kindLabel: string
  /** Accepted by the relay (outcome `accepted_by_relay`). */
  accepted: number
  /** Refused or failed: every other outcome. */
  failed: number
}

export type AdminEmailsView = {
  /** The latest rows first, at most `maxRows`. */
  rows: AdminEmailLine[]
  /** Whether more (day, kind) rows exist than `rows` shows. */
  truncated: boolean
  /** How many (day, kind) rows exist in the window, before the cap. */
  total: number
}

type Pending = { day: string; kind: string; accepted: number; failed: number }

function add(map: Map<string, Pending>, day: string, kind: string, outcome: string, count: number): void {
  const key = `${day}\u0000${kind}`
  let entry = map.get(key)
  if (!entry) {
    entry = { day, kind, accepted: 0, failed: 0 }
    map.set(key, entry)
  }
  // Every outcome other than a relay acceptance is a refusal or a failure.
  if (outcome === "accepted_by_relay") entry.accepted += count
  else entry.failed += count
}

function finish(map: Map<string, Pending>, maxRows: number): AdminEmailsView {
  const all: AdminEmailLine[] = [...map.values()].map((e) => ({
    day: e.day,
    kind: e.kind,
    kindLabel: kindLabel(e.kind),
    accepted: e.accepted,
    failed: e.failed,
  }))
  // Newest civil day first, then the French label, as the operator reads them.
  all.sort((a, b) =>
    b.day.localeCompare(a.day)
    || a.kindLabel.localeCompare(b.kindLabel, "fr")
    || a.kind.localeCompare(b.kind),
  )
  return { rows: all.slice(0, maxRows), truncated: all.length > maxRows, total: all.length }
}

/**
 * Groups per-day counts already aggregated by the database. Used by the loader, which must not
 * read every DeliveryOutcome row to count them.
 */
export function groupAdminEmailCounts(counts: readonly AdminEmailCountRow[], maxRows: number = ADMIN_EMAILS_MAX_ROWS): AdminEmailsView {
  const map = new Map<string, Pending>()
  for (const c of counts) add(map, c.day, c.kind, c.outcome, c.count)
  return finish(map, maxRows)
}

/**
 * Groups raw outcomes, bucketing each row on its civil day in `timeZone` (a 23:30 UTC row falls
 * on the next day in Zurich). The day-in-zone rule lives here; the loader lets PostgreSQL apply it
 * with the same APP_TIME_ZONE so no per-row result is read.
 */
export function groupAdminEmails(rows: readonly AdminEmailOutcomeRow[], timeZone: string = APP_TIME_ZONE, maxRows: number = ADMIN_EMAILS_MAX_ROWS): AdminEmailsView {
  const map = new Map<string, Pending>()
  for (const r of rows) add(map, civilDate(r.createdAt, timeZone), r.kind, r.outcome, 1)
  return finish(map, maxRows)
}
