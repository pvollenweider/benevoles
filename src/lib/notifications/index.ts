// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Public API of the notifications layer.
 *
 *   await sendNotification({ kind: "registration_confirmation", recipient, data })
 *
 * Email is the only channel. Push notifications are sent separately (`src/lib/push.ts`).
 */

import { emailChannel } from "./channels/email"
import { organizationSendingVerdict } from "./org-send-guard"
import { takeSendAllowance } from "./send-limits"
import type { NotificationKind, NotificationPayload } from "./types"

/**
 * The only way to send an email: every path (direct sends, scheduled jobs, the outbox and its
 * retries) comes through here, and the email channel is the only code that talks to SMTP. An
 * email of a deactivated or deleted organisation is refused here, right before the send (#814),
 * with `blocked: true` so the outbox cancels the row instead of retrying it. Then the sending
 * limits (#810, src/lib/notifications/send-limits.ts): over one, `held: true` and when to try
 * again; the outbox keeps the row pending, a direct send reports it to its caller.
 */
export async function sendNotification(
  payload: NotificationPayload,
): Promise<{ ok: true } | { ok: false; reason: string; permanent?: boolean; blocked?: true; held?: true; retryAfterMs?: number }> {
  // Deactivated or missing organisation (#814), or one awaiting validation writing to someone other
  // than its administrators (#810): refused, and the outbox cancels the row.
  const refused = await organizationSendingVerdict(payload.organizationId, payload.recipient?.email)
  if (refused) return { ok: false, reason: refused, permanent: true, blocked: true }
  const allowance = await takeSendAllowance(payload.organizationId, payload.kind, { recipientEmail: payload.recipient?.email })
  // Over the per-recipient cap: abandoned, like a cancellation (the outbox marks it « cancelled »,
  // never retried). Over any other limit: held until the window ends.
  if (!allowance.ok && allowance.drop) return { ok: false, reason: `limit:${allowance.limit}`, permanent: true, blocked: true }
  if (!allowance.ok) return { ok: false, reason: `limit:${allowance.limit}`, held: true, retryAfterMs: allowance.retryAfterMs }
  return emailChannel.send(payload)
}

export type { NotificationKind, NotificationPayload }
export type { Send } from "./types"
