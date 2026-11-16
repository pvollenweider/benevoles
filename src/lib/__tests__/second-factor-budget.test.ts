import { describe, it, expect, vi } from "vitest"
vi.mock("../prisma", () => ({ prisma: {} }))
vi.mock("../operator-alerts", () => ({ notifyOperator: vi.fn() }))
import { memoryStore, type RateLimitStore } from "../rate-limit"
import { beginSecondFactorAttempt, SECOND_FACTOR_MAX_PER_ACCOUNT, SECOND_FACTOR_MAX_PER_IP } from "../second-factor-server"

// Pentest F6: wrong codes are limited, counted before the check, and the limit never fails open.
describe("beginSecondFactorAttempt", () => {
  it("allows five failures per account in 15 minutes, then refuses the account from any address", async () => {
    const store = memoryStore()
    for (let i = 0; i < SECOND_FACTOR_MAX_PER_ACCOUNT; i++) expect((await beginSecondFactorAttempt("adm-1", `10.0.0.${i}`, store)).allowed).toBe(true)
    expect((await beginSecondFactorAttempt("adm-1", "10.0.0.99", store)).allowed).toBe(false)
    expect((await beginSecondFactorAttempt("adm-2", "10.0.0.99", store)).allowed).toBe(true)
  })

  it("allows twenty failures per address, whatever the accounts", async () => {
    const store = memoryStore()
    for (let i = 0; i < SECOND_FACTOR_MAX_PER_IP; i++) expect((await beginSecondFactorAttempt(`adm-${i}`, "10.0.0.1", store)).allowed).toBe(true)
    expect((await beginSecondFactorAttempt("adm-new", "10.0.0.1", store)).allowed).toBe(false)
  })

  it("gives a successful attempt back: only failures stay counted", async () => {
    const store = memoryStore()
    for (let i = 0; i < 20; i++) {
      const attempt = await beginSecondFactorAttempt("adm-1", "10.0.0.1", store)
      expect(attempt.allowed).toBe(true)
      await attempt.succeeded()
    }
  })

  it("counts parallel attempts before any check, so a burst can't exceed the limit", async () => {
    const store = memoryStore()
    const attempts = await Promise.all(Array.from({ length: 12 }, () => beginSecondFactorAttempt("adm-1", "10.0.0.1", store)))
    expect(attempts.filter((a) => a.allowed)).toHaveLength(SECOND_FACTOR_MAX_PER_ACCOUNT)
  })

  it("refuses when the counter store fails (fail closed, unlike the other limits)", async () => {
    const broken: RateLimitStore = { hit: vi.fn().mockRejectedValue(new Error("db down")), peek: vi.fn(), release: vi.fn() }
    expect((await beginSecondFactorAttempt("adm-1", "10.0.0.1", broken)).allowed).toBe(false)
  })
})
