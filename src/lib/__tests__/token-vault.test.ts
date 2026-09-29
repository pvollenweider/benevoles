import { describe, it, expect, vi, afterEach } from "vitest"
import { randomBytes } from "crypto"
import { decryptToken, decryptValue, encryptToken, encryptValue, encryptionKey, keyring, linkToken, needsReencryption, registrationToken, revealToken, sealToken } from "../token-vault"
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

describe("key rotation (#313)", () => {
  afterEach(() => vi.unstubAllEnvs())
  const k1 = randomBytes(32)
  const k2 = randomBytes(32)

  it("encrypts with the current key id (v2) and reads values of previous keys", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", k2.toString("base64"))
    vi.stubEnv("TOKEN_ENCRYPTION_KEY_ID", "k2")
    vi.stubEnv("TOKEN_ENCRYPTION_PREVIOUS_KEYS", `k1:${k1.toString("base64")}`)
    const ring = keyring()
    const fresh = encryptValue("t", ring)!
    expect(fresh.startsWith("v2:k2:")).toBe(true)
    expect(decryptValue(fresh, ring)).toBe("t")
    expect(decryptValue(encryptToken("old", k1, "k1"), ring)).toBe("old")
    expect(decryptValue(encryptToken("v1", k1), ring)).toBe("v1") // v1: tries every key
  })

  it("flags values not on the current key for re-encryption", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", k2.toString("base64"))
    vi.stubEnv("TOKEN_ENCRYPTION_KEY_ID", "k2")
    const ring = keyring()
    expect(needsReencryption(encryptToken("t", k2, "k2"), ring)).toBe(false)
    expect(needsReencryption(encryptToken("t", k1, "k1"), ring)).toBe(true)
    expect(needsReencryption(encryptToken("t", k2), ring)).toBe(true)
  })

  it("explains a value encrypted with a key that's no longer configured", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", k2.toString("base64"))
    vi.stubEnv("TOKEN_ENCRYPTION_KEY_ID", "k2")
    expect(() => decryptValue(encryptToken("t", k1, "k1"))).toThrow(/key "k1"/)
  })

  it("defaults the key id to k1 and rejects malformed previous keys", () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", k1.toString("base64"))
    expect(keyring().current?.id).toBe("k1")
    expect(() => keyring({ TOKEN_ENCRYPTION_PREVIOUS_KEYS: "k0" })).toThrow(/id:base64key/)
    expect(() => keyring({ TOKEN_ENCRYPTION_PREVIOUS_KEYS: "k0:c2hvcnQ=" })).toThrow(/32 bytes/)
  })
})
