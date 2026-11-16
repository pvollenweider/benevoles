import { describe, it, expect } from "vitest"
import { generateRecoveryCode, generateRecoveryCodes, hashRecoveryCode, normalizeRecoveryCode, RECOVERY_CODE_COUNT } from "../recovery-codes"

// Pentest F6: one-time recovery codes of the super admin's second factor.
describe("recovery codes", () => {
  it("are 16 characters (80 bits) in four groups, without look-alike letters, ten distinct ones per set", () => {
    for (let i = 0; i < 50; i++) expect(generateRecoveryCode()).toMatch(/^[0-9a-hjkmnp-tv-z]{4}(-[0-9a-hjkmnp-tv-z]{4}){3}$/)
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(RECOVERY_CODE_COUNT)
    expect(new Set(codes).size).toBe(RECOVERY_CODE_COUNT)
  })

  it("read what was typed whatever the case, spaces or dashes, and refuse what can't be a code", () => {
    expect(normalizeRecoveryCode("ABCD-efgh\u00a0jkmn pqrs")).toBe("abcdefghjkmnpqrs")
    expect(normalizeRecoveryCode("abcd-efgh-jkmn")).toBeNull()
    expect(normalizeRecoveryCode("abcd-efgh-jkmn-pqru")).toBeNull()
    expect(normalizeRecoveryCode("")).toBeNull()
  })

  it("read an o as 0 and an i or l as 1, as a code copied by hand may be typed", () => {
    expect(normalizeRecoveryCode("oo11-ilab-cdef-ghjk")).toBe("001111abcdefghjk")
  })

  it("are stored as a SHA-256 that doesn't contain the code, the same for every way of typing it", () => {
    const code = generateRecoveryCode()
    const hash = hashRecoveryCode(normalizeRecoveryCode(code)!)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(code.replace(/-/g, ""))
    expect(hashRecoveryCode(normalizeRecoveryCode(code.toUpperCase().replace(/-/g, " "))!)).toBe(hash)
  })
})
