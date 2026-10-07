import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// The apex sitemap index (#746): only on the apex host, active organisations only.
const m = vi.hoisted(() => ({ findMany: vi.fn(), headers: new Map<string, string>() }))
vi.mock("next/headers", () => ({ headers: () => Promise.resolve({ get: (name: string) => m.headers.get(name) ?? null }) }))
vi.mock("@/lib/prisma", () => ({ prisma: { organization: { findMany: m.findMany } } }))
vi.mock("@/lib/report-error", () => ({ reportError: () => () => {} }))

function request(host: string, orgSlug?: string) {
  m.headers = new Map([["host", host], ...(orgSlug ? [["x-org-slug", orgSlug] as [string, string]] : [])])
}

describe("GET /sitemap-index.xml", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.benevol.app")
  })
  afterEach(() => vi.unstubAllEnvs())

  it("lists the www sitemap and every active organisation's", async () => {
    request("www.benevol.app")
    m.findMany.mockResolvedValue([
      { slug: "lausanne-rocks", updatedAt: new Date("2026-09-01T00:00:00Z"), events: [{ updatedAt: new Date("2026-10-01T00:00:00Z") }] },
      { slug: "fete-du-village", updatedAt: new Date("2026-08-01T00:00:00Z"), events: [] },
    ])
    const { GET } = await import("@/app/sitemap-index.xml/route")
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("application/xml")
    const xml = await res.text()
    expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1])).toEqual([
      "https://www.benevol.app/sitemap.xml",
      "https://fete-du-village.benevol.app/sitemap.xml",
      "https://lausanne-rocks.benevol.app/sitemap.xml",
    ])
    expect(xml).toContain("<lastmod>2026-10-01T00:00:00.000Z</lastmod>")
    expect(m.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { active: true } }))
  })

  it("is a 404 on an organisation's host, on staging and on an unknown host", async () => {
    const { GET } = await import("@/app/sitemap-index.xml/route")
    for (const [host, org] of [["lausanne-rocks.benevol.app", "lausanne-rocks"], ["staging.benevol.app", undefined], ["evil.example", undefined]] as const) {
      request(host, org)
      expect((await GET()).status, host).toBe(404)
    }
    expect(m.findMany).not.toHaveBeenCalled()
  })

  it("still gives the www sitemap when the database fails", async () => {
    request("www.benevol.app")
    m.findMany.mockRejectedValue(new Error("down"))
    const { GET } = await import("@/app/sitemap-index.xml/route")
    const xml = await (await GET()).text()
    expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((x) => x[1])).toEqual(["https://www.benevol.app/sitemap.xml"])
  })
})
