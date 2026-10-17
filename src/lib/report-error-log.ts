// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { scrubUrl } from "@/lib/sentry-scrub"

/**
 * The container log line of reportError (#1042). The raw error object went to console.error: its
 * message, stack and own properties (a failed request's URL with its token, an SMTP reply with an
 * address, a Prisma query) all landed in the logs. Only three things are kept: a category from a
 * fixed alphabet, a short code, and the message scrubbed of tokens and email addresses, on one line.
 */

const CONTEXT_RE = /^[a-z0-9_.-]{1,80}$/
const CODE_RE = /^[A-Za-z0-9_]{1,40}$/
const MAX_MESSAGE = 300

/** The context as given when it only uses the category alphabet, `invalid_context` otherwise. */
export function safeErrorContext(context: string): string {
  return CONTEXT_RE.test(context) ? context : "invalid_context"
}

function errorCode(error: unknown): string {
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code
    if (typeof code === "string" && CODE_RE.test(code)) return code
    if (typeof code === "number" && Number.isFinite(code)) return String(code)
    const name = (error as { name?: unknown }).name
    if (typeof name === "string" && CODE_RE.test(name)) return name
  }
  return "unknown"
}

function errorMessage(error: unknown): string {
  const raw =
    typeof error === "string" ? error
    : error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string" ? (error as { message: string }).message
    : ""
  // Scrubbed before being cut, so a token split by the cut cannot slip through; one line.
  const scrubbed = scrubUrl(raw).replace(/[\u0000-\u001f\u007f]+/g, " ").trim()
  return scrubbed.length > MAX_MESSAGE ? `${scrubbed.slice(0, MAX_MESSAGE)}…` : scrubbed
}

/** `[context] code=<code> <message>`: no stack, no other property of the error. */
export function errorLogLine(context: string, error: unknown): string {
  const message = errorMessage(error)
  return `[${safeErrorContext(context)}] code=${errorCode(error)}${message ? ` ${message}` : ""}`
}
