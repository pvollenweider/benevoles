// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { simpleParser } from "mailparser"

/**
 * Pure RFC 3464 delivery status notification (DSN) parsing for deferred bounces (#602). No
 * Prisma, no network, no mailbox: the caller feeds the raw message and gets only the fields the
 * correlation needs. The raw content is never stored or logged.
 *
 * Gandi's Postfix accepts the message from the app, then reports the remote server's refusal in a
 * `multipart/report; report-type=delivery-status` message sent to the envelope sender. The
 * original `Message-ID` (`<outbox-<id>@host>`, see outboxMessageId) comes from the attached
 * `message/rfc822` or `text/rfc822-headers` part, never from free text. A message without a
 * delivery-status block or without that attached original header is not a DSN we act on:
 * auto-replies, read receipts and forged messages stay in the inbox.
 */

export type DsnRecipient = {
  /** The `Final-Recipient` address, as announced by the remote server. */
  finalRecipient: string
  /** `failed`, `delayed`, `relayed`, `delivered`… lowercased, or null when absent. */
  action: string | null
  /** Enhanced status code `5.1.1`, or null. */
  status: string | null
  /** The `Diagnostic-Code` field (e.g. `smtp; 550 5.1.1 …`), or null. */
  diagnosticCode: string | null
}

export type ParsedBounce = {
  /** True only for a delivery-status report carrying both a recipient and the original Message-ID. */
  isDsn: boolean
  reportType: string | null
  originalMessageId: string | null
  recipients: DsnRecipient[]
}

const FINAL_RECIPIENT_RE = /^final-recipient\s*:/im
const ENHANCED_STATUS_RE = /\b([245]\.\d{1,3}\.\d{1,3})\b/
const DIAGNOSTIC_CODE_RE = /(?:^|;)\s*(\d{3})\b/

type ContentType = { mediaType: string | null; reportType: string | null }

function parseContentTypeString(raw: string): ContentType {
  const [mediaType, ...params] = raw.split(";")
  const reportParam = params.map((p) => p.trim()).find((p) => /^report-type\s*=/i.test(p))
  const reportType = reportParam ? reportParam.slice(reportParam.indexOf("=") + 1).trim().replace(/^"|"$/g, "").toLowerCase() : null
  return { mediaType: mediaType.trim().toLowerCase() || null, reportType }
}

function contentTypeOf(value: unknown): ContentType {
  if (typeof value === "string") return parseContentTypeString(value)
  if (value && typeof value === "object") {
    const structured = value as { value?: unknown; params?: Record<string, unknown> }
    const mediaType = typeof structured.value === "string" ? structured.value.trim().toLowerCase() || null : null
    const report = structured.params?.["report-type"]
    return { mediaType, reportType: typeof report === "string" ? report.trim().toLowerCase() || null : null }
  }
  return { mediaType: null, reportType: null }
}

/** Parse `Field: value` lines, unfolding continuation lines (delivery-status fields can wrap). */
function fieldMap(block: string): Map<string, string> {
  const fields = new Map<string, string>()
  let current: string | null = null
  for (const line of block.split("\n")) {
    if (/^[ \t]/.test(line) && current) {
      fields.set(current, `${fields.get(current) ?? ""} ${line.trim()}`.trim())
      continue
    }
    const colon = line.indexOf(":")
    if (colon <= 0) {
      current = null
      continue
    }
    current = line.slice(0, colon).trim().toLowerCase()
    fields.set(current, line.slice(colon + 1).trim())
  }
  return fields
}

function enhancedStatusOf(value: string | undefined): string | null {
  if (!value) return null
  const match = ENHANCED_STATUS_RE.exec(value)
  return match ? match[1] : null
}

/** `rfc822; user@example.org` (or `rfc822;user@example.org`, or a `<…>` form) → the address. */
function addressOfFinalRecipient(value: string): string | null {
  const afterType = value.includes(";") ? value.slice(value.indexOf(";") + 1) : value
  const angle = /<([^>]+)>/.exec(afterType)
  const address = (angle?.[1] ?? afterType)
    .trim()
    .replace(/^mailto:/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
  return address.includes("@") ? address : null
}

/**
 * The delivery-status field blocks are the text parts of the message/delivery-status part. The
 * MIME parser folds them into `text` (they are plain text), so scan for blocks that carry a
 * `Final-Recipient` field; the human-readable explanation before them is not a block we keep.
 */
function recipientsOf(text: string | undefined): DsnRecipient[] {
  if (!text) return []
  const recipients: DsnRecipient[] = []
  for (const block of text.replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    if (!FINAL_RECIPIENT_RE.test(block)) continue
    const fields = fieldMap(block)
    const address = addressOfFinalRecipient(fields.get("final-recipient") ?? "")
    if (!address) continue
    recipients.push({
      finalRecipient: address,
      action: fields.get("action")?.trim().toLowerCase() || null,
      status: enhancedStatusOf(fields.get("status")),
      diagnosticCode: fields.get("diagnostic-code")?.trim() || null,
    })
  }
  return recipients
}

/** `Message-ID` from a header-only buffer (attached original message or its headers), before the body. */
export function originalMessageIdFromHeaders(raw: Buffer | string): string | null {
  const text = (Buffer.isBuffer(raw) ? raw.toString("utf8") : raw).replace(/\r\n/g, "\n")
  const headerPart = text.split(/\n\s*\n/)[0] ?? ""
  const unfolded = headerPart.replace(/\n[ \t]+/g, " ")
  for (const line of unfolded.split("\n")) {
    const match = /^message-id\s*:\s*(.+)$/i.exec(line)
    if (!match) continue
    const angle = /<[^>]+>/.exec(match[1])
    return angle ? angle[0] : match[1].trim() || null
  }
  return null
}

function originalMessageIdOf(attachments: { contentType: string; content: Buffer }[]): string | null {
  for (const attachment of attachments) {
    if (attachment.contentType !== "message/rfc822" && attachment.contentType !== "text/rfc822-headers") continue
    const messageId = originalMessageIdFromHeaders(attachment.content)
    if (messageId) return messageId
  }
  return null
}

/** Parse one raw message. Never decides whether it concerns this deployment: see outboxIdFromMessageId. */
export async function parseBounceDsn(raw: Buffer | string): Promise<ParsedBounce> {
  const parsed = await simpleParser(raw)
  const contentType = contentTypeOf(parsed.headers.get("content-type"))
  const recipients = recipientsOf(parsed.text)
  const originalMessageId = originalMessageIdOf(parsed.attachments)

  // A standard report says report-type=delivery-status. A common non-standard bounce is a
  // multipart/mixed message carrying the same delivery-status block and original headers; no
  // report type at all, but the structured recipient and the attached Message-ID are required.
  const reportTypeAccepted = contentType.reportType === null || contentType.reportType === "delivery-status"
  const isDsn =
    reportTypeAccepted &&
    (contentType.mediaType === "multipart/report" || contentType.mediaType === "multipart/mixed") &&
    recipients.length > 0 &&
    originalMessageId !== null

  return { isDsn, reportType: contentType.reportType, originalMessageId, recipients }
}

/**
 * The outbox row id from a Message-ID, only when it is exactly this deployment's format
 * (`<outbox-<id>@<host>>`, host compared case-insensitively). Anything else is not ours.
 */
export function outboxIdFromMessageId(messageId: string | null, host: string): string | null {
  if (!messageId) return null
  const match = /^<outbox-([a-z0-9]+)@([^>]+)>$/i.exec(messageId.trim())
  if (!match) return null
  if (match[2].toLowerCase() !== host.trim().toLowerCase()) return null
  return match[1]
}

/** One recipient is a permanent failure only when the report says `Action: failed` and a 5.x.x status. */
export function isPermanentFailure(recipient: DsnRecipient): boolean {
  if (recipient.action !== "failed") return false
  if (recipient.status) return recipient.status.startsWith("5.")
  const code = responseCodeOfDiagnostic(recipient.diagnosticCode)
  return code !== null && code >= 500 && code < 600
}

/** The 3-digit SMTP reply code of a `Diagnostic-Code` field (`smtp; 550 …`), or null. */
export function responseCodeOfDiagnostic(diagnosticCode: string | null): number | null {
  if (!diagnosticCode) return null
  const match = DIAGNOSTIC_CODE_RE.exec(diagnosticCode)
  return match ? Number(match[1]) : null
}

/** The enhanced status a `Diagnostic-Code` carries when the `Status` field is absent, or null. */
export function enhancedStatusOfDiagnostic(diagnosticCode: string | null): string | null {
  if (!diagnosticCode) return null
  const match = ENHANCED_STATUS_RE.exec(diagnosticCode)
  return match ? match[1] : null
}
