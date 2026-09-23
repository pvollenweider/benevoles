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

  it("allows the apex marketing domain, with the standard disallow list and no sitemap", async () => {
    withHost("benevol.app")
    const robots = (await import("../app/robots")).default
    const result = await robots()
    expect(result.rules).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/my/", "/waitlist/", "/leader/"],
    })
    expect(result.sitemap).toBeUndefined()
  })

  it("allows an org subdomain and points to its own sitemap", async () => {
    withHost("lausanne-rocks.benevol.app")
    const robots = (await import("../app/robots")).default
    const result = await robots()
    expect(result.rules).toMatchObject({ userAgent: "*", allow: "/" })
    expect(result.sitemap).toBe("https://lausanne-rocks.benevol.app/sitemap.xml")
  })
})

describe("robots (dev: localhost)", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000")
  })
  afterEach(() => vi.unstubAllEnvs())

  it("allows localhost (known host, no org subdomain, no sitemap)", async () => {
    withHost("localhost:3000")
    const robots = (await import("../app/robots")).default
    const result = await robots()
    expect(result.rules).toMatchObject({ userAgent: "*", allow: "/" })
    expect(result.sitemap).toBeUndefined()
  })
})
