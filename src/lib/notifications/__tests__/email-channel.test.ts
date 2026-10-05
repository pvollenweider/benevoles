import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Regression (review of 2.0.0): without SMTP_HOST the channel logged the recipient and the full
// body, personal links included, and reported a success, so the outbox marked the email as sent.

const m = vi.hoisted(() => ({ deliveryOutcomeCreate: vi.fn().mockResolvedValue({ id: "do-1" }) }))
vi.mock("../../prisma", () => ({
  prisma: {
    organization: { findUnique: vi.fn().mockResolvedValue(null) },
    deliveryOutcome: { create: m.deliveryOutcomeCreate },
  },
}))
// env.ts validates the whole environment on import and exits when it is incomplete (as in CI).
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "a".repeat(32) } }))

import { emailChannel, missingSmtpOutcome } from "../channels/email"
import type { NotificationPayload } from "../types"

const deliveryOutcomeCreate = m.deliveryOutcomeCreate

const payload = {
  kind: "registration_link_resend",
  organizationId: null,
  recipient: { email: "alice@example.org", name: "Alice" },
  data: { volunteerName: "Alice Martin", eventTitle: "Fête", orgSlug: "org", editToken: "secret-token-value" },
} as unknown as NotificationPayload

describe("missingSmtpOutcome", () => {
  it("fails in production with a reason free of personal data", () => {
    const outcome = missingSmtpOutcome("production")
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.reason).toBe("SMTP_HOST manquant : email non envoyé.")
  })
  it("keeps the console fallback in development and tests", () => {
    expect(missingSmtpOutcome("development")).toEqual({ ok: true })
    expect(missingSmtpOutcome("test")).toEqual({ ok: true })
    expect(missingSmtpOutcome(undefined)).toEqual({ ok: true })
  })
})

describe("emailChannel without SMTP_HOST", () => {
  const saved = { host: process.env.SMTP_HOST, env: process.env.NODE_ENV }
  let log: ReturnType<typeof vi.spyOn>
  let error: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    delete process.env.SMTP_HOST
    log = vi.spyOn(console, "log").mockImplementation(() => {})
    error = vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    process.env.SMTP_HOST = saved.host
    vi.stubEnv("NODE_ENV", saved.env ?? "test")
    vi.unstubAllEnvs()
    log.mockRestore()
    error.mockRestore()
  })

  it("in production: fails, and logs neither the recipient nor the body", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const outcome = await emailChannel.send(payload)
    expect(outcome.ok).toBe(false)
    const logged = JSON.stringify([...log.mock.calls, ...error.mock.calls])
    expect(logged).not.toContain("alice@example.org")
    expect(logged).not.toContain("secret-token-value")
    expect(log).not.toHaveBeenCalled()
  })

  it("in development: prints the email to the console and succeeds", async () => {
    vi.stubEnv("NODE_ENV", "development")
    const outcome = await emailChannel.send(payload)
    expect(outcome.ok).toBe(true)
    expect(log).toHaveBeenCalled()
  })
})

// #598: per-recipient SMTP outcome, recorded and classified without ever persisting or logging
// the address, the raw server reply or a token.
describe("emailChannel with SMTP_HOST: records the outcome, never a raw reply or the address", () => {
  const RAW_REPLY = "550 5.1.1 The email account that you tried to reach (alice@example.org) does not exist"
  const saved = { host: process.env.SMTP_HOST }
  let error: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // The plain top-level `import { emailChannel } from "../channels/email"` already cached the
    // module (with the real nodemailer) before any test ran: reset first, so each test's dynamic
    // re-import below picks up its own `vi.doMock("nodemailer", …)` instead of that stale module.
    vi.resetModules()
    process.env.SMTP_HOST = "smtp.example.org"
    deliveryOutcomeCreate.mockClear()
    error = vi.spyOn(console, "error").mockImplementation(() => {})
  })
  afterEach(() => {
    process.env.SMTP_HOST = saved.host
    error.mockRestore()
    vi.doUnmock("nodemailer")
    vi.resetModules()
  })

  it("permanent rejection (EENVELOPE, 550, 5.1.1): permanent: true, no PII anywhere", async () => {
    vi.doMock("nodemailer", () => ({
      default: {
        createTransport: () => ({
          sendMail: vi.fn().mockRejectedValue(Object.assign(new Error("rejected"), {
            code: "EENVELOPE",
            responseCode: 550,
            response: RAW_REPLY,
            recipient: "alice@example.org",
          })),
        }),
      },
    }))
    const { emailChannel: freshChannel } = await import("../channels/email")
    const outcome = await freshChannel.send(payload)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) {
      expect(outcome.permanent).toBe(true)
      expect(outcome.reason).not.toContain("alice@example.org")
      expect(outcome.reason).not.toContain("does not exist")
      expect(outcome.reason).not.toContain("secret-token-value")
    }
    const logged = JSON.stringify(error.mock.calls)
    expect(logged).not.toContain("alice@example.org")
    expect(logged).not.toContain("does not exist")
    expect(deliveryOutcomeCreate).toHaveBeenCalledOnce()
    const data = JSON.stringify(deliveryOutcomeCreate.mock.calls[0][0].data)
    expect(data).not.toContain("alice@example.org")
    expect(data).not.toContain("does not exist")
    expect(deliveryOutcomeCreate.mock.calls[0][0].data.outcome).toBe("rejected_permanent")
  })

  it("temporary failure (ETIMEDOUT): permanent is not true, so the outbox keeps retrying", async () => {
    vi.doMock("nodemailer", () => ({
      default: {
        createTransport: () => ({
          sendMail: vi.fn().mockRejectedValue(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })),
        }),
      },
    }))
    const { emailChannel: freshChannel } = await import("../channels/email")
    const outcome = await freshChannel.send(payload)
    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.permanent).not.toBe(true)
    expect(deliveryOutcomeCreate.mock.calls[0][0].data.outcome).toBe("failed_temporary")
  })

  it("acceptance: records accepted_by_relay", async () => {
    vi.doMock("nodemailer", () => ({
      default: {
        createTransport: () => ({
          sendMail: vi.fn().mockResolvedValue({ accepted: ["alice@example.org"], rejected: [], response: "250 2.0.0 Ok: queued" }),
        }),
      },
    }))
    const { emailChannel: freshChannel } = await import("../channels/email")
    const outcome = await freshChannel.send(payload)
    expect(outcome.ok).toBe(true)
    expect(deliveryOutcomeCreate.mock.calls[0][0].data.outcome).toBe("accepted_by_relay")
  })

  // #300: the organization's logo at the top of the email, hosted on its own address, with its
  // name as the alternative text; an inactive organization's logo is left out.
  it("adds the organization's logo and its reply-to when the email belongs to an organization", async () => {
    const sendMail = vi.fn().mockResolvedValue({ accepted: ["alice@example.org"], rejected: [], response: "250 2.0.0 Ok: queued" })
    vi.doMock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }))
    const { prisma } = await import("../../prisma")
    const findUnique = prisma.organization.findUnique as unknown as ReturnType<typeof vi.fn>
    const org = { name: "Club du Rhône", slug: "club", active: true, replyToEmail: "contact@club.ch", logo: { hash: "ab".repeat(32), width: 400, height: 100 } }
    findUnique.mockResolvedValueOnce(org)
    const { emailChannel: freshChannel } = await import("../channels/email")
    expect((await freshChannel.send({ ...payload, organizationId: "org-1" })).ok).toBe(true)
    const mail = sendMail.mock.calls[0][0]
    expect(mail.html).toContain(`/api/public/organizations/org-1/logo?v=${"ab".repeat(8)}" alt="Club du Rhône"`)
    expect(mail.text).not.toContain("logo")
    expect(mail.replyTo).toBe("contact@club.ch")

    findUnique.mockResolvedValueOnce({ ...org, active: false })
    await freshChannel.send({ ...payload, organizationId: "org-1" })
    expect(sendMail.mock.calls[1][0].html).not.toContain("<img")
  })
})
