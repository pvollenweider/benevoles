import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const getMock = vi.hoisted(() => vi.fn())
vi.mock("next/headers", () => ({ headers: () => Promise.resolve({ get: getMock }) }))
vi.mock("@/lib/prisma", () => ({ prisma: { event: { findMany: vi.fn().mockResolvedValue([]) } } }))
vi.mock("@/lib/resolve-org", () => ({ resolveOrgSlug: vi.fn().mockResolvedValue(null) }))

function withHeaders(values: Record<string, string | null>) {
  getMock.mockImplementation((name: string) => values[name] ?? null)
}

// The apex host's sitemap lists the home and the documentation (SEO); other hosts keep their rules.
describe("sitemap on the apex host", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.benevol.app")
  })
  afterEach(() => vi.unstubAllEnvs())

  it("lists the home and every documentation page on www", async () => {
    withHeaders({ host: "www.benevol.app" })
    const sitemap = (await import("../app/sitemap")).default
    const entries = await sitemap()
    expect(entries.map((e) => e.url)).toEqual([
      "https://www.benevol.app/",
      "https://www.benevol.app/fonctionnalites",
      "https://www.benevol.app/accessibilite",
      "https://www.benevol.app/doc",
      "https://www.benevol.app/doc/admin",
      "https://www.benevol.app/doc/benevole",
    ])
    // The guides are real files in the repo: their date is known.
    expect(entries.find((e) => e.url.endsWith("/doc/admin"))?.lastModified).toBeInstanceOf(Date)
  })

  it("stays empty on staging and on unknown hosts", async () => {
    const sitemap = (await import("../app/sitemap")).default
    withHeaders({ host: "staging.benevol.app" })
    expect(await sitemap()).toEqual([])
    withHeaders({ host: "evil-benevol.app" })
    expect(await sitemap()).toEqual([])
  })
})

describe("sitemap on an organisation host", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.benevol.app")
  })
  afterEach(() => vi.unstubAllEnvs())

  it("never lists the features page or the documentation", async () => {
    const { resolveOrgSlug } = await import("@/lib/resolve-org")
    vi.mocked(resolveOrgSlug).mockResolvedValue({ org: { id: "o", slug: "asso" } } as never)
    withHeaders({ host: "asso.benevol.app", "x-org-slug": "asso" })
    const sitemap = (await import("../app/sitemap")).default
    const urls = (await sitemap()).map((e) => e.url)
    expect(urls.some((u) => u.includes("/fonctionnalites") || u.includes("/doc"))).toBe(false)
  })
})
