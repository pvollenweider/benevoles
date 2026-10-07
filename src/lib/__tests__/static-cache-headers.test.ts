import { describe, it, expect } from "vitest"
import { IMMUTABLE_CACHE, REVALIDATED_CACHE, STATIC_CACHE_HEADERS } from "../static-cache-headers"
import nextConfig from "../../../next.config"

describe("static cache headers (#773, #759 F3)", () => {
  const cacheOf = (rule: (typeof STATIC_CACHE_HEADERS)[number]) => rule.headers.find((h) => h.key === "Cache-Control")?.value

  it("caches a fingerprinted screenshot (?v=) for a year, immutable", () => {
    const rule = STATIC_CACHE_HEADERS.find((r) => r.source === "/doc-img/:file*" && r.has?.some((h) => h.key === "v"))
    expect(rule && cacheOf(rule)).toBe(IMMUTABLE_CACHE)
    expect(IMMUTABLE_CACHE).toContain("max-age=31536000")
    expect(IMMUTABLE_CACHE).toContain("immutable")
  })

  it("gives an unversioned screenshot a day, then stale-while-revalidate, never immutable", () => {
    const rule = STATIC_CACHE_HEADERS.find((r) => r.source === "/doc-img/:file*" && r.missing?.some((h) => h.key === "v"))
    expect(rule && cacheOf(rule)).toBe(REVALIDATED_CACHE)
    expect(REVALIDATED_CACHE).toMatch(/max-age=86400/)
    expect(REVALIDATED_CACHE).toMatch(/stale-while-revalidate=\d+/)
    expect(REVALIDATED_CACHE).not.toContain("immutable")
  })

  it("never touches the service worker or HTML pages", () => {
    for (const rule of STATIC_CACHE_HEADERS) {
      expect(rule.source.startsWith("/doc-img/")).toBe(true)
    }
  })

  it("is wired into next.config.ts after the security headers", async () => {
    const rules = await nextConfig.headers!()
    expect(rules[0].source).toBe("/:path*")
    for (const rule of STATIC_CACHE_HEADERS) expect(rules).toContainEqual(rule)
  })
})
