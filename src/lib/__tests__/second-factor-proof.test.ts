import { describe, it, expect } from "vitest"
import { createSecondFactorProof, PROOF_TTL_MS, verifySecondFactorProof } from "../second-factor-proof"
import { acceptSecondFactorUpdate, PROOF_FIELD } from "../second-factor-update"

// Pentest F6: only the server completes a pending session; a client posting to /api/auth/session
// can't, whatever it sends.
const SECRET = "test-auth-secret-of-at-least-32-characters"
const NOW = 1_800_000_000_000
const subject = { sub: "adm-1", sessionVersion: 3, loginNonce: "nonce-a" }

describe("second-factor proof", () => {
  it("is accepted for the token it was made for, within a minute", () => {
    const proof = createSecondFactorProof(subject, NOW, SECRET)
    expect(verifySecondFactorProof(proof, subject, NOW, SECRET)).toBe(true)
    expect(verifySecondFactorProof(proof, subject, NOW + PROOF_TTL_MS - 1, SECRET)).toBe(true)
    expect(verifySecondFactorProof(proof, subject, NOW + PROOF_TTL_MS, SECRET)).toBe(false)
  })

  it("can't complete another session of the same account, another account or an older session version", () => {
    const proof = createSecondFactorProof(subject, NOW, SECRET)
    expect(verifySecondFactorProof(proof, { ...subject, loginNonce: "nonce-b" }, NOW, SECRET)).toBe(false)
    expect(verifySecondFactorProof(proof, { ...subject, sub: "adm-2" }, NOW, SECRET)).toBe(false)
    expect(verifySecondFactorProof(proof, { ...subject, sessionVersion: 4 }, NOW, SECRET)).toBe(false)
  })

  it("refuses a proof made with another key, tampered, dated too far ahead, or not a proof at all", () => {
    const proof = createSecondFactorProof(subject, NOW, SECRET)
    expect(verifySecondFactorProof(proof, subject, NOW, `${SECRET}x`)).toBe(false)
    expect(verifySecondFactorProof(proof, subject, NOW, undefined)).toBe(false)
    const [expiresAt, mac] = proof.split(".")
    expect(verifySecondFactorProof(`${Number(expiresAt) + 1}.${mac}`, subject, NOW, SECRET)).toBe(false)
    expect(verifySecondFactorProof(createSecondFactorProof(subject, NOW + 10 * PROOF_TTL_MS, SECRET), subject, NOW, SECRET)).toBe(false)
    for (const forged of [true, "done", `${NOW + 1000}.${"A".repeat(43)}`, { secondFactorAt: NOW }, null]) {
      expect(verifySecondFactorProof(forged, subject, NOW, SECRET)).toBe(false)
    }
  })

  it("needs a nonce: a session issued before the second factor can't be completed", () => {
    const proof = createSecondFactorProof(subject, NOW, SECRET)
    expect(verifySecondFactorProof(proof, { sub: "adm-1", sessionVersion: 3 }, NOW, SECRET)).toBe(false)
  })
})

describe("acceptSecondFactorUpdate (jwt callback, trigger update)", () => {
  const token = () => ({ sub: "adm-1", sessionVersion: 3, loginNonce: "nonce-a", role: "super_admin" }) as Record<string, unknown>

  it("marks the second factor as given with a valid proof", () => {
    const t = token()
    expect(acceptSecondFactorUpdate(t, { [PROOF_FIELD]: createSecondFactorProof(subject, NOW, SECRET) }, NOW, SECRET)).toBe(true)
    expect(t.secondFactorAt).toBe(NOW)
  })

  it("ignores what a client can send to /api/auth/session", () => {
    for (const data of [{ secondFactorAt: NOW }, { [PROOF_FIELD]: "x" }, { secondFactor: { pending: false } }, "done", null, undefined]) {
      const t = token()
      expect(acceptSecondFactorUpdate(t, data, NOW, SECRET)).toBe(false)
      expect(t.secondFactorAt).toBeUndefined()
    }
  })
})
