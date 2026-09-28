import { describe, it, expect } from "vitest"
import { hashToken } from "../token-hash"

describe("hashToken (#269)", () => {
  it("is SHA-256 hex, matching the migration's encode(sha256(convert_to(t, 'UTF8')), 'hex')", () => {
    // echo -n "abc" | shasum -a 256
    expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })

  it("never returns the token itself and is deterministic", () => {
    const t = "0123456789abcdef"
    expect(hashToken(t)).not.toBe(t)
    expect(hashToken(t)).toBe(hashToken(t))
    expect(hashToken(t)).toHaveLength(64)
  })
})
