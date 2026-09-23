import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const getMock = vi.hoisted(() => vi.fn())
vi.mock("next/headers", () => ({ headers: () => Promise.resolve({ get: getMock }) }))

const findUnique = vi.hoisted(() => vi.fn())
const findUniqueHistory = vi.hoisted(() => vi.fn())
const findMany = vi.hoisted(() => vi.fn())
vi.mock("@/lib/prisma", () => ({
  prisma: {
    organization: { findUnique },
    orgSlugHistory: { findUnique: findUniqueHistory },
    event: { findMany },
  },
}))

function withOrgSlug(slug: string | null) {
  getMock.mockImplementation((name: string) => (name === "x-org-slug" ? slug : null))
}

describe("sitemap", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://benevol.app")
  })
  afterEach(() => vi.unstubAllEnvs())

  it("returns an empty sitemap when there's no org context (apex/marketing host)", async () => {
    withOrgSlug(null)
    const sitemap = (await import("../app/sitemap")).default
    expect(await sitemap()).toEqual([])
    expect(findUnique).not.toHaveBeenCalled()
  })

  it("returns an empty sitemap for an unknown org slug", async () => {
    withOrgSlug("nope")
    findUnique.mockResolvedValue(null)
    findUniqueHistory.mockResolvedValue(null)
    const sitemap = (await import("../app/sitemap")).default
    expect(await sitemap()).toEqual([])
  })

  it("returns an empty sitemap for a historical (redirecting) slug", async () => {
    withOrgSlug("old-slug")
    findUnique.mockResolvedValue(null)
    findUniqueHistory.mockResolvedValue({
      slug: "old-slug",
      organization: { id: "org-1", slug: "new-slug", name: "Org", publicTitle: null, active: true },
    })
    const sitemap = (await import("../app/sitemap")).default
    expect(await sitemap()).toEqual([])
  })

  it("lists the org's published events and their custom pages", async () => {
    withOrgSlug("lausanne-rocks")
    findUnique.mockResolvedValue({ id: "org-1", slug: "lausanne-rocks", name: "Lausanne Rocks", publicTitle: null })
    findMany.mockResolvedValue([
      {
        slug: "festival-2026",
        updatedAt: new Date("2026-01-01"),
        pages: [{ slug: "faq", updatedAt: new Date("2026-01-02") }],
      },
    ])
    const sitemap = (await import("../app/sitemap")).default
    const entries = await sitemap()

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1", publicStatus: "published" } }),
    )
    expect(entries).toEqual([
      { url: "https://lausanne-rocks.benevol.app", changeFrequency: "daily" },
      { url: "https://lausanne-rocks.benevol.app/festival-2026", lastModified: new Date("2026-01-01"), changeFrequency: "daily" },
      { url: "https://lausanne-rocks.benevol.app/festival-2026/faq", lastModified: new Date("2026-01-02"), changeFrequency: "monthly" },
    ])
  })
})
