import nodemailer from "nodemailer"
import type {
  NotificationChannelImpl,
  NotificationPayload,
} from "../types"
import { render } from "../templates"

function createTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_SECURE } = process.env
  if (!SMTP_HOST) return null

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT ?? 587),
    secure: SMTP_SECURE === "true",
    // Mailpit accepts unauth'd connections; nodemailer needs the auth
    // object to be omitted in that case.
    auth: SMTP_USER && SMTP_PASSWORD ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
  })
}

export const emailChannel: NotificationChannelImpl = {
  name: "email",

  async send(payload: NotificationPayload) {
    const to = payload.recipient.email
    if (!to) {
      return { ok: false as const, reason: "recipient has no email" }
    }

    const { subject, html, text } = render(payload)
    const from = process.env.EMAIL_FROM ?? "Bénévoles <no-reply@example.com>"
    const transport = createTransport()

    if (!transport) {
      console.log(`[notif:email→${to}] ${subject}`)
      console.log(`[notif:body]\n${text}\n`)
      return { ok: true as const }
    }

    try {
      await transport.sendMail({ from, to, subject, html, text })
      return { ok: true as const }
    } catch (err) {
      console.error(`[notif:email→${to}] failed:`, err)
      return { ok: false as const, reason: String(err) }
    }
  },
}
