// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

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

type Deps = { fetch?: typeof fetch; env?: Record<string, string | undefined> }

/** The push, best effort: never throws, reports a failure once. */
export async function sendNtfy(alert: OperatorAlert, deps: Deps = {}): Promise<boolean> {
  const config = ntfyConfig(deps.env)
  if (!config) return false
  const { url, init } = ntfyRequest(alert, config)
  try {
    const res = await (deps.fetch ?? fetch)(url, { ...init, signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`ntfy answered ${res.status}`)
    return true
  } catch (e) {
    reportError("operator_alert.ntfy")(e)
    return false
  }
}

/**
 * Push + email to the active super admins. The email goes through the outbox (sending limits and
 * all), queued with the alert's key so a repeat is stored once; delivered right after the request
 * when there is one, else by the next outbox run.
 */
export async function notifyOperator(alert: OperatorAlert, deps: Deps = {}): Promise<void> {
  await sendNtfy(alert, deps)
  try {
    const admins = await prisma.adminUser.findMany({ where: { role: "super_admin", isActive: true }, select: { email: true } })
    const ids = await enqueueNotifications(
      admins.map((a) => ({
        kind: "operator_alert" as const,
        recipient: { email: a.email },
        dedupeKey: `operator_alert:${alert.key}:${a.email}`,
        data: { title: alert.title, message: alert.message, url: alert.url ?? null },
      })),
    )
    try { deliverAfterResponse(ids) } catch { /* outside a request: the next outbox run sends it */ }
  } catch (e) {
    reportError("operator_alert.email")(e)
  }
}
