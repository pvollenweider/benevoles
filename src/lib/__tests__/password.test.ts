import { describe, it, expect } from "vitest"
import { MAX_PASSWORD_BYTES, passwordBytes, passwordErrors, passwordSchema } from "../password"

// Password policy for every place a password is set (change, reset, invitation, super-admin
// profile): the existing rules plus a 72-byte maximum, what bcrypt actually uses (#359).

const valid = "Abcdefgh1!" // 10 chars, one of each class

describe("password rules", () => {
  it("accepts a password meeting every rule", () => {
    expect(passwordErrors(valid)).toEqual([])
    expect(passwordSchema.safeParse(valid).success).toBe(true)
  })

  it("lists each unmet rule in French", () => {
    expect(passwordErrors("abc")).toEqual(expect.arrayContaining(["10 caractères minimum", "Une lettre majuscule", "Un chiffre"]))
  })

  it("accepts exactly 72 bytes and refuses 73 (#359)", () => {
    const at72 = valid + "a".repeat(MAX_PASSWORD_BYTES - valid.length)
    expect(passwordBytes(at72)).toBe(72)
    expect(passwordErrors(at72)).toEqual([])
    const at73 = at72 + "a"
    expect(passwordErrors(at73)).toEqual([expect.stringContaining("72 octets maximum")])
    expect(passwordSchema.safeParse(at73).success).toBe(false)
  })

  it("counts UTF-8 bytes, not characters: accented letters count double", () => {
    expect(passwordBytes("é")).toBe(2)
    const accented = valid + "é".repeat(31) // 10 + 62 = 72 bytes, 41 characters
    expect(passwordBytes(accented)).toBe(72)
    expect(passwordErrors(accented)).toEqual([])
    expect(passwordErrors(accented + "é")).toEqual([expect.stringContaining("72 octets maximum")])
  })

  it("counts an emoji as 4 bytes", () => {
    expect(passwordBytes("🙂")).toBe(4)
  })
})
