import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match"
import nextConfig from "../../../next.config"
import { isPersonalApiPath, NOT_PERSONAL_API_ROUTES, PERSONAL_API_PREFIXES } from "../personal-api-headers"

// Personal data and tokens in API answers are never cached (pentest F5): every API route is either
// in a family that gets `Cache-Control: private, no-store`, or listed as having nothing personal.
const apiDir = path.join(__dirname, "..", "..", "app", "api")

function apiRoutes(dir = apiDir): string[] {
  const found: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) found.push(...apiRoutes(full))
    else if (entry.name === "route.ts") found.push(`/api/${path.relative(apiDir, dir).split(path.sep).join("/")}`.replace(/\/$/, ""))
  }
  return found.sort()
}

/** A request path for a route: each dynamic segment filled with a sample value. */
const sampleUrl = (route: string) => route.replace(/\[\.\.\.[^\]]+\]/g, "a/b").replace(/\[[^\]]+\]/g, "abc123")

const cacheControlFor = async (url: string): Promise<string | undefined> => {
  let value: string | undefined
  // As Next applies them: every matching rule in order, the last one setting a key wins.
  for (const rule of await nextConfig.headers!()) {
    if (rule.has || rule.missing) continue
    if (getPathMatch(rule.source)(url) === false) continue
    value = rule.headers.find((h) => h.key === "Cache-Control")?.value ?? value
  }
  return value
}

describe("no-store on API answers with personal data or tokens", () => {
  const routes = apiRoutes()

  it("finds the API routes", () => {
    expect(routes.length).toBeGreaterThan(50)
    expect(routes).toContain("/api/public/registrations/[token]")
  })

  it("classifies every API route: personal family or explicitly not personal, never both", () => {
    const unclassified = routes.filter((r) => !isPersonalApiPath(r) && !(NOT_PERSONAL_API_ROUTES as readonly string[]).includes(r))
    expect(unclassified, "add the route's family to PERSONAL_API_PREFIXES, or the route to NOT_PERSONAL_API_ROUTES").toEqual([])
    for (const r of NOT_PERSONAL_API_ROUTES) {
      expect(routes, `${r} no longer exists`).toContain(r)
      expect(isPersonalApiPath(r), r).toBe(false)
    }
  })

  it("has no prefix left without a route behind it", () => {
    for (const prefix of PERSONAL_API_PREFIXES) expect(routes.some((r) => r === prefix || r.startsWith(`${prefix}/`)), prefix).toBe(true)
  })

  it("sends private, no-store on every personal route, by the next.config.ts rules", async () => {
    for (const route of routes.filter(isPersonalApiPath)) {
      expect(await cacheControlFor(sampleUrl(route)), route).toBe("private, no-store")
    }
  })

  it("covers the personal link, leader and member invite APIs (regression)", async () => {
    for (const url of ["/api/public/registrations/abc123", "/api/public/leader/abc123", "/api/public/member-invite/abc123", "/api/public/registrations", "/api/admin/events"]) {
      expect(await cacheControlFor(url), url).toBe("private, no-store")
    }
  })

  it("leaves the public, cacheable answers alone", async () => {
    for (const url of ["/api/public/events", "/api/public/spectacle-2026", "/api/public/organizations/abc/logo", "/api/health"]) {
      expect(await cacheControlFor(url), url).toBeUndefined()
    }
    // A prefix is a whole path segment: /api/admin-like is not /api/admin.
    expect(isPersonalApiPath("/api/administration")).toBe(false)
  })

  it("adds Pragma and noindex alongside", async () => {
    const rules = await nextConfig.headers!()
    const rule = rules.find((r) => r.source === "/api/public/registrations/:path*")
    expect(rule?.headers).toEqual(expect.arrayContaining([{ key: "Pragma", value: "no-cache" }, { key: "X-Robots-Tag", value: "noindex" }]))
  })
})
