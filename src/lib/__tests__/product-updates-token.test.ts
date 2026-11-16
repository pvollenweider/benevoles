import { describe, it, expect, vi } from "vitest"
import { createHmac } from "crypto"

const SECRET = "test-secret-at-least-32-characters-long"
vi.mock("@/lib/env", () => ({ env: { AUTH_SECRET: "test-secret-at-least-32-characters-long" } }))

import { unsubscribeKey, unsubscribeToken, verifyUnsubscribeToken } from "../product-updates"

const legacy = (adminId: string) => createHmac("sha256", SECRET).update(adminId).digest("hex").slice(0, 32)

describe("product-update unsubscribe links (pentest F8)", () => {
  it("signs new links with a key derived from AUTH_SECRET, never AUTH_SECRET itself", () => {
    const signed = unsubscribeToken("adm-1")
    expect(signed).toMatch(/^v2-[0-9a-f]{32}$/)
    expect(signed.slice(3)).not.toBe(legacy("adm-1"))
    expect(unsubscribeKey(SECRET)).toHaveLength(32)
    expect(unsubscribeKey(SECRET).equals(Buffer.from(SECRET))).toBe(false)
  })

  it("accepts a new link only for its own admin", () => {
    expect(verifyUnsubscribeToken("adm-1", unsubscribeToken("adm-1"))).toBe(true)
    expect(verifyUnsubscribeToken("adm-2", unsubscribeToken("adm-1"))).toBe(false)
  })

  it("keeps accepting a link from an email sent before the derived key", () => {
    expect(verifyUnsubscribeToken("adm-1", legacy("adm-1"))).toBe(true)
    expect(verifyUnsubscribeToken("adm-2", legacy("adm-1"))).toBe(false)
  })

  it("never mixes the two: a legacy signature with the new prefix is refused, and the reverse", () => {
    expect(verifyUnsubscribeToken("adm-1", `v2-${legacy("adm-1")}`)).toBe(false)
    expect(verifyUnsubscribeToken("adm-1", unsubscribeToken("adm-1").slice(3))).toBe(false)
    expect(verifyUnsubscribeToken("adm-1", "")).toBe(false)
  })
})
