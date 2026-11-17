// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"
import { SIGNUP_ADDRESS_LIMIT, SIGNUP_COMMENT_MAX, SIGNUP_PHONE_MAX, tooLongSignupField } from "../signup-limits"
import { signupAddressLimitKey } from "../signup-address-limit"

// Bounded free text of the public sign-up (#1047).
describe("tooLongSignupField", () => {
  it("accepts values up to the limits, and missing or non-text ones", () => {
    expect(tooLongSignupField({ phone: "1".repeat(SIGNUP_PHONE_MAX), comment: "x".repeat(SIGNUP_COMMENT_MAX) })).toBeNull()
    expect(tooLongSignupField({})).toBeNull()
    expect(tooLongSignupField({ phone: 12, comment: null })).toBeNull()
  })

  it("names the field one character over its limit, phone first", () => {
    expect(tooLongSignupField({ phone: "1".repeat(SIGNUP_PHONE_MAX + 1) })).toMatchObject({ field: "phone" })
    expect(tooLongSignupField({ comment: "x".repeat(SIGNUP_COMMENT_MAX + 1) })?.message).toContain("commentaire")
    expect(tooLongSignupField({ phone: "1".repeat(99), comment: "x".repeat(9999) })?.field).toBe("phone")
  })
})

// The hourly limit of an address on an event that confirms by email (#1253) counts per connection.
describe("signupAddressLimitKey", () => {
  it("is the same for the same event, address and connection", () => {
    expect(signupAddressLimitKey("evt1", "a@example.org", "203.0.113.7")).toBe(signupAddressLimitKey("evt1", "a@example.org", "203.0.113.7"))
  })

  it("differs by connection, address and event", () => {
    const base = signupAddressLimitKey("evt1", "a@example.org", "203.0.113.7")
    expect(signupAddressLimitKey("evt1", "a@example.org", "203.0.113.8")).not.toBe(base)
    expect(signupAddressLimitKey("evt1", "b@example.org", "203.0.113.7")).not.toBe(base)
    expect(signupAddressLimitKey("evt2", "a@example.org", "203.0.113.7")).not.toBe(base)
  })

  it("cannot be confused by moving a character between the parts", () => {
    expect(signupAddressLimitKey("evt1", "a@example.org:1", "2")).not.toBe(signupAddressLimitKey("evt1", "a@example.org", "1:2"))
  })

  it("holds neither the address nor the connection in clear", () => {
    const key = signupAddressLimitKey("evt1", "a@example.org", "203.0.113.7")
    expect(key).toMatch(/^[0-9a-f]{32}$/)
    expect(key).not.toContain("example")
    expect(key).not.toContain("203")
  })

  it("allows five requests an hour", () => {
    expect(SIGNUP_ADDRESS_LIMIT).toEqual({ max: 5, windowMs: 3_600_000 })
  })
})

// The public page loads signup-limits.ts in the browser: an import of Node's crypto there (directly
// or through token-hash) puts a substitute in the browser bundle that evaluates strings, which the
// script policy refuses. The key, which hashes, lives in the server-only signup-address-limit.ts.
describe("signup-limits stays loadable in the browser", () => {
  it("imports neither Node's crypto nor a module that does", () => {
    const source = readFileSync(path.join(__dirname, "..", "signup-limits.ts"), "utf8")
    const imports = [...source.matchAll(/^import .* from "([^"]+)"/gm)].map((m) => m[1])
    expect(imports.filter((i) => /crypto|token-hash|signup-address-limit|^node:/.test(i))).toEqual([])
  })
})
