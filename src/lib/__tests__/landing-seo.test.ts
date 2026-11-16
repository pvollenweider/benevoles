import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"
import { LANDING_DESCRIPTION, LANDING_FAQ_SOURCE, LANDING_TITLE, jsonLdScript, landingJsonLd, landingMetadata } from "../landing-seo"
import { renderFaqSource, renderFeaturesPage } from "../public-content"

const BASE = "https://www.benevol.app"

type Node = Record<string, unknown> & { "@type": string }
// The FAQ as the home renders it (#951): from FAQ-ACCUEIL.md, answers as HTML and as plain text.
const FAQ = renderFaqSource(LANDING_FAQ_SOURCE)
const faqItems = FAQ.map((q) => ({ question: q.question, answer: q.text }))
const graph = () => (landingJsonLd(BASE, faqItems)["@graph"] as Node[])
const node = (type: string) => graph().find((n) => n["@type"] === type)!

describe("landing metadata", () => {
  it("keeps the title and description within what search results show", () => {
    expect(LANDING_TITLE.length).toBeLessThanOrEqual(60)
    expect(LANDING_DESCRIPTION.length).toBeGreaterThanOrEqual(120)
    expect(LANDING_DESCRIPTION.length).toBeLessThanOrEqual(160)
  })

  it("is canonical on the apex, with a large social card and full indexing", () => {
    const m = landingMetadata(`${BASE}/`)
    expect(m.alternates?.canonical).toBe(`${BASE}/`)
    expect(m.openGraph).toMatchObject({ type: "website", url: `${BASE}/`, siteName: "benevol.app", locale: "fr_CH" })
    expect(m.openGraph?.images).toEqual([expect.objectContaining({ url: "/og-image.png", width: 1200, height: 630 })])
    expect(m.twitter).toMatchObject({ card: "summary_large_image" })
    expect(m.robots).toMatchObject({ index: true, follow: true, googleBot: { "max-image-preview": "large" } })
    // An absolute title: no template can append anything to it.
    expect(m.title).toEqual({ absolute: LANDING_TITLE })
  })
})

describe("landing structured data", () => {
  it("describes the FAQ with exactly the visible questions and answers", () => {
    const faq = node("FAQPage")
    const entities = faq.mainEntity as { name: string; acceptedAnswer: { text: string } }[]
    expect(entities.map((e) => [e.name, e.acceptedAnswer.text])).toEqual(FAQ.map((f) => [f.question, f.text]))
    expect(entities.length).toBeGreaterThanOrEqual(4)
    expect(entities.length).toBeLessThanOrEqual(6)
  })

  it("declares no FAQPage when the page shows no question", () => {
    expect((landingJsonLd(BASE, [])["@graph"] as Node[]).some((n) => n["@type"] === "FAQPage")).toBe(false)
  })

  // Free is published (the FAQ, the card): a price of 0. No rating or review is.
  it("declares the free offer, and no rating or review: none is published", () => {
    expect(node("SoftwareApplication").offers).toEqual({ "@type": "Offer", price: "0", priceCurrency: "CHF" })
    const json = JSON.stringify(landingJsonLd(BASE, faqItems))
    for (const field of ["aggregateRating", "review", "ratingValue"]) expect(json).not.toContain(`"${field}"`)
  })

  it("links the site, its publisher, the application and its code", () => {
    expect(node("WebSite")).toMatchObject({ url: `${BASE}/`, publisher: { "@id": `${BASE}/#organization` } })
    expect(node("Organization")).toMatchObject({ sameAs: ["https://github.com/pvollenweider/benevoles"] })
    expect(node("SoftwareApplication")).toMatchObject({ operatingSystem: "Web", isAccessibleForFree: true, license: "https://www.gnu.org/licenses/agpl-3.0.html" })
    expect(node("SoftwareSourceCode")).toMatchObject({ codeRepository: "https://github.com/pvollenweider/benevoles", targetProduct: { "@id": `${BASE}/#application` } })
  })

  it("escapes < so the data cannot close its script element", () => {
    const out = jsonLdScript({ text: "</script><script>alert(1)</script>" })
    expect(out).not.toContain("<")
    expect(JSON.parse(out)).toEqual({ text: "</script><script>alert(1)</script>" })
  })
})

describe("landing FAQ (FAQ-ACCUEIL.md, #951)", () => {
  // #697: the off-site backup copy goes to Infomaniak Swiss Backup, no longer to Dropbox.
  it("says where the off-site backup copy is kept", () => {
    const data = FAQ.find((e) => e.question === "Où sont les données ?")
    expect(data?.text).toContain("chez Infomaniak, en Suisse")
    expect(data?.text).not.toContain("Dropbox")
  })

  it("renders each answer as sanitized HTML with site links, and as the same words in plain text", () => {
    const price = FAQ.find((e) => e.question === "Combien ça coûte ?")!
    expect(price.html).toContain('href="/tarifs"')
    expect(price.text).toContain("La page Tarifs explique pourquoi")
    for (const q of FAQ) {
      expect(q.text, q.question).not.toMatch(/[<>[\]*`]/)
      expect(q.html, q.question).not.toMatch(/<script|BROUILLON/)
    }
  })

  it("keeps the source's comments (a draft marker, a note) out of the page", () => {
    expect(fs.readFileSync(path.join(process.cwd(), LANDING_FAQ_SOURCE), "utf-8")).toContain("<!--")
    expect(JSON.stringify(FAQ)).not.toMatch(/BROUILLON|<!--/)
  })

  // #951: the home may repeat a question of /logiciel-planning-benevoles or /fonctionnalites; the
  // repeats are reported (src/lib/__tests__/audience-pages.test.ts), never a failure.
  it("reads the questions of the editorial page and the features page to compare", () => {
    const others = ["content/pages/LOGICIEL-PLANNING-BENEVOLES.md", "content/pages/FEATURES.md"].flatMap((source) =>
      renderFeaturesPage(null, source).sections.flatMap((s) => s.faq ?? []).map((q) => q.question),
    )
    expect(others.length).toBeGreaterThan(0)
    expect(FAQ.length).toBeGreaterThan(0)
  })
})
