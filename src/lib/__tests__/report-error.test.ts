import { describe, it, expect, vi } from "vitest"

const captureException = vi.hoisted(() => vi.fn())
vi.mock("@sentry/nextjs", () => ({ captureException }))

import { reportError } from "../report-error"
import { errorLogLine, safeErrorContext } from "../report-error-log"

const SECRET = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
const TOKEN_PARAM = `?${new URLSearchParams({ token: SECRET })}`

describe("reportError", () => {
  it("logs one scrubbed line and reports the error to Sentry, tagged with its context, without rethrowing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const err = new Error("smtp down")

    await expect(Promise.reject(err).catch(reportError("waitlist.promote"))).resolves.toBeUndefined()

    expect(consoleError).toHaveBeenCalledWith("[waitlist.promote] code=Error smtp down")
    expect(captureException).toHaveBeenCalledWith(err, { tags: { context: "waitlist.promote" } })
    consoleError.mockRestore()
  })
})

// #1042: the raw error object (message, stack, own properties) no longer reaches the logs.
describe("errorLogLine", () => {
  it("keeps the context, a code and the message scrubbed of tokens and email addresses", () => {
    const err = Object.assign(
      new Error(`fetch https://x.test/api/public/registrations/${SECRET}${TOKEN_PARAM} for jane@example.org`),
      { code: "ECONNRESET", url: `/my/${SECRET}` },
    )
    const line = errorLogLine("outbox.deliver", err)
    expect(line).toBe("[outbox.deliver] code=ECONNRESET fetch https://x.test/api/public/registrations/[token]?token=[token] for [email]")
    expect(line).not.toContain(SECRET)
    expect(line).not.toContain("    at ")
  })

  it("falls back to the error name, then to unknown, for the code", () => {
    expect(errorLogLine("a", new TypeError("x"))).toBe("[a] code=TypeError x")
    expect(errorLogLine("a", Object.assign(new Error("x"), { code: "P2002" }))).toBe("[a] code=P2002 x")
    expect(errorLogLine("a", { code: "has spaces", name: "bad name" })).toBe("[a] code=unknown")
    expect(errorLogLine("a", "plain string")).toBe("[a] code=unknown plain string")
    expect(errorLogLine("a", null)).toBe("[a] code=unknown")
  })

  it("puts the message on one line, scrubbed before it is cut to length", () => {
    expect(errorLogLine("a", new Error("line one\nline two"))).toBe("[a] code=Error line one line two")
    const long = errorLogLine("a", new Error(`${"x".repeat(290)} ${TOKEN_PARAM}`))
    expect(long).not.toContain(SECRET.slice(0, 8))
    expect(long.endsWith("…")).toBe(true)
  })

  it("only lets a context from the category alphabet through, to the log and to the Sentry tag", () => {
    expect(safeErrorContext("email.limit.platform_hour")).toBe("email.limit.platform_hour")
    expect(safeErrorContext("proxy-not-found-blog")).toBe("proxy-not-found-blog")
    expect(safeErrorContext("user jane@example.org")).toBe("invalid_context")
    expect(errorLogLine("Bad Context\n", new Error("x"))).toBe("[invalid_context] code=Error x")
  })
})
