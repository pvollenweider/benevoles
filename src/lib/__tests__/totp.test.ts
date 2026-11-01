import { describe, it, expect } from "vitest"
import { base32Decode, base32Encode, formatTotpSecret, generateTotpSecret, hotp, matchTotpStep, normalizeTotpCode, otpauthUri, timeStep, totp } from "../totp"

// Pentest F6: the super admin's second factor. The vectors come from the RFCs themselves, so the
// implementation is checked against values it didn't produce.
const RFC_SECRET_SHA1 = Buffer.from("12345678901234567890", "ascii")
const RFC_SECRET_SHA256 = Buffer.from("12345678901234567890123456789012", "ascii")
const RFC_SECRET_SHA512 = Buffer.from("1234567890123456789012345678901234567890123456789012345678901234", "ascii")

describe("base32 (RFC 4648 section 10)", () => {
  it.each([["", ""], ["f", "MY"], ["fo", "MZXQ"], ["foo", "MZXW6"], ["foob", "MZXW6YQ"], ["fooba", "MZXW6YTB"], ["foobar", "MZXW6YTBOI"]])("encodes %j as %s", (text, encoded) => {
    expect(base32Encode(Buffer.from(text))).toBe(encoded)
    expect(base32Decode(encoded).toString()).toBe(text)
  })

  it("reads lower case, spaces, dashes and padding, and refuses other characters", () => {
    expect(base32Decode("mzxw 6ytb-oi======").toString()).toBe("foobar")
    expect(() => base32Decode("MZXW1")).toThrow()
  })

  it("makes 160-bit secrets of 32 characters that round-trip", () => {
    const secret = generateTotpSecret()
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(base32Decode(secret)).toHaveLength(20)
    expect(generateTotpSecret()).not.toBe(secret)
  })
})

describe("HOTP (RFC 4226 appendix D)", () => {
  it("gives the published 6-digit codes for counters 0 to 9", () => {
    const expected = ["755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489"]
    expect(expected.map((_, counter) => hotp(RFC_SECRET_SHA1, counter))).toEqual(expected)
  })
})

describe("TOTP (RFC 6238 appendix B)", () => {
  const vectors: [number, string, string, string][] = [
    [59, "94287082", "46119246", "90693936"],
    [1111111109, "07081804", "68084774", "25091201"],
    [1111111111, "14050471", "67062674", "99943326"],
    [1234567890, "89005924", "91819424", "93441116"],
    [2000000000, "69279037", "90698825", "38618901"],
    [20000000000, "65353130", "77737706", "47863826"],
  ]
  it.each(vectors)("at %i s gives the published 8-digit codes for SHA-1, SHA-256 and SHA-512", (seconds, sha1, sha256, sha512) => {
    const ms = seconds * 1000
    expect(totp(RFC_SECRET_SHA1, ms, { digits: 8 })).toBe(sha1)
    expect(totp(RFC_SECRET_SHA256, ms, { digits: 8, algorithm: "sha256" })).toBe(sha256)
    expect(totp(RFC_SECRET_SHA512, ms, { digits: 8, algorithm: "sha512" })).toBe(sha512)
  })

  it("uses 30-second steps from the epoch, and the app's 6 digits by default (the last 6 of the 8-digit value)", () => {
    expect(timeStep(59_000)).toBe(1)
    expect(timeStep(60_000)).toBe(2)
    expect(totp(RFC_SECRET_SHA1, 59_000)).toBe("287082")
  })
})

describe("matchTotpStep", () => {
  const secret = RFC_SECRET_SHA1
  const now = 1_111_111_111_000
  const step = timeStep(now)
  const at = (s: number) => hotp(secret, s)

  it("accepts the current code and one step on either side, and says which step matched", () => {
    expect(matchTotpStep(secret, at(step), now, null)).toBe(step)
    expect(matchTotpStep(secret, at(step - 1), now, null)).toBe(step - 1)
    expect(matchTotpStep(secret, at(step + 1), now, null)).toBe(step + 1)
  })

  it("refuses codes two steps away, wrong codes and anything that isn't six digits", () => {
    expect(matchTotpStep(secret, at(step - 2), now, null)).toBeNull()
    expect(matchTotpStep(secret, at(step + 2), now, null)).toBeNull()
    const wrong = String((Number(at(step)) + 1) % 1_000_000).padStart(6, "0")
    expect(matchTotpStep(secret, wrong, now, null)).toBeNull()
    expect(matchTotpStep(secret, "12345", now, null)).toBeNull()
    expect(matchTotpStep(secret, "abcdef", now, null)).toBeNull()
  })

  it("never accepts a step already used, or an older one (replay protection)", () => {
    expect(matchTotpStep(secret, at(step), now, step)).toBeNull()
    expect(matchTotpStep(secret, at(step - 1), now, step - 1)).toBeNull()
    expect(matchTotpStep(secret, at(step - 1), now, step)).toBeNull()
    expect(matchTotpStep(secret, at(step + 1), now, step)).toBe(step + 1)
  })

  it("reads a code typed with a space or a dash in the middle", () => {
    const code = at(step)
    expect(matchTotpStep(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now, null)).toBe(step)
    expect(normalizeTotpCode("123-456")).toBe("123456")
    expect(normalizeTotpCode("1234567")).toBeNull()
  })
})

describe("enrolment display", () => {
  it("groups the secret by four and builds the otpauth address authenticator apps read", () => {
    expect(formatTotpSecret("JBSWY3DPEHPK3PXP")).toBe("JBSW Y3DP EHPK 3PXP")
    const raw = otpauthUri("JBSWY3DPEHPK3PXP", "admin@example.org", "Benevol")
    expect(raw.startsWith("otpauth://totp/Benevol:admin%40example.org?")).toBe(true)
    const uri = new URL(raw)
    expect(Object.fromEntries(uri.searchParams)).toEqual({ secret: "JBSWY3DPEHPK3PXP", issuer: "Benevol", algorithm: "SHA1", digits: "6", period: "30" })
  })
})
