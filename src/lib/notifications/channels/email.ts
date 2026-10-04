// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import nodemailer from "nodemailer"
import { prisma } from "../../prisma"
import { env } from "@/lib/env"
import type { NotificationPayload, Send } from "../types"
import { render } from "../templates"
import { classifySmtpOutcome, type SmtpErrorLike, type SmtpInfoLike } from "../smtp-outcome"
import { recordDeliveryOutcomes } from "../delivery-outcomes"
import { encodeOutcomeReason } from "@/lib/outbox-view"

/**
 * Outcome when no SMTP server is configured. Outside production (dev, tests) the message is printed
 * to the console so it can be read. In production that would log a recipient and a body that may
 * hold a personal link, and report a success for an email that never left: the send fails instead,
 * with a reason free of personal data, so the outbox retries it and alerts when it gives up.
 * Decision (#598): nothing was ever submitted to a relay, so this is `failed_temporary`, not a
 * permanent rejection — a later send, once SMTP_HOST is configured, must still be retried.
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

    const recordCtx = { kind: payload.kind, organizationId: payload.organizationId, volunteerId: payload.volunteerId, outboxId: payload.outboxId }

    if (!transport) {
      const outcome = missingSmtpOutcome(process.env.NODE_ENV)
      if (!outcome.ok) {
        console.error(`[notif:email] ${payload.kind} failed: code=SMTP_HOST_MISSING category=failed_temporary`)
        const classified = [{ recipient: to, outcome: "failed_temporary" as const, reason: "other" as const, responseCode: null, enhancedStatus: null }]
        await recordDeliveryOutcomes(recordCtx, classified)
        return { ok: false as const, reason: encodeOutcomeReason(classified[0]) }
      }
      console.log(`[notif:email→${to}] ${subject}`)
      console.log(`[notif:body]\n${text}\n`)
      return outcome
    }

    try {
      const info = await transport.sendMail({ from, to, subject, html, text, replyTo, ...(payload.messageId ? { messageId: payload.messageId } : {}) })
      const [classified] = classifySmtpOutcome([to], { info: info as SmtpInfoLike })
      await recordDeliveryOutcomes(recordCtx, [classified])
      if (classified.outcome !== "accepted_by_relay") {
        // Nodemailer only resolves like this when *some* recipient was accepted; with a single
        // `to` that can't happen, but stay honest about what was actually proven.
        console.error(`[notif:email] ${payload.kind} partial: code=${classified.responseCode ?? "-"} category=${classified.outcome}`)
        return { ok: false as const, reason: encodeOutcomeReason(classified), permanent: classified.outcome === "rejected_permanent" }
      }
      return { ok: true as const }
    } catch (err) {
      const errLike = toSmtpErrorLike(err)
      const [classified] = classifySmtpOutcome([to], { error: errLike })
      await recordDeliveryOutcomes(recordCtx, [classified])
      // Code, category and kind only — never the recipient or the raw server reply (#598).
      console.error(`[notif:email] ${payload.kind} failed: code=${errLike.code ?? classified.responseCode ?? "-"} category=${classified.outcome}`)
      return { ok: false as const, reason: encodeOutcomeReason(classified), permanent: classified.outcome === "rejected_permanent" }
    }
  },
}

/** Structural view of whatever `sendMail` rejected with — an Error with Nodemailer's extra fields. */
function toSmtpErrorLike(err: unknown): SmtpErrorLike {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>
    return {
      code: typeof e.code === "string" ? e.code : undefined,
      response: typeof e.response === "string" ? e.response : undefined,
      responseCode: typeof e.responseCode === "number" ? e.responseCode : undefined,
      recipient: typeof e.recipient === "string" ? e.recipient : undefined,
      rejected: Array.isArray(e.rejected) ? (e.rejected as string[]) : undefined,
      rejectedErrors: Array.isArray(e.rejectedErrors) ? (e.rejectedErrors as SmtpErrorLike[]) : undefined,
      message: err instanceof Error ? err.message : undefined,
    }
  }
  return { message: String(err) }
}
