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
    const featuresHtml = JSON.stringify(features)
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
