import { describe, it, expect } from "vitest"
import { isRecipientAddressRejection, isRecipientAddressReply, type SmtpReplyLike } from "../recipient-rejection"

// Sentry 154728595: a member's address on a domain that doesn't exist (550 5.1.2) was reported as
// an application error. Only refusals of the recipient's address itself stop being reported.

const RCPT = "RCPT TO"

const nodemailerError = (responseCode: number | undefined, response: string | undefined, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error("Can't send mail - all recipients were rejected"), { code: "EENVELOPE", command: "RCPT TO", responseCode, response, ...extra })

describe("isRecipientAddressReply: 5.1.x destination address statuses", () => {
  it.each([
    ["5.1.0 with an unambiguous phrasing", "550 5.1.0 <a@example.org>: User unknown"],
    ["5.1.1", "550 5.1.1 <a@example.org>: Recipient address rejected: User unknown in virtual mailbox table"],
    ["5.1.1 (Gmail, multi-line)", "550-5.1.1 The email account that you tried to reach does not exist. Please try double-checking"],
    ["5.1.2", "550 5.1.2 <a@nowhere.invalid>: Recipient address rejected: domain_not_found"],
    ["5.1.2 (Postfix)", "550 5.1.2 <a@nowhere.invalid>: Recipient address rejected: Domain not found"],
    ["5.1.3", "553 5.1.3 Bad destination mailbox address syntax"],
    ["5.1.4", "550 5.1.4 Destination mailbox address ambiguous"],
    ["5.1.6", "551 5.1.6 Destination mailbox has moved"],
    ["5.1.10 (Outlook)", "550 5.1.10 RESOLVER.ADR.RecipientNotFound; Recipient not found by SMTP address lookup"],
    ["5.1.10 (null MX)", "556 5.1.10 Recipient address has null MX"],
    ["#5.1.0 (Yahoo style)", "554 delivery error: dd This user doesn't have a yahoo.com account (a@yahoo.com) [-5] - mta1 #5.1.0"],
  ])("%s", (_label, response) => {
    expect(isRecipientAddressReply({ command: RCPT, responseCode: Number(response.slice(0, 3)), response })).toBe(true)
  })

  it("reads the code from the reply when responseCode is missing", () => {
    expect(isRecipientAddressReply({ command: RCPT, response: "550 5.1.2 domain_not_found" })).toBe(true)
  })

  it.each([
    "550 User unknown",
    "550 No such user here",
    "550 Requested action not taken: mailbox not found",
    "550 Host or domain name not found. Name service error",
    "550 Recipient address rejected: domain_not_found",
    "550 Invalid recipient",
  ])("a 5xx without enhanced status but an unambiguous phrasing: %s", (response) => {
    expect(isRecipientAddressReply({ command: RCPT, responseCode: 550, response })).toBe(true)
  })
})

describe("isRecipientAddressReply: everything else stays reported", () => {
  it.each([
    ["5.7.1 policy", 550, "550 5.7.1 Message rejected as spam"],
    ["5.7.1 with an unknown-user phrasing (enhanced status wins)", 550, "550 5.7.1 User unknown or relay denied"],
    ["5.7.8 auth", 535, "535 5.7.8 Error: authentication failed"],
    ["535 auth without enhanced status", 535, "535 Authentication credentials invalid"],
    ["421 temporary", 421, "421 4.7.0 Try again later, closing connection"],
    ["450 4.1.1 temporary mailbox", 450, "450 4.1.1 Mailbox temporarily unavailable"],
    ["451 4.1.2 temporary domain", 451, "451 4.1.2 Domain lookup failed, try later"],
    ["5.1.7 bad sender syntax", 553, "553 5.1.7 Bad sender address syntax"],
    ["5.1.8 bad sender domain", 553, "553 5.1.8 Sender address rejected: Domain not found"],
    ["5.1.9 other 5.1.x", 550, "550 5.1.9 Message relayed to non-compliant mailer"],
    ["5.2.2 mailbox full", 552, "552 5.2.2 Mailbox full"],
    ["5.4.4 routing", 550, "550 5.4.4 Unable to route"],
    ["generic mailbox unavailable", 550, "550 Requested action not taken: mailbox unavailable"],
    ["recipient address rejected alone", 554, "554 Recipient address rejected: Access denied"],
    ["4xx with a 5.1.1 status in the text", 450, "450 5.1.1 greylisted"],
    ["unknown user or relay denied (no enhanced status)", 550, "550 User unknown or relay denied"],
    ["unknown user or access refused", 550, "550 User unknown or access refused"],
    ["generic 5.1.0 alone", 550, "550 5.1.0 Address rejected"],
    ["5.1.0 address verification unavailable", 550, "550 5.1.0 Address verification service unavailable"],
    ["5.1.1 recipient verification unavailable", 550, "550 5.1.1 Recipient verification unavailable"],
    ["user unknown, try again later", 550, "550 User unknown, please try again later"],
    ["5.1.1 mentioning relaying", 550, "550 5.1.1 Relaying denied"],
    ["5.1.0 about the sender", 550, "550 5.1.0 Sender address rejected"],
    ["sender domain not found", 550, "550 Sender address rejected: Domain not found"],
    ["5.1.1 with a block list hit", 550, "550 5.1.1 Blocked by blocklist, user unknown"],
  ])("%s", (_label, responseCode, response) => {
    expect(isRecipientAddressReply({ command: RCPT, responseCode, response })).toBe(false)
  })

  // Codex review: a refusal of MAIL FROM, AUTH or DATA is about our side, never the recipient.
  it.each([
    ["MAIL FROM 5.1.0", { command: "MAIL FROM", responseCode: 550, response: "550 5.1.0 Address rejected" }],
    ["MAIL FROM domain not found", { command: "MAIL FROM", responseCode: 550, response: "550 Domain not found" }],
    ["AUTH 535 user unknown", { command: "AUTH PLAIN", responseCode: 535, response: "535 User unknown" }],
    ["DATA 5.1.1", { command: "DATA", responseCode: 550, response: "550 5.1.1 unknown" }],
    ["no command", { responseCode: 550, response: "550 5.1.2 domain_not_found" }],
  ])("only a reply to RCPT TO counts: %s", (_label, reply) => {
    expect(isRecipientAddressReply(reply)).toBe(false)
  })

  it("no code, no reply, nothing", () => {
    expect(isRecipientAddressReply({})).toBe(false)
    expect(isRecipientAddressReply({ command: RCPT, response: "5.1.1 user unknown" })).toBe(false)
    expect(isRecipientAddressReply(null)).toBe(false)
    expect(isRecipientAddressReply(undefined)).toBe(false)
  })
})

describe("isRecipientAddressRejection: Nodemailer error shapes", () => {
  it("top-level EENVELOPE error: responseCode 550 and the reply with its enhanced status", () => {
    expect(isRecipientAddressRejection(nodemailerError(550, "550 5.1.2 <a@nowhere.invalid>: Recipient address rejected: domain_not_found"), "a@nowhere.invalid")).toBe(true)
  })

  it("the recipient's own entry in rejectedErrors takes precedence over the top-level error", () => {
    const own = { recipient: "a@nowhere.invalid", command: RCPT, responseCode: 550, response: "550 5.1.2 domain_not_found" }
    expect(isRecipientAddressRejection(nodemailerError(undefined, undefined, { rejectedErrors: [own] }), "a@nowhere.invalid")).toBe(true)
    const policy = { recipient: "a@x.org", command: RCPT, responseCode: 550, response: "550 5.7.1 blocked" }
    expect(isRecipientAddressRejection(nodemailerError(550, "550 5.1.1 unknown", { rejectedErrors: [policy] }), "a@x.org")).toBe(false)
  })

  it("an entry for another recipient is ignored", () => {
    const other = { recipient: "b@x.org", command: RCPT, responseCode: 550, response: "550 5.1.1 unknown" }
    expect(isRecipientAddressRejection({ rejectedErrors: [other] }, "a@x.org")).toBe(false)
  })

  it.each([
    ["ECONNREFUSED", Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:587"), { code: "ECONNECTION" })],
    ["ETIMEDOUT", Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" })],
    ["EAUTH 535", Object.assign(new Error("Invalid login"), { code: "EAUTH", responseCode: 535, response: "535 5.7.8 Error: authentication failed" })],
    ["EAUTH 535 user unknown", Object.assign(new Error("Invalid login"), { code: "EAUTH", command: "AUTH PLAIN", responseCode: 535, response: "535 User unknown" })],
    ["EENVELOPE on MAIL FROM", Object.assign(new Error("Mail command failed"), { code: "EENVELOPE", command: "MAIL FROM", responseCode: 553, response: "553 5.1.8 Domain of sender address does not exist" })],
    ["missing code", new Error("something odd")],
  ])("transport and auth errors: %s", (_label, error) => {
    expect(isRecipientAddressRejection(error as unknown as SmtpReplyLike, "a@x.org")).toBe(false)
  })

  it("nothing to classify", () => {
    expect(isRecipientAddressRejection(undefined, "a@x.org")).toBe(false)
  })
})
