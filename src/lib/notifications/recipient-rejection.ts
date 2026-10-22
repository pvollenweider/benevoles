// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Is an SMTP refusal about the recipient's address itself (a mailbox or a domain that doesn't
 * exist)? Pure, no import at all: safe for any module to use.
 *
 * Such a refusal is a data problem (a member typed a wrong address), not an application error:
 * the outbox still marks the row failed, the delivery outcome is still recorded and the organiser
 * still sees the failure as before, but it is no longer reported to Sentry, where it was only noise.
 * Everything else (authentication, policy 5.7.x, 4xx, connection errors, unknown formats) stays
 * reported: when in doubt, the answer is false.
 *
 * Accepted (RFC 3463 / RFC 7505 destination address statuses, with a 5xx reply):
 *   5.1.1 bad destination mailbox, 5.1.2 bad destination system (domain), 5.1.3 bad destination
 *   mailbox syntax, 5.1.4 ambiguous destination mailbox, 5.1.6 destination mailbox has moved,
 *   5.1.10 recipient domain has a null MX.
 * 5.1.0 (« other address status ») is generic: it counts only with an unambiguous phrasing too.
 * Not accepted: 5.1.7 and 5.1.8 are about the *sender's* address (our own configuration, worth
 * an alert), 5.1.5 and 5.1.9 are not refusals of a bad address, any other 5.1.x is unknown.
 * A 5xx reply without an enhanced status counts only with an unambiguous phrasing
 * (« user unknown », « no such user », « domain not found »…); a generic « mailbox unavailable »
 * or « recipient address rejected » alone does not, providers use it for policy blocks too.
 *
 * Only a reply to RCPT TO is about the recipient: Nodemailer sets `command: "RCPT TO"` on each
 * refused recipient and on the « all recipients were rejected » error. A reply to MAIL FROM (our
 * sender address), AUTH, DATA, or with no command at all is never accepted, and neither is a
 * reply that mentions the sender, relaying, a policy, spam, a block, authentication, a refusal of
 * access or an unavailable service, whatever its code.
 */

/** Only what this module reads from a Nodemailer error (or one of its `rejectedErrors`). */
export type SmtpReplyLike = {
  command?: string
  responseCode?: number | null
  response?: string | null
  recipient?: string
  rejectedErrors?: SmtpReplyLike[]
}

const ENHANCED_STATUS_RE = /\b([245])\.(\d{1,3})\.(\d{1,3})\b/
const LEADING_CODE_RE = /^\s*(\d{3})\b/

/** Destination address statuses (X.1.<detail>) that mean "this address doesn't exist". */
const RECIPIENT_ADDRESS_DETAILS = new Set([1, 2, 3, 4, 6, 10])
/** X.1.0, « other address status »: only with one of the phrasings below. */
const GENERIC_ADDRESS_DETAIL = 0

/** Provider phrasings of a nonexistent mailbox or domain, for 5.1.0 or a 5xx without enhanced status. */
const RECIPIENT_PHRASES = [
  /\buser unknown\b/i,
  /\bunknown user\b/i,
  /\bno such (user|recipient|mailbox|domain)\b/i,
  /\b(user|recipient|mailbox) not found\b/i,
  /\brecipientnotfound\b/i,
  /\bdomain[ _]not[ _]found\b/i,
  /\bhost or domain name not found\b/i,
  /\b(account|mailbox|user|address|recipient) (that you tried to reach )?does not exist\b/i,
  /\binvalid recipient\b/i,
  /\bdoes(n't| not) have an? [\w.-]+ account\b/i,
]

/** Words of a refusal that may be about us (sender, relay, policy, auth), not the address. */
const NOT_ABOUT_THE_ADDRESS = /\b(sender|relay(ing)?|denied|refused|access|policy|spam|block(ed|list)?|blacklist(ed)?|auth\w*|rate|reputation|unavailable|verif(y|ication)|temporar(y|ily)|later|quota)\b/i

function replyCode(reply: SmtpReplyLike): number | null {
  if (typeof reply.responseCode === "number") return reply.responseCode
  const m = reply.response ? LEADING_CODE_RE.exec(reply.response) : null
  return m ? Number(m[1]) : null
}

/** One server reply: a permanent refusal of a nonexistent recipient address? */
export function isRecipientAddressReply(reply: SmtpReplyLike | null | undefined): boolean {
  if (!reply) return false
  if (!/^RCPT\b/i.test(reply.command?.trim() ?? "")) return false
  const code = replyCode(reply)
  if (code === null || code < 500 || code > 599) return false
  const response = reply.response ?? ""
  if (NOT_ABOUT_THE_ADDRESS.test(response)) return false
  const enhanced = ENHANCED_STATUS_RE.exec(response)
  if (enhanced) {
    const [, klass, subject, detail] = enhanced
    if (klass !== "5" || subject !== "1") return false
    if (RECIPIENT_ADDRESS_DETAILS.has(Number(detail))) return true
    if (Number(detail) !== GENERIC_ADDRESS_DETAIL) return false
  }
  return RECIPIENT_PHRASES.some((re) => re.test(response))
}

/**
 * The refusal of one recipient of a failed send: its own entry in `rejectedErrors` when there is
 * one (Nodemailer, every recipient refused), else the top-level error.
 */
export function isRecipientAddressRejection(error: SmtpReplyLike | null | undefined, recipient: string): boolean {
  if (!error) return false
  const own = error.rejectedErrors?.find((e) => e.recipient === recipient)
  return isRecipientAddressReply(own ?? error)
}
