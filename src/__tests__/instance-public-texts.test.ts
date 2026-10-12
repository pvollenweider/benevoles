import { describe, it, expect, vi, afterEach } from "vitest"

// #760 acceptance criterion: with the documented variables set, an instance's public pages show no
// « benevol.app » text or contact. The rendered features page and the guides, as served.
describe("public texts of another instance (#760)", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

  it("renders the features page and every guide with the instance's name and contact", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://benevoles.example.org")
    vi.stubEnv("SITE_NAME", "Bénévoles du Jura")
    vi.stubEnv("CONTACT_EMAIL", "aide@example.org")
    vi.resetModules()
    const { renderFeaturesPage, renderDocUnit } = await import("@/lib/public-content")
    const { loadDocUnits } = await import("@/lib/doc-units")

    const features = renderFeaturesPage(null)
    // The one exception (#872, owner's decision): a link to a presentation page this instance
    // doesn't have (the audience pages, /tarifs) points at it on the hosted service, never a 404.
    const { PUBLIC_PAGES } = await import("@/lib/doc-pages")
    const presentation = PUBLIC_PAGES.filter((p) => p.presentation).map((p) => p.path)
    const hostedLinks = [...JSON.stringify(features).matchAll(/https:\/\/www\.benevol\.app(\/[a-z-]+)/g)].map((m) => m[1])
    expect(hostedLinks.length).toBeGreaterThan(0)
    for (const path of hostedLinks) expect(presentation, path).toContain(path)
    const featuresHtml = JSON.stringify(features).replace(/https:\/\/www\.benevol\.app\/[a-z-]+/g, "")
    expect(featuresHtml).not.toMatch(/benevol\.app/)
    expect(featuresHtml).toContain("Bénévoles du Jura")

    for (const unit of loadDocUnits()) {
      const html = renderDocUnit(unit, null)
      expect(html, unit.slug).not.toMatch(/benevol\.app/)
    }
    const help = renderDocUnit(loadDocUnits().find((u) => u.slug === "aide-et-retours")!, null)
    expect(help).toContain("aide@example.org")
  })
})
