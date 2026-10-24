import { describe, it, expect, vi } from "vitest"

vi.mock("../report-error", () => ({ reportError: () => () => {} }))

import { activationAllowed, activationTokenDigest, ACTIVATION_MAX_PER_IP, ACTIVATION_MAX_PER_TOKEN } from "../activation-budget"
import { memoryStore, type RateLimitStore } from "../rate-limit"
import { hashToken } from "../token-hash"

/** A memory store that records every key it is asked about. */
function recordingStore() {
  const inner = memoryStore()
  const keys: string[] = []
  const store: RateLimitStore = {
    hit: (key, ms) => { keys.push(key); return inner.hit(key, ms) },
    peek: (key) => { keys.push(key); return inner.peek(key) },
    release: (key) => { keys.push(key); return inner.release!(key) },
  }
  return { store, keys }
}

describe("activation budget of an invitation link", () => {
  it("lets a normal activation through", async () => {
    expect(await activationAllowed("1.1.1.1", "link-a", memoryStore())).toBe(true)
  })

  it("refuses attempts on one link past its budget, from any address", async () => {
    const store = memoryStore()
    for (let i = 0; i < ACTIVATION_MAX_PER_TOKEN; i++) {
      expect(await activationAllowed(`10.0.0.${i}`, "link-a", store)).toBe(true)
    }
    expect(await activationAllowed("10.0.1.1", "link-a", store)).toBe(false)
    // Another link is unaffected.
    expect(await activationAllowed("10.0.1.1", "link-b", store)).toBe(true)
  })

  it("refuses an address past its budget, but never another address (no global block)", async () => {
    const store = memoryStore()
    for (let i = 0; i < ACTIVATION_MAX_PER_IP; i++) {
      expect(await activationAllowed("6.6.6.6", `guess-${i}`, store)).toBe(true)
    }
    expect(await activationAllowed("6.6.6.6", "guess-x", store)).toBe(false)
    expect(await activationAllowed("7.7.7.7", "real-link", store)).toBe(true)
  })

  it("parallel attempts can't all pass: exactly the budget gets through", async () => {
    const store = memoryStore()
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => activationAllowed(`20.0.0.${i}`, "link-c", store)))
    expect(results.filter(Boolean)).toHaveLength(ACTIVATION_MAX_PER_TOKEN)
  })

  it("refused attempts don't eat the budget of the other key", async () => {
    const store = memoryStore()
    for (let i = 0; i < ACTIVATION_MAX_PER_TOKEN; i++) await activationAllowed(`30.0.0.${i}`, "link-d", store)
    // 30.0.9.9 is refused on link-d many times: its own address budget stays whole.
    for (let i = 0; i < 30; i++) expect(await activationAllowed("30.0.9.9", "link-d", store)).toBe(false)
    for (let i = 0; i < ACTIVATION_MAX_PER_IP; i++) {
      expect(await activationAllowed("30.0.9.9", `other-${i}`, store)).toBe(true)
    }
  })

  it("never puts the token, nor the hash stored on the account, in a limiter key", async () => {
    const { store, keys } = recordingStore()
    const token = "Zx8-secret-invite-token"
    await activationAllowed("1.2.3.4", token, store)
    expect(keys.length).toBeGreaterThan(0)
    for (const key of keys) {
      expect(key).not.toContain(token)
      expect(key).not.toContain(hashToken(token))
      expect(key).not.toContain(hashToken(token).slice(0, 32))
    }
    expect(keys).toContain(`accept-invite-token:${activationTokenDigest(token)}`)
  })

  it("lets the request through if the store fails, like every other limit", async () => {
    const broken: RateLimitStore = {
      hit: async () => { throw new Error("db down") },
      peek: async () => { throw new Error("db down") },
    }
    expect(await activationAllowed("1.2.3.4", "link-e", broken)).toBe(true)
  })
})
