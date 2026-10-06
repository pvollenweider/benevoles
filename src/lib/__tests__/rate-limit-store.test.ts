import { describe, it, expect, vi, afterEach } from "vitest"

vi.mock("../report-error", () => ({ reportError: () => () => {} }))

import { decide, isRateLimited, memoryStore, rateLimit, type RateLimitStore } from "../rate-limit"

const HOUR = 60 * 60 * 1000

describe("rateLimit (#322)", () => {
  afterEach(() => vi.useRealTimers())

  it("allows up to the limit, then refuses with the time left", async () => {
    const store = memoryStore()
    for (let i = 1; i <= 3; i++) {
      expect(await rateLimit("1.2.3.4", "r", 3, HOUR, store)).toEqual({ ok: true, remaining: 3 - i, retryAfter: 0 })
    }
    const refused = await rateLimit("1.2.3.4", "r", 3, HOUR, store)
    expect(refused.ok).toBe(false)
    expect(refused.retryAfter).toBe(3600)
  })

  it("counts per route and per key", async () => {
    const store = memoryStore()
    await rateLimit("a", "r1", 1, HOUR, store)
    expect((await rateLimit("a", "r2", 1, HOUR, store)).ok).toBe(true)
    expect((await rateLimit("b", "r1", 1, HOUR, store)).ok).toBe(true)
    expect((await rateLimit("a", "r1", 1, HOUR, store)).ok).toBe(false)
  })

  it("starts a new window once the previous one has expired", async () => {
    vi.useFakeTimers()
    const store = memoryStore()
    await rateLimit("a", "r", 1, 1000, store)
    expect((await rateLimit("a", "r", 1, 1000, store)).ok).toBe(false)
    vi.advanceTimersByTime(1001)
    expect(await rateLimit("a", "r", 1, 1000, store)).toEqual({ ok: true, remaining: 0, retryAfter: 0 })
  })

  it("isRateLimited reads without counting", async () => {
    const store = memoryStore()
    expect(await isRateLimited("a", "r", 1, store)).toBe(false)
    expect(await isRateLimited("a", "r", 1, store)).toBe(false)
    await rateLimit("a", "r", 1, HOUR, store)
    expect(await isRateLimited("a", "r", 1, store)).toBe(true)
  })

  it("allows the request when the store fails, rather than taking the app down", async () => {
    const broken: RateLimitStore = {
      hit: () => Promise.reject(new Error("db down")),
      peek: () => Promise.reject(new Error("db down")),
    }
    expect((await rateLimit("a", "r", 1, HOUR, broken)).ok).toBe(true)
    expect(await isRateLimited("a", "r", 1, broken)).toBe(false)
  })

  // #646: the anonymous video feedback keeps its per-IP counters in memory only, for the life of
  // the process — expired windows must not pile up.
  it("the memory store's sweep of expired windows never drops a running one", async () => {
    vi.useFakeTimers()
    const store = memoryStore(2)
    await rateLimit("a", "r", 1, 1000, store)
    await rateLimit("b", "r", 1, 1000, store)
    await rateLimit("c", "r", 1, 1000, store)
    vi.advanceTimersByTime(1001)
    await rateLimit("d", "r", 1, 1000, store)
    expect(await store.peek("r:a")).toBeNull()
    // A window still running is never swept.
    await rateLimit("e", "r", 1, HOUR, store)
    await rateLimit("f", "r", 1, HOUR, store)
    await rateLimit("g", "r", 1, HOUR, store)
    expect((await rateLimit("e", "r", 1, HOUR, store)).ok).toBe(false)
  })

  it("never tells a refused client to retry after 0 seconds", () => {
    expect(decide({ count: 5, msLeft: 200 }, 3).retryAfter).toBe(1)
    expect(decide({ count: 5, msLeft: 1500 }, 3).retryAfter).toBe(2)
  })
})
