// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Notifications layer.
 *
 * Code calls `sendNotification(payload)` and never imports nodemailer directly: the email
 * channel (`channels/email.ts`) is the only place that talks to the SMTP server.
 */

export type NotificationKind =
  | "registration_confirmation"
  | "member_invite"
  | "reminder_j2"
  | "reminder_j1"
  | "reminder_dd"
  | "manual_reminder"
  | "shift_modified"
  | "shift_cancelled"
  | "registration_cancelled"
  | "admin_notification"
  | "admin_invite"
  | "admin_welcome"
  | "password_reset"
  | "waitlist_confirmation"
  | "waitlist_offered"
  | "sector_leader_invite"
  | "sector_leader_new_signup"
  | "sector_leader_withdrawal"
  | "product_update"
  | "registration_link_resend"
  | "targeted_message"
  | "registration_requested"
  | "registration_refused"
  | "registration_removed"
  | "registration_withdrawn"
  | "release_available"
  | "addresses_to_verify_summary"
  | "open_shifts"
  | "operator_alert"
  | "signup_confirmation"
  | "signup_account_link"
  | "space_approved"

/** Delivery attempts before the outbox gives up (5 min, 10, 20, 40, 80 between them). */
export const MAX_ATTEMPTS = 6

export type Recipient = {
  email?: string | null
  phone?: string | null
  name?: string
}

/**
 * Payload of any notification. `data` carries the kind-specific
 * variables consumed by the template. The shape is loose on purpose:
 * each template knows its own contract.
 */
export type NotificationPayload<K extends NotificationKind = NotificationKind> = {
  kind: K
  recipient: Recipient
  /** Outbox only (#315): stored once per key, see NotificationOutbox.dedupeKey. */
  dedupeKey?: string
  /** Email Message-ID, stable per outbox row, so a re-send after a crash is the same message. */
  messageId?: string
  /** Organization the notification belongs to (#382); stored on the outbox row for the admin delivery page. */
  organizationId?: string | null
  /**
   * The member this notification is for (#598), when the recipient is one: nullable, since
   * admins, sector leaders and test emails have none. Used only to link a DeliveryOutcome row to
   * the member — never stored in the outbox payload's own PII beyond what it already carries.
   */
  volunteerId?: string | null
  /** The outbox row this send belongs to (#598), set by deliverOutbox; absent for synchronous sends. */
  outboxId?: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>
}

/**
 * How a helper delivers a notification: sendNotification, or an outbox collector (#293).
 * `permanent` (#598): true when the failure is a permanent SMTP rejection — the outbox stops
 * retrying at once instead of spending ~2.5h on a backoff that can't succeed.
 */
export type Send = (payload: NotificationPayload) => Promise<{ ok: true } | { ok: false; reason: string; permanent?: boolean; blocked?: true; held?: true; retryAfterMs?: number }>
