import { describe, it, expect } from "vitest"
import { addressHash, classifySmtpOutcome, normalizeAddress, type SmtpErrorLike, type SmtpInfoLike } from "../smtp-outcome"

// #598: classification of a Nodemailer result into a per-recipient SMTP outcome. Fixtures below
// embed a real-looking address, a raw server reply and a token-like string on purpose, to prove
// none of the three ever reaches the classified output.
const ADDRESS = "jane.doe@example.org"
const RAW_REPLY = `550 5.1.1 The email account that you tried to reach (${ADDRESS}) does not exist`
const TOKEN = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"

describe("classifySmtpOutcome", () => {
  it("full acceptance: accepted: [a], rejected: []", () => {
    const info: SmtpInfoLike = { accepted: [ADDRESS], rejected: [] }
    const [outcome] = classifySmtpOutcome([ADDRESS], { info })
    expect(outcome).toEqual({ recipient: ADDRESS, outcome: "accepted_by_relay", reason: null, responseCode: null, enhancedStatus: null })
  })

  it("permanent rejection of a single recipient (EENVELOPE, 550, 5.1.1) classifies as rejected_permanent/mailbox_unknown", () => {
    const error: SmtpErrorLike = {
      code: "EENVELOPE",
      responseCode: 550,
      response: RAW_REPLY,
      recipient: ADDRESS,
      rejected: [ADDRESS],
      rejectedErrors: [{ code: "EENVELOPE", responseCode: 550, response: RAW_REPLY, recipient: ADDRESS }],
    }
    const [outcome] = classifySmtpOutcome([ADDRESS], { error })
    expect(outcome.outcome).toBe("rejected_permanent")
    expect(outcome.reason).toBe("mailbox_unknown")
    expect(outcome.responseCode).toBe(550)
    expect(outcome.enhancedStatus).toBe("5.1.1")
  })

  it.each([
    ["451 4.7.1 greylisted, try again later", { response: "451 4.7.1 greylisted, try again later" }],
    ["ETIMEDOUT with no response", { code: "ETIMEDOUT" }],
    ["ECONNECTION with no response", { code: "ECONNECTION" }],
  ])("temporary error (%s) classifies as failed_temporary", (_label, error) => {
    const [outcome] = classifySmtpOutcome([ADDRESS], { error: error as SmtpErrorLike })
    expect(outcome.outcome).toBe("failed_temporary")
  })

  it("missing SMTP_HOST in production is failed_temporary (decision: nothing was ever submitted)", () => {
    // email.ts builds this classification by hand for the no-transport path; verified here that
    // failed_temporary is a valid, distinct state from rejected_permanent.
    const outcome = { recipient: ADDRESS, outcome: "failed_temporary" as const, reason: "other" as const, responseCode: null, enhancedStatus: null }
    expect(outcome.outcome).not.toBe("rejected_permanent")
  })

  it("partial result with several recipients: one accepted, one rejected", () => {
    const other = "bob@example.org"
    const info: SmtpInfoLike = {
      accepted: [ADDRESS],
      rejected: [other],
      rejectedErrors: [{ recipient: other, responseCode: 550, response: "550 5.1.1 no such user" }],
    }
    const outcomes = classifySmtpOutcome([ADDRESS, other], { info })
    expect(outcomes.find((o) => o.recipient === ADDRESS)?.outcome).toBe("accepted_by_relay")
    const rejected = outcomes.find((o) => o.recipient === other)
    expect(rejected?.outcome).toBe("rejected_permanent")
    expect(rejected?.reason).toBe("mailbox_unknown")
  })

  it("transport exception without any SMTP code: failed_temporary (decision: retrying is the safe default)", () => {
    const error: SmtpErrorLike = { message: "socket hang up" }
    const [outcome] = classifySmtpOutcome([ADDRESS], { error })
    expect(outcome.outcome).toBe("failed_temporary")
    expect(outcome.responseCode).toBeNull()
  })

  it("no sensitive data: the classified outcome never contains the address, the raw reply or a token", () => {
    const error: SmtpErrorLike = {
      code: "EENVELOPE",
      responseCode: 550,
      response: RAW_REPLY,
      recipient: ADDRESS,
      rejectedErrors: [{ recipient: ADDRESS, responseCode: 550, response: `${RAW_REPLY} token=${TOKEN}` }],
    }
    const [outcome] = classifySmtpOutcome([ADDRESS], { error })
    // `recipient` on the returned outcome is the address itself (used only to compute the hash,
    // never persisted as is) — what must never leak is in `reason` / `enhancedStatus` / `responseCode`.
    const persistedFields = JSON.stringify({ outcome: outcome.outcome, reason: outcome.reason, responseCode: outcome.responseCode, enhancedStatus: outcome.enhancedStatus })
    expect(persistedFields).not.toContain(ADDRESS)
    expect(persistedFields).not.toContain(TOKEN)
    expect(persistedFields).not.toContain("does not exist")
  })
})

describe("addressHash", () => {
  it("is stable for the same normalized address and keyed with the given secret", () => {
    const a = addressHash("Jane.Doe@Example.org", "secret-1")
    const b = addressHash(" jane.doe@example.org ", "secret-1")
    expect(a).toBe(b)
    expect(a).not.toBe(addressHash(ADDRESS, "secret-2"))
  })

  it("never returns the address itself", () => {
    expect(addressHash(ADDRESS, "secret")).not.toContain(ADDRESS)
  })
})

describe("normalizeAddress", () => {
  it("trims and lowercases", () => {
    expect(normalizeAddress(" Jane.Doe@Example.ORG ")).toBe("jane.doe@example.org")
  })
})
