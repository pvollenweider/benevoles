// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import nodemailer from "nodemailer"
import { prisma } from "../../prisma"
import { env } from "@/lib/env"
import type { NotificationPayload, Send } from "../types"
import { render } from "../templates"

/**
 * Outcome when no SMTP server is configured. Outside production (dev, tests) the message is printed
 * to the console so it can be read. In production that would log a recipient and a body that may
 * hold a personal link, and report a success for an email that never left: the send fails instead,
 * with a reason free of personal data, so the outbox retries it and alerts when it gives up.
 */
export function missingSmtpOutcome(nodeEnv: string | undefined): { ok: true } | { ok: false; reason: string } {
  if (nodeEnv === "production") return { ok: false, reason: "SMTP_HOST manquant : email non envoyé." }
  return { ok: true }
}

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
    // Hard fail fast when SMTP is unreachable so the route doesn't
    // hang for 30s+ per recipient on a misconfigured port.
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
  })
}

/** Reply-to of an organization, looked up per send; the outbox worker sends a handful per run. */
async function orgReplyTo(organizationId: string): Promise<string | null> {
  try {
    const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { replyToEmail: true } })
    return org?.replyToEmail?.trim() || null
  } catch {
    return null
  }
}

export const emailChannel: { send: Send } = {
  async send(payload: NotificationPayload) {
    const to = payload.recipient.email
    if (!to) {
      return { ok: false as const, reason: "recipient has no email" }
    }

    const { subject, html, text } = render(payload)
    const from = env.EMAIL_FROM ?? "Bénévoles <notifications@benevol.app>"
    // The organization's own reply-to when it set one (#381), else the platform's.
    const replyTo = (payload.organizationId ? await orgReplyTo(payload.organizationId) : null) ?? env.EMAIL_REPLY_TO ?? undefined
    const transport = createTransport()

    if (!transport) {
      const outcome = missingSmtpOutcome(process.env.NODE_ENV)
      if (!outcome.ok) {
        console.error(`[notif:email] ${outcome.reason} (${payload.kind})`)
        return outcome
      }
      console.log(`[notif:email→${to}] ${subject}`)
      console.log(`[notif:body]\n${text}\n`)
      return outcome
    }

    try {
      await transport.sendMail({ from, to, subject, html, text, replyTo, ...(payload.messageId ? { messageId: payload.messageId } : {}) })
      return { ok: true as const }
    } catch (err) {
      // No recipient in the log: an address is personal data, and the outbox keeps the row.
      console.error(`[notif:email] ${payload.kind} failed:`, err)
      return { ok: false as const, reason: String(err) }
    }
  },
}
