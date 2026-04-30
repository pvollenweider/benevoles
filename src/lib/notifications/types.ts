/**
 * Notifications layer.
 *
 * Goal: keep the rest of the app provider-agnostic. Code calls
 * `sendNotification(payload)` and never imports nodemailer / resend
 * / twilio directly. Adding a new channel (SMS, WhatsApp) becomes a
 * matter of adding one file under `channels/` without touching callers.
 */

export type NotificationChannel = "email" | "sms" | "whatsapp"

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
  | "admin_invitation"
  | "password_reset"

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>
}

export interface NotificationChannelImpl {
  readonly name: NotificationChannel
  send(payload: NotificationPayload): Promise<{ ok: true } | { ok: false; reason: string }>
}
