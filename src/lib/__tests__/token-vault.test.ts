import { describe, it, expect, vi, afterEach } from "vitest"
import { randomBytes } from "crypto"
import { decryptToken, encryptToken, encryptionKey, linkToken, registrationToken, revealToken, sealToken } from "../token-vault"
import { hashToken } from "../token-hash"

const KEY_B64 = randomBytes(32).toString("base64")

describe("token vault (#290)", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("without a key: hash for lookups, token kept in the legacy column", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "")
    expect(sealToken("abc")).toEqual({ hash: hashToken("abc"), enc: null, legacy: "abc" })
    expect(revealToken({ enc: null, legacy: "abc" })).toBe("abc")
  })

  it("with a key: never stores the clear token, and reveals it back", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", KEY_B64)
    const s = sealToken("my-token")
    expect(s.legacy).toBeNull()
    expect(s.enc).not.toContain("my-token")
    expect(s.hash).toBe(hashToken("my-token"))
    expect(revealToken({ enc: s.enc, legacy: null })).toBe("my-token")
  })

  it("encrypts with a fresh IV each time", () => {
    const key = randomBytes(32)
    expect(encryptToken("same", key)).not.toBe(encryptToken("same", key))
  })

  it("rejects a tampered ciphertext and a wrong key (GCM authentication)", () => {
    const key = randomBytes(32)
    const enc = encryptToken("tok", key)
    const parts = enc.split(":")
    const tampered = [...parts.slice(0, 3), Buffer.from("xxx").toString("base64")].join(":")
    expect(() => decryptToken(tampered, key)).toThrow()
    expect(() => decryptToken(enc, randomBytes(32))).toThrow()
  })

  it("refuses to reveal an encrypted token when the key is missing, and an empty row", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "")
    expect(() => revealToken({ enc: "v1:a:b:c", legacy: null })).toThrow(/TOKEN_ENCRYPTION_KEY/)
    expect(() => revealToken({ enc: null, legacy: null })).toThrow()
  })

  it("rejects a key that isn't 32 bytes", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.from("short").toString("base64"))
    expect(() => encryptionKey()).toThrow(/32 bytes/)
  })

  it("model adapters map to the right columns", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "")
    expect(registrationToken.data("t")).toEqual({ editTokenHash: hashToken("t"), editTokenEnc: null, editTokenLegacy: "t" })
    expect(registrationToken.where("t")).toEqual({ editTokenHash: hashToken("t") })
    expect(linkToken.data("t")).toEqual({ tokenHash: hashToken("t"), tokenEnc: null, tokenLegacy: "t" })
    expect(linkToken.reveal({ tokenEnc: null, tokenLegacy: "t" })).toBe("t")
  })
})
