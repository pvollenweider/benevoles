import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

describe("orgBaseUrl / eventPublicUrl (localhost)", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
  })
  afterEach(() => vi.unstubAllEnvs())

  it("orgBaseUrl ignores the subdomain and returns the app URL as-is", async () => {
    const { orgBaseUrl } = await import("../urls")
    expect(orgBaseUrl("lausanne-rocks")).toBe("http://localhost:3000")
  })

  it("eventPublicUrl uses the ?org= query fallback", async () => {
    const { eventPublicUrl } = await import("../urls")
    expect(eventPublicUrl("lausanne-rocks", "festival-2026")).toBe(
      "http://localhost:3000/festival-2026?org=lausanne-rocks",
    )
  })
})

describe("orgBaseUrl (production)", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://benevol.app")
  })
  afterEach(() => vi.unstubAllEnvs())

  it("builds the org subdomain URL", async () => {
    const { orgBaseUrl } = await import("../urls")
    expect(orgBaseUrl("lausanne-rocks")).toBe("https://lausanne-rocks.benevol.app")
  })
})

describe("isKnownHost (production)", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://benevol.app")
  })
  afterEach(() => vi.unstubAllEnvs())

  it("accepts the apex production domain", async () => {
    const { isKnownHost } = await import("../urls")
    expect(isKnownHost("benevol.app")).toBe(true)
  })

  it("accepts any subdomain of the production domain (org subdomains, staging, etc.)", async () => {
    const { isKnownHost } = await import("../urls")
    expect(isKnownHost("lausanne-rocks.benevol.app")).toBe(true)
    expect(isKnownHost("staging.benevol.app")).toBe(true)
  })

  it("rejects an unrelated or lookalike host", async () => {
    const { isKnownHost } = await import("../urls")
    expect(isKnownHost("evil-benevol.app")).toBe(false)
    expect(isKnownHost("benevol.app.evil.com")).toBe(false)
    expect(isKnownHost("localhost")).toBe(false)
  })
})

describe("isKnownHost (localhost dev)", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
  })
  afterEach(() => vi.unstubAllEnvs())

  it("accepts localhost, rejects a production-looking host", async () => {
    const { isKnownHost } = await import("../urls")
    expect(isKnownHost("localhost")).toBe(true)
    expect(isKnownHost("benevol.app")).toBe(false)
  })
})
