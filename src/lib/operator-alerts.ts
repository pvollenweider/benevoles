// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { reportError } from "@/lib/report-error"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"

/**
 * Alerts to the operator (#810): an ntfy push **and** an email to every active super admin. Step
 * 0 of #810 showed iOS may hold a notification for minutes, hence the email; the push is the early
 * warning, never the guarantee.
 *
 * - No personal data in an alert: a title, a short sentence and a link to the super admin space.
 * - One alert per occurrence: the caller passes a `key` (the email's dedupe key); the same key
 *   enqueues one email only. Callers alert once per window or event, never per item.
 * - A failure never cascades: an ntfy error is reported to Sentry once and stops there; it never
 *   triggers another alert.
 * - Without `NTFY_URL` only the email goes (self-hosted instances, tests).
 * - The email goes to `OPERATOR_ALERT_EMAIL` when set (a super admin's login address need not be a
 *   real mailbox), else to every active super admin.
 */

export type OperatorAlert = {
  /** Deduplication key: one email per key. */
  key: string
  title: string
  message: string
  /** ntfy priority: 4 for what needs action (new request, abuse), 3 for the rest (step 0 of #810). */
  priority?: 3 | 4
  /** Absolute link to open, in the super admin space. */
  url?: string
}

export type NtfyConfig = { url: string; token: string | null }

/** `NTFY_URL` (https only: the topic name is the secret) and the optional `NTFY_TOKEN`. */
export function ntfyConfig(env: Record<string, string | undefined> = process.env): NtfyConfig | null {
  const raw = env.NTFY_URL?.trim()
  if (!raw) return null
  let parsed: URL
  try { parsed = new URL(raw) } catch { return null }
  if (parsed.protocol !== "https:") return null
  return { url: parsed.toString(), token: env.NTFY_TOKEN?.trim() || null }
}

/** The ntfy request for an alert: headers carry the title, priority and click link. */
export function ntfyRequest(alert: OperatorAlert, config: NtfyConfig): { url: string; init: RequestInit } {
  const headers: Record<string, string> = {
    Title: alert.title,
    Priority: String(alert.priority ?? 3),
    Tags: (alert.priority ?? 3) >= 4 ? "warning" : "bell",
  }
  if (alert.url) headers.Click = alert.url
  if (config.token) headers.Authorization = `Bearer ${config.token}`
  return { url: config.url, init: { method: "POST", headers, body: alert.message } }
}

type Deps = { fetch?: typeof fetch; env?: Record<string, string | undefined>; sleep?: (ms: number) => Promise<void> }

/**
 * Waits before each new attempt of the push. A single attempt lost a sign-up alert in production
 * (#810): ntfy.sh did not answer the connection for 10 seconds, then answered in half a second.
 */
export const NTFY_RETRY_DELAYS_MS = [2_000, 10_000]

/** A refusal that a new attempt will not change (bad topic, access): no retry. */
function retryable(status: number): boolean {
  return status === 429 || status >= 500
}

/** The push, best effort: a few attempts, never throws, reports a final failure once. */
export async function sendNtfy(alert: OperatorAlert, deps: Deps = {}): Promise<boolean> {
  const config = ntfyConfig(deps.env)
  if (!config) return false
  const { url, init } = ntfyRequest(alert, config)
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  let failure: unknown = null
  for (let attempt = 0; attempt <= NTFY_RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(NTFY_RETRY_DELAYS_MS[attempt - 1])
    try {
      const res = await (deps.fetch ?? fetch)(url, { ...init, signal: AbortSignal.timeout(5000) })
      if (res.ok) return true
      failure = new Error(`ntfy answered ${res.status}`)
      if (!retryable(res.status)) break
    } catch (e) {
      failure = e
    }
  }
  reportError("operator_alert.ntfy")(failure)
  return false
}

/**
 * Push + email to the active super admins, side by side: the push's retries never hold the email
 * back. The email goes through the outbox (sending limits and all), queued with the alert's key so
 * a repeat is stored once; delivered right after the request when there is one, else by the next
 * outbox run.
 */
export async function notifyOperator(alert: OperatorAlert, deps: Deps = {}): Promise<void> {
  await Promise.all([sendNtfy(alert, deps), emailOperator(alert, deps.env ?? process.env)])
}

/**
 * The addresses of the alert email: the dedicated one, else the active super admins. An invalid
 * dedicated address is reported (Sentry) and ignored, so the alert still reaches someone.
 */
export async function operatorAlertRecipients(env: Record<string, string | undefined> = process.env): Promise<string[]> {
  const dedicated = env.OPERATOR_ALERT_EMAIL?.trim().toLowerCase()
  if (dedicated) {
    if (z.email().safeParse(dedicated).success) return [dedicated]
    reportError("operator_alert.invalid_address")(new Error("OPERATOR_ALERT_EMAIL is not an email address: alerts go to the super admins"))
  }
  const admins = await prisma.adminUser.findMany({ where: { role: "super_admin", isActive: true }, select: { email: true } })
  return admins.map((a) => a.email)
}

async function emailOperator(alert: OperatorAlert, env: Record<string, string | undefined>): Promise<void> {
  try {
    const recipients = await operatorAlertRecipients(env)
    const ids = await enqueueNotifications(
      recipients.map((email) => ({
        kind: "operator_alert" as const,
        recipient: { email },
        dedupeKey: `operator_alert:${alert.key}:${email}`,
        data: { title: alert.title, message: alert.message, url: alert.url ?? null },
      })),
    )
    try { deliverAfterResponse(ids) } catch { /* outside a request: the next outbox run sends it */ }
  } catch (e) {
    reportError("operator_alert.email")(e)
  }
}
