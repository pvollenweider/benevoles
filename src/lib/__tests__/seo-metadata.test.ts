import { describe, it, expect } from "vitest"
import { CONTENT_VIEWPORT, absoluteUrl, pageTitle, seoMetadata, socialImagePath } from "../seo-metadata"
import { PUBLIC_PAGES, publicPageMetadata } from "../doc-pages"
import { docUnitMetadata, loadDocUnits } from "../doc-units"
import { docUnitJsonLd, publicPageJsonLd } from "../structured-data"
import { landingJsonLd, landingMetadata } from "../landing-seo"

const BASE = "https://www.benevol.app"

describe("pageTitle", () => {
  it("puts the site name after a vertical bar, never an em dash (#747)", () => {
    expect(pageTitle("Guide bénévole")).toBe("Guide bénévole | benevol.app")
  })
})

describe("URLs of a page", () => {
  it("are absolute on the base, whatever its trailing slash", () => {
    expect(absoluteUrl(`${BASE}/`, "/doc")).toBe(`${BASE}/doc`)
    expect(absoluteUrl(BASE, "/")).toBe(`${BASE}/`)
    expect(absoluteUrl(BASE, "doc")).toBe(`${BASE}/doc`)
  })

  it("give each page its own social card under /og-image.png, the home the platform's", () => {
    expect(socialImagePath("/doc/admin")).toBe("/og-image.png/doc/admin")
    expect(socialImagePath("/")).toBe("/og-image.png")
  })
})

describe("seoMetadata", () => {
  const page = { base: BASE, path: "/doc/x", title: "X", description: "Une description.", imageAlt: "X, benevol.app" }

  it("gives a website the complete link preview", () => {
    const m = seoMetadata({ ...page, type: "website" })
    const image = { url: `${BASE}/og-image.png/doc/x`, width: 1200, height: 630, type: "image/png", alt: "X, benevol.app" }
    expect(m).toMatchObject({
      title: { absolute: "X | benevol.app" },
      description: "Une description.",
      alternates: { canonical: `${BASE}/doc/x` },
      openGraph: { type: "website", siteName: "benevol.app", locale: "fr_CH", url: `${BASE}/doc/x`, title: "X | benevol.app", description: "Une description.", images: [image] },
      twitter: { card: "summary_large_image", title: "X | benevol.app", description: "Une description.", images: [image] },
      robots: { index: true, follow: true, googleBot: { "max-image-preview": "large" } },
    })
  })

  it("gives an article its section and, when known, its last change", () => {
    const m = seoMetadata({ ...page, type: "article", section: "Le jour J", modifiedTime: new Date("2026-10-02T00:00:00Z") })
    expect(m.openGraph).toMatchObject({ type: "article", section: "Le jour J", modifiedTime: "2026-10-02T00:00:00.000Z" })
  })
})

// The guard against the production bug: with the production address, nothing a public page emits
// (metadata, structured data) may point anywhere but https://www.benevol.app.
describe("every public page, with the production base URL", () => {
  const units = loadDocUnits()
  const outputs: [string, unknown][] = [
    ["/", landingMetadata(BASE)],
    ["/ (JSON-LD)", landingJsonLd(BASE)],
    ...PUBLIC_PAGES.flatMap((p): [string, unknown][] => [[p.path, publicPageMetadata(p.path, BASE)], [`${p.path} (JSON-LD)`, publicPageJsonLd(p.path, BASE)]]),
    ...units.flatMap((u): [string, unknown][] => [[`/doc/${u.slug}`, docUnitMetadata(u, BASE)], [`/doc/${u.slug} (JSON-LD)`, docUnitJsonLd(u, BASE)]]),
  ]

  it("covers the pages and every unit", () => {
    expect(units.length).toBeGreaterThan(10)
    expect(outputs.length).toBe(2 + 2 * PUBLIC_PAGES.length + 2 * units.length)
  })

  it("never mentions localhost, and every own URL is absolute https on www.benevol.app", () => {
    for (const [name, output] of outputs) {
      const json = JSON.stringify(output)
      expect(json, name).not.toMatch(/localhost|127\.0\.0\.1/)
      const ownUrls = [...json.matchAll(/"(https?:\/\/[^"]*benevol\.app[^"]*)"/g)].map((m) => m[1])
      for (const url of ownUrls) expect(url, name).toMatch(/^https:\/\/www\.benevol\.app\//)
    }
  })

  it("gives every page its own canonical and description, no two alike", () => {
    const metas = outputs.filter(([name]) => !name.endsWith("(JSON-LD)")).map(([, m]) => m as { alternates: { canonical: string }; description: string })
    const canonicals = metas.map((m) => m.alternates.canonical)
    const descriptions = metas.map((m) => m.description)
    expect(new Set(canonicals).size).toBe(canonicals.length)
    expect(new Set(descriptions).size).toBe(descriptions.length)
  })
})

describe("CONTENT_VIEWPORT", () => {
  it("colours the browser bar like the content pages' header, light and dark", () => {
    expect(CONTENT_VIEWPORT.themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#ffffff" },
      { media: "(prefers-color-scheme: dark)", color: "#111827" },
    ])
  })
})
