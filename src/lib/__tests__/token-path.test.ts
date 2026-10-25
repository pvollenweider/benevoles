import { describe, it, expect } from "vitest"
import { isTokenShaped, requireTokenPath, tokenOrNull, tokenPath } from "../token-path"
import { generateToken } from "../utils"

describe("isTokenShaped", () => {
  it("accepts generated tokens and the readable seeded ones", () => {
    expect(isTokenShaped(generateToken())).toBe(true)
    expect(isTokenShaped("demo-invite-camille-0001")).toBe(true)
    expect(isTokenShaped("closed_org_link")).toBe(true)
    expect(isTokenShaped("a".repeat(128))).toBe(true)
    expect(isTokenShaped("tok-1")).toBe(true)
  })

  it.each([
    ["empty", ""],
    ["too long", "a".repeat(129)],
    ["dot segments", "../../admin/events/abc/send-reminder?"],
    ["a lone dot segment", ".."],
    ["an encoded slash", "abc%2Fdef12345"],
    ["an encoded dot segment", "%2e%2e%2fadmin12"],
    ["a slash", "abcdefgh/ijkl"],
    ["a question mark", "abcdefghijkl?x=1"],
    ["a hash", "abcdefghijkl#frag"],
    ["a space", "abcdef ghijkl"],
    ["a backslash", "abcdefgh\\ijkl"],
    ["a newline", "abcdefghijkl\n"],
    ["non-ASCII", "abcdéfghijkl"],
  ])("refuses %s", (_label, value) => {
    expect(isTokenShaped(value)).toBe(false)
  })

  it("refuses what is not a string", () => {
    expect(isTokenShaped(null)).toBe(false)
    expect(isTokenShaped(undefined)).toBe(false)
    expect(isTokenShaped(12345678)).toBe(false)
  })
})

describe("tokenOrNull", () => {
  it("keeps a token, drops anything else", () => {
    expect(tokenOrNull("demo-invite-camille-0001")).toBe("demo-invite-camille-0001")
    expect(tokenOrNull("../../admin/x?")).toBeNull()
    expect(tokenOrNull(null)).toBeNull()
    expect(tokenOrNull(undefined)).toBeNull()
  })
})

describe("tokenPath", () => {
  it("builds the path with the caller's suffix", () => {
    expect(tokenPath("/api/public/registrations", "abcdefgh12345678", "/roster")).toBe("/api/public/registrations/abcdefgh12345678/roster")
    expect(tokenPath("/api/public/member-invite", "demo-invite-camille-0001", "?slug=fete")).toBe("/api/public/member-invite/demo-invite-camille-0001?slug=fete")
    expect(tokenPath("/my", "abcdefgh12345678")).toBe("/my/abcdefgh12345678")
  })

  it("returns null instead of a path that would resolve elsewhere", () => {
    expect(tokenPath("/api/public/member-invite", "../../admin/events/e1/send-reminder?", "/decline")).toBeNull()
    expect(tokenPath("/api/public/registrations", "..")).toBeNull()
    expect(tokenPath("/api/public/registrations", "x%2F..%2F..%2Fadmin")).toBeNull()
    expect(tokenPath("/api/public/registrations", "")).toBeNull()
    expect(tokenPath("/api/public/registrations", null)).toBeNull()
  })

  it("every path it returns stays under the prefix once the browser resolves it", () => {
    for (const token of [generateToken(), "demo-leader-buvette-0001", "A_b-C_d-1234"]) {
      const path = tokenPath("/api/public/registrations", token, "/roster")!
      expect(new URL(path, "https://example.org").pathname).toBe(`/api/public/registrations/${token}/roster`)
    }
  })
})

describe("requireTokenPath", () => {
  it("returns the same path as tokenPath for a token", () => {
    expect(requireTokenPath("/api/public/registrations", "abcdefgh12345678", "/answers")).toBe("/api/public/registrations/abcdefgh12345678/answers")
  })

  it("throws for anything else, so the caller's catch shows its failure", () => {
    expect(() => requireTokenPath("/api/public/registrations", "../x/..")).toThrow()
    expect(() => requireTokenPath("/api/public/registrations", "")).toThrow()
  })
})
