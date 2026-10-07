import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const getMock = vi.hoisted(() => vi.fn())
vi.mock("next/headers", () => ({ headers: () => Promise.resolve({ get: getMock }) }))

function withHost(host: string) {
  getMock.mockImplementation((name: string) => (name === "host" ? host : null))
}

describe("robots (production domain: benevol.app)", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://benevol.app")
  })
  afterEach(() => vi.unstubAllEnvs())

  it("disallows everything on the staging subdomain", async () => {
    withHost("staging.benevol.app")
    const robots = (await import("../app/robots")).default
    const result = await robots()
    expect(result.rules).toEqual({ userAgent: "*", disallow: "/" })
    expect(result.sitemap).toBeUndefined()
  })

  it("disallows everything on an unrelated host", async () => {
    withHost("evil-benevol.app")
    const robots = (await import("../app/robots")).default
    const result = await robots()
    expect(result.rules).toEqual({ userAgent: "*", disallow: "/" })
  })

  it("allows the apex marketing domain, with the standard disallow list and the apex sitemap index", async () => {
    withHost("benevol.app")
    const robots = (await import("../app/robots")).default
    const result = await robots()
    const disallow = ["/admin", "/api/", "/my/", "/waitlist/", "/leader/", "/videos"]
    const rules = result.rules as { userAgent: string | string[]; allow: string; disallow: string[] }[]
    expect(rules[0]).toEqual({ userAgent: "*", allow: "/", disallow })
    // The search and AI crawlers are named and allowed, with the same private areas closed.
    expect(rules[1]).toMatchObject({ allow: "/", disallow })
    expect(rules[1].userAgent).toEqual(expect.arrayContaining(["Googlebot", "Bingbot", "GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot"]))
    // The index lists the apex sitemap and every organisation's (#746).
    expect(result.sitemap).toBe("https://benevol.app/sitemap-index.xml")
  })

  it("allows an org subdomain and points to its own sitemap", async () => {
    withHost("lausanne-rocks.benevol.app")
    const robots = (await import("../app/robots")).default
    const result = await robots()
    // Unchanged on an organisation's host: one group, its own sitemap.
    expect(result.rules).toEqual({ userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/my/", "/waitlist/", "/leader/", "/videos"] })
    expect(result.sitemap).toBe("https://lausanne-rocks.benevol.app/sitemap.xml")
  })
})

describe("robots (dev: localhost)", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
  })
  afterEach(() => vi.unstubAllEnvs())

  it("allows localhost (known host, no org subdomain, the apex sitemap index)", async () => {
    withHost("localhost:3000")
    const robots = (await import("../app/robots")).default
    const result = await robots()
    expect((result.rules as object[])[0]).toMatchObject({ userAgent: "*", allow: "/" })
    expect(result.sitemap).toBe("http://localhost:3000/sitemap-index.xml")
  })
})
