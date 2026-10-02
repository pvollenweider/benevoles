import { describe, it, expect } from "vitest"
import { memoryStore } from "../rate-limit"
import { recordTokenMiss, tokenLookupsBlocked, tokenUseAllowed, TOKEN_MISS_LIMIT, TOKEN_USE_LIMITS } from "../token-rate-limit"

const req = (ip: string) => new Request("http://localhost/api/public/registrations/x", { headers: { "x-forwarded-for": ip } })

describe("personal-link rate limits (#609)", () => {
  it("blocks an IP only after its failed lookups are used up", async () => {
    const store = memoryStore()
    for (let i = 0; i < TOKEN_MISS_LIMIT; i++) {
      expect(await tokenLookupsBlocked(req("1.1.1.1"), store)).toBe(false)
      await recordTokenMiss(req("1.1.1.1"), store)
    }
    expect(await tokenLookupsBlocked(req("1.1.1.1"), store)).toBe(true)
  })

  it("an IP's misses do not block another IP", async () => {
    const store = memoryStore()
    for (let i = 0; i < TOKEN_MISS_LIMIT; i++) await recordTokenMiss(req("1.1.1.1"), store)
    expect(await tokenLookupsBlocked(req("2.2.2.2"), store)).toBe(false)
  })

  it("limits each valid link on its own, per use", async () => {
    const store = memoryStore()
    for (let i = 0; i < TOKEN_USE_LIMITS.withdraw; i++) expect(await tokenUseAllowed("tok-a", "withdraw", store)).toBe(true)
    expect(await tokenUseAllowed("tok-a", "withdraw", store)).toBe(false)
    // Another link, and another use of the same link, are not affected.
    expect(await tokenUseAllowed("tok-b", "withdraw", store)).toBe(true)
    expect(await tokenUseAllowed("tok-a", "read", store)).toBe(true)
  })

  it("keys a link by its hash, never the token itself", async () => {
    const keys: string[] = []
    const base = memoryStore()
    const store = { hit: (k: string, w: number) => { keys.push(k); return base.hit(k, w) }, peek: base.peek }
    await tokenUseAllowed("secret-token-value", "read", store)
    expect(keys).toHaveLength(1)
    expect(keys[0]).not.toContain("secret-token-value")
    expect(keys[0]).toMatch(/^reg-token-read-link:[0-9a-f]{64}$/)
  })

  it("thresholds are the agreed ones", () => {
    expect(TOKEN_MISS_LIMIT).toBe(20)
    expect(TOKEN_USE_LIMITS).toEqual({ read: 60, withdraw: 30, availability: 30 })
  })
})
