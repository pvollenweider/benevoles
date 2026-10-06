import { describe, it, expect } from "vitest"
import { LANDING_DESCRIPTION, LANDING_FAQ, LANDING_TITLE, jsonLdScript, landingJsonLd, landingMetadata } from "../landing-seo"

const BASE = "https://www.benevol.app"

type Node = Record<string, unknown> & { "@type": string }
const graph = () => (landingJsonLd(BASE)["@graph"] as Node[])
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
    expect(entities.map((e) => [e.name, e.acceptedAnswer.text])).toEqual(LANDING_FAQ.map((f) => [f.question, f.answer]))
    expect(entities.length).toBeGreaterThanOrEqual(4)
  })

  it("declares no price, rating or review: none is published", () => {
    const json = JSON.stringify(landingJsonLd(BASE))
    for (const field of ["offers", "aggregateRating", "review", "ratingValue", "price"]) expect(json).not.toContain(`"${field}"`)
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

describe("landing FAQ", () => {
  // #697: the off-site backup copy goes to Infomaniak Swiss Backup, no longer to Dropbox.
  it("says where the off-site backup copy is kept", () => {
    const data = LANDING_FAQ.find((e) => e.question === "Où sont les données ?")
    expect(data?.answer).toContain("chez Infomaniak, en Suisse")
    expect(data?.answer).not.toContain("Dropbox")
  })
})
