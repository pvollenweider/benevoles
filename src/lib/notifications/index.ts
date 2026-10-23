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
import { recordLimitHit } from "./limit-hits"
import { bumpPlatformCounter } from "@/lib/usage-stats"
import type { NotificationKind, NotificationPayload } from "./types"

/**
 * The only way to send an email: every path (direct sends, scheduled jobs, the outbox and its
 * retries) comes through here, and the email channel is the only code that talks to SMTP. An
 * email of a deactivated or deleted organisation is refused here, right before the send (#814),
 * with `blocked: true` so the outbox cancels the row instead of retrying it. Then the sending
 * limits (#810, src/lib/notifications/send-limits.ts): over one, `held: true` and when to try
 * again; the outbox keeps the row pending, a direct send reports it to its caller. `limit` names
 * the limit reached. A refused email (dropped, or a direct send over a limit) is recorded here for
 * the operator (#1100); a held outbox email is recorded by the outbox, once per email and hour.
 */
export async function sendNotification(
  payload: NotificationPayload,
): Promise<{ ok: true } | { ok: false; reason: string; permanent?: boolean; recipientRejected?: true; blocked?: true; held?: true; retryAfterMs?: number; limit?: string }> {
  // Deactivated or missing organisation (#814), or one awaiting validation writing to someone other
  // than its administrators (#810): refused, and the outbox cancels the row.
  const refused = await organizationSendingVerdict(payload.organizationId, payload.recipient?.email)
  if (refused) return { ok: false, reason: refused, permanent: true, blocked: true }
  const allowance = await takeSendAllowance(payload.organizationId, payload.kind, { recipientEmail: payload.recipient?.email })
  // Over the per-recipient cap: abandoned, like a cancellation (the outbox marks it « cancelled »,
  // never retried). Over any other limit: held until the window ends.
  if (!allowance.ok && allowance.drop) {
    await bumpPlatformCounter("emails_dropped")
    await recordLimitHit({ organizationId: payload.organizationId, limit: allowance.limit, outcome: "refused" })
    return { ok: false, reason: `limit:${allowance.limit}`, permanent: true, blocked: true, limit: allowance.limit }
  }
  if (!allowance.ok) {
    await bumpPlatformCounter("emails_held")
    // Outside the outbox nothing holds the email: its caller reports a failure, so it is refused.
    if (!payload.outboxId) await recordLimitHit({ organizationId: payload.organizationId, limit: allowance.limit, outcome: "refused" })
    return { ok: false, reason: `limit:${allowance.limit}`, held: true, retryAfterMs: allowance.retryAfterMs, limit: allowance.limit }
  }
  return emailChannel.send(payload)
}

export type { NotificationKind, NotificationPayload }
export type { Send } from "./types"
