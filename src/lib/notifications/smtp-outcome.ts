// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHmac } from "crypto"

/**
 * Pure classification of a Nodemailer send result into a per-recipient SMTP outcome (#598). No
 * Prisma import (shared-lib rule: this module must stay safe for anything that happens to import
 * it). States only what is proven:
 *   - `accepted_by_relay`: the server accepted the message for this recipient. Never "delivered",
 *     still less "read": a submission relay (Gandi Mail here) normally accepts any external
 *     recipient at RCPT TO and only learns later, by a bounce (DSN), that the mailbox doesn't
 *     exist (#602 territory).
 *   - `rejected_permanent`: a 5xx at RCPT/MAIL/DATA, or an enhanced status in the 5.x.x class.
 *   - `failed_temporary`: a 4xx, a connection/timeout/auth error, or — explicit decision — a
 *     transport exception with no SMTP code at all (retrying is the safe default), and a missing
 *     SMTP_HOST in production (nothing was ever submitted).
 *   - `unknown`: a shape this classifier doesn't recognize.
 *
 * Verified against the installed Nodemailer 10.0.10's own shipped types (nodemailer resolves its
 * own `dist/cjs/**\/*.d.ts`; `@types/nodemailer` 8.0.2 in devDependencies is for older nodemailer
 * releases and isn't the one TypeScript picks up here — the package has no "types" field so
 * resolution falls back to the sibling .d.ts of "main", not the @types package):
 *   - success: `info.accepted: string[]`, `info.rejected: string[]`,
 *     `info.rejectedErrors?: NodemailerError[]` (only when some recipients were rejected),
 *     `info.response` (final server reply after DATA).
 *   - failure: `sendMail` rejects with a `NodemailerError`: `code`, `command`, `response`,
 *     `responseCode`, `recipient`, and — when every recipient was refused — `rejected` /
 *     `rejectedErrors` alongside the top-level error.
 */

export type SmtpOutcome = "accepted_by_relay" | "rejected_permanent" | "failed_temporary" | "unknown"

export type SmtpReason =
  | "mailbox_unknown"
  | "mailbox_disabled"
  | "mailbox_full"
  | "domain_not_found"
  | "policy_rejected"
  | "relay_error"
  | "timeout"
  | "other"

export type RecipientOutcome = {
  recipient: string
  outcome: SmtpOutcome
  reason: SmtpReason | null
  responseCode: number | null
  enhancedStatus: string | null
}

/** Structural subset of Nodemailer's `NodemailerError` this module reads from. Duck-typed on
 * purpose: tests build plain fixtures instead of real Error instances. */
export type SmtpErrorLike = {
  code?: string
  response?: string
  responseCode?: number
  recipient?: string
  rejected?: string[]
  rejectedErrors?: SmtpErrorLike[]
  message?: string
}

/** Structural subset of `SMTPSentMessageInfo` this module reads from. */
export type SmtpInfoLike = {
  accepted?: (string | { address: string })[]
  rejected?: (string | { address: string })[]
  rejectedErrors?: SmtpErrorLike[]
  response?: string
}

const ENHANCED_STATUS_RE = /\b([245])\.(\d{1,3})\.(\d{1,3})\b/
const LEADING_CODE_RE = /^\s*(\d{3})\b/

/** "5.1.1" from a server reply, or null when none is present — never the full reply. */
function enhancedStatusOf(response: string | undefined): string | null {
  if (!response) return null
  const m = ENHANCED_STATUS_RE.exec(response)
  return m ? `${m[1]}.${m[2]}.${m[3]}` : null
}

/** The 3-digit reply code, from `responseCode` or, failing that, the leading digits of `response`. */
function numericCodeOf(responseCode: number | undefined, response: string | undefined): number | null {
  if (typeof responseCode === "number") return responseCode
  const m = response ? LEADING_CODE_RE.exec(response) : null
  return m ? Number(m[1]) : null
}

const REASON_BY_ENHANCED: Record<string, SmtpReason> = {
  "1.1": "mailbox_unknown",
  "1.10": "mailbox_unknown",
  "1.2": "domain_not_found",
  "4.4": "domain_not_found",
  "2.1": "mailbox_disabled",
  "2.2": "mailbox_full",
}

const TIMEOUT_CODES = new Set(["ETIMEDOUT"])
const TRANSPORT_CODES = new Set(["ECONNECTION", "ESOCKET", "EDNS", "ETLS", "EPROTOCOL", "EAUTH", "ENOAUTH", "EOAUTH2", "EPROXY"])

function reasonFor(enhanced: string | null, isPermanent: boolean, code: string | undefined): SmtpReason {
  if (enhanced) {
    const subjectDetail = enhanced.slice(2) // "5.1.1" -> "1.1"
    const known = REASON_BY_ENHANCED[subjectDetail]
    if (known) return known
    if (subjectDetail.startsWith("7.")) return "policy_rejected"
  }
  if (!isPermanent && code && TIMEOUT_CODES.has(code)) return "timeout"
  return isPermanent ? "relay_error" : "other"
}

/** One recipient's outcome from its own error details (or none, when accepted). */
function classifyRecipient(recipient: string, error: SmtpErrorLike | undefined): RecipientOutcome {
  if (!error) return { recipient, outcome: "accepted_by_relay", reason: null, responseCode: null, enhancedStatus: null }

  const enhancedStatus = enhancedStatusOf(error.response)
  const responseCode = numericCodeOf(error.responseCode, error.response)

  if (responseCode !== null && responseCode >= 500 && responseCode < 600) {
    return { recipient, outcome: "rejected_permanent", reason: reasonFor(enhancedStatus, true, error.code), responseCode, enhancedStatus }
  }
  if (responseCode !== null && responseCode >= 400 && responseCode < 500) {
    return { recipient, outcome: "failed_temporary", reason: reasonFor(enhancedStatus, false, error.code), responseCode, enhancedStatus }
  }
  if (enhancedStatus?.startsWith("5.")) {
    return { recipient, outcome: "rejected_permanent", reason: reasonFor(enhancedStatus, true, error.code), responseCode, enhancedStatus }
  }
  if (enhancedStatus?.startsWith("4.")) {
    return { recipient, outcome: "failed_temporary", reason: reasonFor(enhancedStatus, false, error.code), responseCode, enhancedStatus }
  }
  // No SMTP code at all: a transport exception (connection, timeout, auth…). Decision: treat as
  // failed_temporary — retrying is the safe default — rather than giving up on a guess.
  if (error.code && TIMEOUT_CODES.has(error.code)) {
    return { recipient, outcome: "failed_temporary", reason: "timeout", responseCode, enhancedStatus }
  }
  if (error.code && TRANSPORT_CODES.has(error.code)) {
    return { recipient, outcome: "failed_temporary", reason: "relay_error", responseCode, enhancedStatus }
  }
  if (error.code || error.message) {
    return { recipient, outcome: "failed_temporary", reason: "other", responseCode, enhancedStatus }
  }
  return { recipient, outcome: "unknown", reason: null, responseCode, enhancedStatus }
}

function addressOf(entry: string | { address: string }): string {
  return typeof entry === "string" ? entry : entry.address
}

/**
 * Classifies every expected recipient of one send. `expectedRecipients` is the list the message
 * was addressed to (today always one address; the classifier handles several so a future
 * multi-recipient message is covered without changes here, see acceptance criteria).
 *
 * - On success, `info` carries `accepted` / `rejected` / `rejectedErrors` (partial rejection is
 *   possible with several recipients even though `sendMail` resolved).
 * - On failure, `error` is the thrown `NodemailerError`; when every recipient was refused it
 *   carries `rejected` / `rejectedErrors` itself, otherwise the top-level error applies to every
 *   expected recipient (a connection never reached the server at all).
 */
export function classifySmtpOutcome(
  expectedRecipients: string[],
  result: { info?: SmtpInfoLike; error?: SmtpErrorLike },
): RecipientOutcome[] {
  const byRecipient = new Map<string, RecipientOutcome>()

  const rejectedErrors = result.info?.rejectedErrors ?? result.error?.rejectedErrors ?? []
  for (const err of rejectedErrors) {
    const recipient = err.recipient ?? ""
    if (recipient) byRecipient.set(recipient, classifyRecipient(recipient, err))
  }
  for (const entry of result.info?.accepted ?? []) {
    const recipient = addressOf(entry)
    if (!byRecipient.has(recipient)) byRecipient.set(recipient, classifyRecipient(recipient, undefined))
  }
  // Rejected without a per-recipient error (shouldn't happen, but stay defensive): fall back to
  // the top-level error so it isn't silently dropped.
  for (const entry of result.info?.rejected ?? result.error?.rejected ?? []) {
    const recipient = addressOf(entry)
    if (!byRecipient.has(recipient)) byRecipient.set(recipient, classifyRecipient(recipient, result.error ?? { message: "rejected" }))
  }

  // Every expected recipient not accounted for above: a total failure (e.g. a connection that
  // never reached RCPT TO for anyone) classified from the top-level error.
  for (const recipient of expectedRecipients) {
    if (!byRecipient.has(recipient)) byRecipient.set(recipient, classifyRecipient(recipient, result.error))
  }

  return expectedRecipients.map((r) => byRecipient.get(r) ?? classifyRecipient(r, result.error))
}

/** `[reason]` (never "délivré") in the vocabulary used by the stored row, the logs and Sentry. */
export const OUTCOME_LABELS: Record<SmtpOutcome, string> = {
  accepted_by_relay: "accepted_by_relay",
  rejected_permanent: "rejected_permanent",
  failed_temporary: "failed_temporary",
  unknown: "unknown",
}

/** Lowercased, trimmed: the same normalization the stored hash and the lookup both use. */
export function normalizeAddress(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * HMAC-SHA256 of the normalized address, keyed with AUTH_SECRET — the codebase's existing
 * keyed-hash pattern (src/lib/product-updates.ts's unsubscribe token) reused here instead of a
 * new secret: an email address is low-entropy (guessable), unlike the random tokens that
 * src/lib/token-hash.ts hashes unsalted, so a plain SHA-256 would be reversible by dictionary.
 */
export function addressHash(email: string, secret: string): string {
  return createHmac("sha256", secret).update(normalizeAddress(email)).digest("hex")
}
