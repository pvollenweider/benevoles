import { describe, it, expect } from "vitest"
import { blockApplies, ipKey, ipLabel, signupKeys, validateBlock, IP_DEFAULT_DAYS } from "../signup-blocklist"

const secret = "test-secret-value"
const now = new Date("2026-10-09T12:00:00Z")

describe("sign-up block list (#810, part 5)", () => {
  it("normalises an address and a domain, each with its reason, without expiry", () => {
    expect(validateBlock({ kind: "email", value: " Spam@Example.ORG ", reason: "Spam" }, secret, now)).toEqual({ ok: true, block: { kind: "email", value: "spam@example.org", label: "spam@example.org", reason: "Spam", expiresAt: null } })
    expect(validateBlock({ kind: "domain", value: "@Evil.Example", reason: "Spam" }, secret, now)).toMatchObject({ ok: true, block: { value: "evil.example", expiresAt: null } })
  })

  it("asks to confirm a common mail provider, then accepts it", () => {
    expect(validateBlock({ kind: "domain", value: "gmail.com", reason: "Vague" }, secret, now)).toMatchObject({ ok: false, field: "value", needsConfirmation: true })
    expect(validateBlock({ kind: "domain", value: "gmail.com", reason: "Vague", confirmCommonProvider: true }, secret, now).ok).toBe(true)
  })

  it("stores an IP only as a keyed hash, shows its end, and always sets an expiry", () => {
    const r = validateBlock({ kind: "ip", value: "203.0.113.77", reason: "Rafale" }, secret, now)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.block.value).toBe(ipKey("203.0.113.77", secret))
    expect(r.block.value).not.toContain("203.0.113")
    expect(r.block.label).toBe("IP …3.77")
    expect(ipLabel("203.0.113.77")).toBe("IP …3.77")
    expect(r.block.expiresAt?.getTime()).toBe(now.getTime() + IP_DEFAULT_DAYS * 24 * 3600 * 1000)
    expect(validateBlock({ kind: "ip", value: "203.0.113.77", reason: "x y", days: 0 }, secret, now)).toMatchObject({ ok: false, field: "days" })
    expect(validateBlock({ kind: "ip", value: "203.0.113.77", reason: "x y", days: 91 }, secret, now)).toMatchObject({ ok: false, field: "days" })
    expect(validateBlock({ kind: "ip", value: "2001:db8::1", reason: "IPv6" }, secret, now).ok).toBe(true)
  })

  it("refuses an unknown kind, a malformed value and a missing reason", () => {
    expect(validateBlock({ kind: "phone", value: "x", reason: "abc" }, secret, now)).toMatchObject({ ok: false, field: "kind" })
    expect(validateBlock({ kind: "email", value: "nope", reason: "abc" }, secret, now)).toMatchObject({ ok: false, field: "value" })
    expect(validateBlock({ kind: "ip", value: "999.1.1.1", reason: "abc" }, secret, now)).toMatchObject({ ok: false, field: "value" })
    expect(validateBlock({ kind: "email", value: "a@b.ch", reason: "  " }, secret, now)).toMatchObject({ ok: false, field: "reason" })
  })

  it("checks a sign-up against its address, its domain and its IP key; an expired entry no longer blocks", () => {
    expect(signupKeys("Camille@Example.org", "203.0.113.77", secret)).toEqual([
      { kind: "email", value: "camille@example.org" },
      { kind: "domain", value: "example.org" },
      { kind: "ip", value: ipKey("203.0.113.77", secret) },
    ])
    expect(signupKeys("camille@example.org", null, secret)).toHaveLength(2)
    expect(blockApplies({ expiresAt: null }, now)).toBe(true)
    expect(blockApplies({ expiresAt: new Date(now.getTime() + 1000) }, now)).toBe(true)
    expect(blockApplies({ expiresAt: new Date(now.getTime() - 1000) }, now)).toBe(false)
  })
})
