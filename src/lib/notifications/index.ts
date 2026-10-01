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
import type { NotificationKind, NotificationPayload } from "./types"

export async function sendNotification(
  payload: NotificationPayload,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  return emailChannel.send(payload)
}

export type { NotificationKind, NotificationPayload }
export type { Send } from "./types"
