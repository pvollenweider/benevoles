import { describe, it, expect, vi } from "vitest"

// Avoids env.ts's real parseEnv() (which exits the process if DATABASE_URL/AUTH_SECRET aren't
// set in the test environment) — same workaround as other tests that transitively touch env.ts.
vi.mock("../env", () => ({ env: { AUTH_SECRET: "test-secret-at-least-32-characters-long" } }))

import { unsubscribeToken, verifyUnsubscribeToken } from "../product-updates"

describe("unsubscribeToken / verifyUnsubscribeToken", () => {
  it("is deterministic for the same admin id", () => {
    expect(unsubscribeToken("admin-1")).toBe(unsubscribeToken("admin-1"))
  })

  it("differs between admins", () => {
    expect(unsubscribeToken("admin-1")).not.toBe(unsubscribeToken("admin-2"))
  })

  it("verifies a token generated for the same admin id", () => {
    const token = unsubscribeToken("admin-1")
    expect(verifyUnsubscribeToken("admin-1", token)).toBe(true)
  })

  it("rejects a token generated for a different admin id", () => {
    const token = unsubscribeToken("admin-1")
    expect(verifyUnsubscribeToken("admin-2", token)).toBe(false)
  })

  it("rejects a tampered token", () => {
    expect(verifyUnsubscribeToken("admin-1", "not-the-right-token")).toBe(false)
  })
})
