// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { decide, memoryStore, postgresStore, type RateLimitStore } from "@/lib/rate-limit"
import { reportError } from "@/lib/report-error"
import type { NotificationKind } from "./types"

/**
 * Sending limits (#810, phase 1): every email, whatever its recipient (a member of the
 * organisation included: importing thousands of « members » must not bypass anything), is
 * counted at the one place every email goes through, `sendNotification`, before SMTP. No feature
 * can send around them.
 *
 * Fixed windows in the shared `RateLimit` table (src/lib/rate-limit.ts), so every replica counts
 * the same emails. A **rate** (per minute) as well as a **daily cap**: 500 emails in one minute is
 * not the same profile as 500 over a day. Over a limit the email is **held**, not failed: the
 * outbox keeps it pending and tries again when the window ends; a direct send reports it to its
 * caller. One alert per window (the first email over the limit), never one per held email.
 *
 * Defaults are generous for real use (a message to a whole roster goes out over a few minutes)
 * and can be changed by environment variables, read at each call so tests and operators can set
 * them without a restart of the logic.
 */

/** What an email counts against, by kind. Platform emails (no organisation) only meet the global rate. */
export type SendCategory = "bulk" | "automatic" | "account"

const BULK: readonly NotificationKind[] = ["targeted_message", "member_invite", "manual_reminder", "open_shifts"]
const ACCOUNT: readonly NotificationKind[] = ["admin_invite", "admin_welcome", "password_reset"]

export function sendCategory(kind: NotificationKind): SendCategory {
  if (BULK.includes(kind)) return "bulk"
  if (ACCOUNT.includes(kind)) return "account"
  return "automatic"
}

export const DEFAULT_SEND_LIMITS = {
  /** Every email of one organisation, per minute. */
  orgPerMinute: 120,
  /** Every email of one organisation, per day. */
  orgPerDay: 5000,
  /** Bulk emails (targeted messages, invitations, open shifts, manual reminders) of one organisation, per day. */
  orgBulkPerDay: 2000,
  /** Account emails (admin invitations, password resets) of one organisation, per day. */
  orgAccountPerDay: 50,
  /** Every email of the platform, per minute: a safety net for the sending domain's reputation. */
  globalPerMinute: 600,
} as const

export type SendLimits = { -readonly [K in keyof typeof DEFAULT_SEND_LIMITS]: number }

const ENV: Record<keyof SendLimits, string> = {
  orgPerMinute: "EMAIL_LIMIT_ORG_PER_MINUTE",
  orgPerDay: "EMAIL_LIMIT_ORG_PER_DAY",
  orgBulkPerDay: "EMAIL_LIMIT_ORG_BULK_PER_DAY",
  orgAccountPerDay: "EMAIL_LIMIT_ORG_ACCOUNT_PER_DAY",
  globalPerMinute: "EMAIL_LIMIT_GLOBAL_PER_MINUTE",
}

/** The limits in force: each default replaced by its variable when that is a positive integer. */
export function sendLimits(env: Record<string, string | undefined> = process.env): SendLimits {
  const out = { ...DEFAULT_SEND_LIMITS } as SendLimits
  for (const key of Object.keys(ENV) as (keyof SendLimits)[]) {
    const n = Number(env[ENV[key]])
    if (Number.isInteger(n) && n > 0) out[key] = n
  }
  return out
}

const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

type Window = { key: string; windowMs: number; limit: number; name: string }

/** The windows one email counts against, global first. */
export function sendWindows(organizationId: string | null | undefined, kind: NotificationKind, limits: SendLimits = sendLimits()): Window[] {
  const windows: Window[] = [{ key: "email:global:minute", windowMs: MINUTE, limit: limits.globalPerMinute, name: "global_per_minute" }]
  if (!organizationId) return windows
  windows.push(
    { key: `email:org:${organizationId}:minute`, windowMs: MINUTE, limit: limits.orgPerMinute, name: "org_per_minute" },
    { key: `email:org:${organizationId}:day`, windowMs: DAY, limit: limits.orgPerDay, name: "org_per_day" },
  )
  const category = sendCategory(kind)
  if (category === "bulk") windows.push({ key: `email:org:${organizationId}:bulk:day`, windowMs: DAY, limit: limits.orgBulkPerDay, name: "org_bulk_per_day" })
  if (category === "account") windows.push({ key: `email:org:${organizationId}:account:day`, windowMs: DAY, limit: limits.orgAccountPerDay, name: "org_account_per_day" })
  return windows
}

export type SendAllowance = { ok: true } | { ok: false; limit: string; retryAfterMs: number }

const defaultStore: RateLimitStore = process.env.NODE_ENV === "test" ? memoryStore() : postgresStore

/**
 * Counts one email against each of its windows and says whether it may go. Every window is
 * counted even after one is exceeded, so a held email still uses its share of the others. Over a
 * limit, the first email of the window raises one alert. If the store fails, the email goes and
 * the error is reported: a limiter must never be the reason no email leaves.
 */
export async function takeSendAllowance(
  organizationId: string | null | undefined,
  kind: NotificationKind,
  opts: { store?: RateLimitStore; limits?: SendLimits; alert?: (limit: string, organizationId: string | null) => void } = {},
): Promise<SendAllowance> {
  const store = opts.store ?? defaultStore
  const alert = opts.alert ?? ((limit, org) => reportError(`email.limit.${limit}`)(new Error(`Email sending limit reached: ${limit}${org ? ` (organisation ${org})` : ""}`)))
  let blocked: { limit: string; retryAfterMs: number } | null = null
  try {
    for (const w of sendWindows(organizationId, kind, opts.limits)) {
      const state = await store.hit(w.key, w.windowMs)
      const verdict = decide(state, w.limit)
      if (verdict.ok) continue
      // Only the first email over the limit alerts: the rest of the window stays quiet.
      if (state.count === w.limit + 1) alert(w.name, organizationId ?? null)
      const retryAfterMs = Math.max(1000, Math.ceil(state.msLeft))
      if (!blocked || retryAfterMs > blocked.retryAfterMs) blocked = { limit: w.name, retryAfterMs }
    }
  } catch (e) {
    reportError("email.limit.store")(e)
    return { ok: true }
  }
  return blocked ? { ok: false, ...blocked } : { ok: true }
}
