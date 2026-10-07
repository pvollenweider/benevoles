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
    expect(entries.map((e) => e.url).slice(0, 11)).toEqual([
      "https://www.benevol.app/",
      "https://www.benevol.app/fonctionnalites",
      // What changed, rendered from CHANGELOG.md (#757).
      "https://www.benevol.app/nouveautes",
      "https://www.benevol.app/accessibilite",
      // Privacy and terms (#747), written in their page.tsx: no source file, so no lastmod.
      "https://www.benevol.app/legal/privacy",
      "https://www.benevol.app/legal/terms",
      "https://www.benevol.app/legal/sous-traitance",
      "https://www.benevol.app/legal/sous-traitants",
      "https://www.benevol.app/doc",
      "https://www.benevol.app/doc/admin",
      "https://www.benevol.app/doc/benevole",
    ])
    // Then the documentation units of guide/ (#649), each at /doc/<slug>, in reading order.
    const { readDocUnits } = await import("../lib/doc-units")
    expect(entries.map((e) => e.url).slice(11)).toEqual(readDocUnits().map((u) => `https://www.benevol.app/doc/${u.slug}`))
    expect(entries.map((e) => e.url)).toContain("https://www.benevol.app/doc/revenir-sur-la-page-d-inscription")
    expect(entries.map((e) => e.url)).toContain("https://www.benevol.app/doc/configurer-les-creneaux")
    // Dates come from doc-lastmod.json, written at deploy from git: without it (tests,
    // development) no page claims a lastmod, rather than the build time.
    expect(entries.find((e) => e.url.endsWith("/doc/admin"))?.lastModified).toBeUndefined()
    expect(entries.find((e) => e.url.endsWith("/doc/revenir-sur-la-page-d-inscription"))?.lastModified).toBeUndefined()
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
