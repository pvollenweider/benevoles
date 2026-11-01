import { describe, it, expect, vi, afterEach } from "vitest"

vi.mock("../report-error", () => ({ reportError: () => () => {} }))

import { decide, FAIL_CLOSED_ROUTES, isRateLimited, memoryStore, rateLimit, releaseHit, reserveHit, STORE_FAILURE_RETRY_AFTER, type RateLimitStore } from "../rate-limit"

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

describe("reserveHit / releaseHit (#1048)", () => {
  it("counts a hit and gives it back, never below zero", async () => {
    const store = memoryStore()
    expect((await reserveHit("k", HOUR, store))?.count).toBe(1)
    expect((await reserveHit("k", HOUR, store))?.count).toBe(2)
    await releaseHit("k", store)
    expect((await store.peek("k"))?.count).toBe(1)
    await releaseHit("k", store)
    await releaseHit("k", store)
    expect((await store.peek("k"))?.count).toBe(0)
  })

  it("returns null and keeps going when the store fails", async () => {
    const broken: RateLimitStore = { hit: () => Promise.reject(new Error("db down")), peek: () => Promise.reject(new Error("db down")), release: () => Promise.reject(new Error("db down")) }
    expect(await reserveHit("k", HOUR, broken)).toBeNull()
    await expect(releaseHit("k", broken)).resolves.toBeUndefined()
  })

  it("does nothing on a store without release", async () => {
    const base = memoryStore()
    const store: RateLimitStore = { hit: base.hit, peek: base.peek }
    await reserveHit("k", HOUR, store)
    await releaseHit("k", store)
    expect((await store.peek("k"))?.count).toBe(1)
  })
})

describe("store failures: open by default, closed for secrets and anonymous sign-ups", () => {
  const broken: RateLimitStore = { hit: () => Promise.reject(new Error("db down")), peek: () => Promise.reject(new Error("db down")), release: () => Promise.reject(new Error("db down")) }

  it.each(["login-ip", "forgot-password", "registrations", "reg-token-miss", "leader-token-read", "accept-invite-token"])("refuses on %s while the store fails", async (route) => {
    expect(await rateLimit("1.2.3.4", route, 5, HOUR, broken)).toEqual({ ok: false, remaining: 0, retryAfter: STORE_FAILURE_RETRY_AFTER })
    expect(await isRateLimited("1.2.3.4", route, 5, broken)).toBe(true)
  })

  it("gives a fail-closed reservation a window over any budget, the route read from the key", async () => {
    expect((await reserveHit("login-ip:1.2.3.4", HOUR, broken))?.count).toBe(Number.MAX_SAFE_INTEGER)
    // An IPv6 address in the key: the route is what comes before the first colon.
    expect((await reserveHit("login-email-ip:ana@example.org|2001:db8::1", HOUR, broken))?.count).toBe(Number.MAX_SAFE_INTEGER)
    expect(await reserveHit("some-quota:org-a", HOUR, broken)).toBeNull()
  })

  it.each(["member-import", "targeted-message", "reg-token-read-link", "push-subscribe", "video-feedback", "swap-proposal"])("still allows %s while the store fails", async (route) => {
    expect((await rateLimit("k", route, 5, HOUR, broken)).ok).toBe(true)
    expect(await isRateLimited("k", route, 5, broken)).toBe(false)
  })

  it("names every limit that guards a password, a recovery, a sign-up or a link lookup", () => {
    for (const route of ["login-ip", "login-email-ip", "login-account", "password-check-account", "password-check-ip", "accept-invite-ip", "accept-invite-token", "accept-invite-check", "forgot-password", "reset-password", "org-reactivation", "org-reactivation-confirm", "signup", "signup-confirm", "registrations", "reg-token-miss", "reg-feed-miss", "avail-token-miss", "member-invite-roster-miss", "leader-token-read", "member-invite-read", "member-invite-decline", "waitlist-confirm", "org-keep", "reg-calendar", "reg-link-request", "reg-link-resend-ip"]) {
      expect(FAIL_CLOSED_ROUTES.has(route), route).toBe(true)
    }
  })

  it("only names routes some call site actually uses", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs")
    const { join, resolve } = await import("node:path")
    const root = resolve(import.meta.dirname, "../..")
    const files: string[] = []
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (!/__tests__|__integration__|generated/.test(f)) walk(p) } else if (p.endsWith(".ts")) files.push(p) } }
    walk(root)
    const source = files.map((f) => readFileSync(f, "utf8")).join("\n")
    for (const route of FAIL_CLOSED_ROUTES) expect(source.includes(`"${route}"`) || source.includes(`${route}:`), route).toBe(true)
  })
})

