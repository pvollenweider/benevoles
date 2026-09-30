import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Regression (review of 2.0.0): without SMTP_HOST the channel logged the recipient and the full
// body, personal links included, and reported a success, so the outbox marked the email as sent.

vi.mock("../../prisma", () => ({ prisma: { organization: { findUnique: vi.fn().mockResolvedValue(null) } } }))

import { emailChannel, missingSmtpOutcome } from "../channels/email"
import type { NotificationPayload } from "../types"

const payload = {
  kind: "registration_link_resend",
  organizationId: null,
  recipient: { email: "alice@example.org", name: "Alice" },
  data: { firstName: "Alice", organizationName: "Org", links: [{ eventTitle: "Fête", url: "https://org.benevol.app/my/secret-token-value" }] },
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
