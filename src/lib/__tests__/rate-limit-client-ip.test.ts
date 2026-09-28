import { describe, it, expect, afterEach, vi } from "vitest"
import { getClientIp } from "../rate-limit"

const req = (headers: Record<string, string>) => new Request("http://localhost/x", { headers })

describe("getClientIp (#289)", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("takes the entry added by our proxy (rightmost), not a client-supplied one", () => {
    // Client sent "1.2.3.4" itself; Traefik appended the address it actually saw.
    expect(getClientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" }))).toBe("203.0.113.7")
  })

  it("a spoofed header can't pick a different bucket per request", () => {
    const a = getClientIp(req({ "x-forwarded-for": "10.0.0.1, 203.0.113.7" }))
    const b = getClientIp(req({ "x-forwarded-for": "10.0.0.2, 203.0.113.7" }))
    expect(a).toBe(b)
  })

  it("single entry (proxy replaced the header) is used as is", () => {
    expect(getClientIp(req({ "x-forwarded-for": " 203.0.113.7 " }))).toBe("203.0.113.7")
  })

  it("honors TRUSTED_PROXY_HOPS when another proxy appends in front of ours", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2")
    expect(getClientIp(req({ "x-forwarded-for": "1.2.3.4, 198.51.100.9, 10.42.0.1" }))).toBe("198.51.100.9")
  })

  it("never goes past the leftmost entry, and ignores invalid hop counts", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "5")
    expect(getClientIp(req({ "x-forwarded-for": "198.51.100.9, 10.42.0.1" }))).toBe("198.51.100.9")
    vi.stubEnv("TRUSTED_PROXY_HOPS", "abc")
    expect(getClientIp(req({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" }))).toBe("203.0.113.7")
  })

  it("falls back to X-Real-IP, then 'unknown'", () => {
    expect(getClientIp(req({ "x-real-ip": "203.0.113.8" }))).toBe("203.0.113.8")
    expect(getClientIp(req({}))).toBe("unknown")
  })
})
