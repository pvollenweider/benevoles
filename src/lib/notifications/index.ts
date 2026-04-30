/**
 * Public API of the notifications layer.
 *
 *   await sendNotification({ kind: "registration_confirmation", recipient, data })
 *
 * The default channel is email. Future channels (sms, whatsapp) plug
 * in by adding an entry to `channels` below — no caller change needed.
 */

import { emailChannel } from "./channels/email"
import type {
  NotificationChannel,
  NotificationChannelImpl,
  NotificationKind,
  NotificationPayload,
} from "./types"

const channels: Record<NotificationChannel, NotificationChannelImpl | null> = {
  email: emailChannel,
  sms: null, // TODO: post-MVP
  whatsapp: null, // TODO: post-MVP
}

export async function sendNotification(
  payload: NotificationPayload,
  channel: NotificationChannel = "email",
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const impl = channels[channel]
  if (!impl) return { ok: false, reason: `channel ${channel} not implemented` }
  return impl.send(payload)
}

export type { NotificationKind, NotificationChannel, NotificationPayload }
