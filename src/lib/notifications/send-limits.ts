// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from "node:crypto"
import { memoryStore, postgresStore, type RateLimitStore } from "@/lib/rate-limit"
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
 * Only an email that goes is counted (every window is checked first, then counted): an email held
 * and retried every minute never eats into a window again, so a backlog cannot exhaust a daily cap
 * on its own. Emails anyone can trigger from a public page (password reset, registration
 * confirmation, lost link) also have a per-recipient cap, checked first: a flood of requests for
 * one address stops there, without using up the organisation's caps and without blocking the
 * other administrators' password resets.
 *
 * Defaults are generous for real use (a message to a whole roster goes out over a few minutes)
 * and can be changed by environment variables, read at each call so tests and operators can set
 * them without a restart of the logic.
 */

/** What an email counts against, by kind. Platform emails (no organisation) only meet the global rate. */
export type SendCategory = "bulk" | "automatic" | "account"

const BULK: readonly NotificationKind[] = ["targeted_message", "member_invite", "manual_reminder", "open_shifts"]
// Admin invitations come from an authenticated owner or the super admin. A password reset is not
// here: anyone can request one, so it has its per-recipient cap instead of an organisation-wide one
// that a stranger could use up.
const ACCOUNT: readonly NotificationKind[] = ["admin_invite", "admin_welcome"]

/** Kinds anyone can trigger from a public page: capped per recipient address. */
export const PUBLIC_TRIGGERED: readonly NotificationKind[] = ["password_reset", "registration_confirmation", "registration_link_resend"]

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
  /** Emails triggered from a public page (password reset, confirmation, lost link) to one address, per hour. */
  recipientPerHour: 5,
} as const

export type SendLimits = { -readonly [K in keyof typeof DEFAULT_SEND_LIMITS]: number }

const ENV: Record<keyof SendLimits, string> = {
  orgPerMinute: "EMAIL_LIMIT_ORG_PER_MINUTE",
  orgPerDay: "EMAIL_LIMIT_ORG_PER_DAY",
  orgBulkPerDay: "EMAIL_LIMIT_ORG_BULK_PER_DAY",
  orgAccountPerDay: "EMAIL_LIMIT_ORG_ACCOUNT_PER_DAY",
  globalPerMinute: "EMAIL_LIMIT_GLOBAL_PER_MINUTE",
  recipientPerHour: "EMAIL_LIMIT_RECIPIENT_PER_HOUR",
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
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** The address as a key: a hash, never the address itself in the RateLimit table. */
export function recipientKey(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32)
}

type Window = { key: string; windowMs: number; limit: number; name: string }

/**
 * The windows one email counts against: the per-recipient one first (public-triggered kinds), so a
 * flood for one address is stopped before it reaches the organisation's or the platform's.
 */
export function sendWindows(organizationId: string | null | undefined, kind: NotificationKind, limits: SendLimits = sendLimits(), recipientEmail?: string | null): Window[] {
  const windows: Window[] = []
  if (recipientEmail && PUBLIC_TRIGGERED.includes(kind)) {
    windows.push({ key: `email:recipient:${recipientKey(recipientEmail)}:${kind}:hour`, windowMs: HOUR, limit: limits.recipientPerHour, name: "recipient_per_hour" })
  }
  windows.push({ key: "email:global:minute", windowMs: MINUTE, limit: limits.globalPerMinute, name: "global_per_minute" })
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

/**
 * `drop`: over the per-recipient cap, the email is abandoned instead of held. Holding it would
 * queue every request of a flood and trickle them out hour after hour, each new reset link
 * invalidating the previous one: the real request would wait behind them.
 */
export type SendAllowance = { ok: true } | { ok: false; limit: string; retryAfterMs: number; drop?: true }

const defaultStore: RateLimitStore = process.env.NODE_ENV === "test" ? memoryStore() : postgresStore

/**
 * Says whether one email may go, and counts it only if it does: every window is read first; if one
 * is full the email is held (dropped for the per-recipient cap) and nothing is counted, otherwise
 * every window counts it. Two sends at the same instant can overshoot a limit by a few emails,
 * which is acceptable for a safety cap.
 *
 * Store failures never change a decision once it is made. Only when the windows cannot be read
 * at all does the email go (fail open, reported): a limiter must never be the reason no email
 * leaves. A failure to record the alert marker, or to count an email that goes, is reported and
 * changes nothing: a held email stays held, an allowed one goes.
 */
export async function takeSendAllowance(
  organizationId: string | null | undefined,
  kind: NotificationKind,
  opts: { store?: RateLimitStore; limits?: SendLimits; recipientEmail?: string | null; alert?: (limit: string, organizationId: string | null) => void } = {},
): Promise<SendAllowance> {
  const store = opts.store ?? defaultStore
  const alert = opts.alert ?? ((limit, org) => reportError(`email.limit.${limit}`)(new Error(`Email sending limit reached: ${limit}${org ? ` (organisation ${org})` : ""}`)))
  const windows = sendWindows(organizationId, kind, opts.limits, opts.recipientEmail)

  // 1. Decide, from the windows as they are.
  let full: { window: Window; msLeft: number } | null = null
  try {
    for (const w of windows) {
      const state = await store.peek(w.key)
      if (state && state.count >= w.limit) { full = { window: w, msLeft: state.msLeft }; break }
    }
  } catch (e) {
    reportError("email.limit.store")(e)
    return { ok: true }
  }

  // 2a. Held or dropped: one alert per window (the first email over the limit marks it).
  if (full) {
    const retryAfterMs = Math.max(1000, Math.ceil(full.msLeft))
    try {
      const marker = await store.hit(`${full.window.key}:held`, retryAfterMs)
      if (marker.count === 1) alert(full.window.name, organizationId ?? null)
    } catch (e) {
      reportError("email.limit.alert_marker")(e)
    }
    return { ok: false, limit: full.window.name, retryAfterMs, ...(full.window.name === "recipient_per_hour" ? { drop: true as const } : {}) }
  }

  // 2b. Allowed: counted in every window.
  try {
    for (const w of windows) await store.hit(w.key, w.windowMs)
  } catch (e) {
    reportError("email.limit.store")(e)
  }
  return { ok: true }
}
