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
import { ORG_INACTIVE_REASON, organizationBlocksSending } from "./org-send-guard"
import type { NotificationKind, NotificationPayload } from "./types"

/**
 * The only way to send an email: every path (direct sends, scheduled jobs, the outbox and its
 * retries) comes through here, and the email channel is the only code that talks to SMTP. An
 * email of a deactivated or deleted organisation is refused here, right before the send (#814),
 * with `blocked: true` so the outbox cancels the row instead of retrying it.
 */
export async function sendNotification(
  payload: NotificationPayload,
): Promise<{ ok: true } | { ok: false; reason: string; permanent?: boolean; blocked?: true }> {
  if (await organizationBlocksSending(payload.organizationId)) {
    return { ok: false, reason: ORG_INACTIVE_REASON, permanent: true, blocked: true }
  }
  return emailChannel.send(payload)
}

export type { NotificationKind, NotificationPayload }
export type { Send } from "./types"
