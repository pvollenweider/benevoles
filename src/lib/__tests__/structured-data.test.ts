import { describe, it, expect } from "vitest"
import { breadcrumbNode, docUnitJsonLd, jsonLdScript, organizationNode, publicPageJsonLd, softwareApplicationNode, websiteNode } from "../structured-data"
import { docGroup, loadDocUnits, type DocUnit } from "../doc-units"

const BASE = "https://www.benevol.app"
type Node = Record<string, unknown> & { "@type": string }
const graphOf = (doc: Record<string, unknown>) => {
  expect(doc["@context"]).toBe("https://schema.org")
  return doc["@graph"] as Node[]
}
const types = (doc: Record<string, unknown>) => graphOf(doc).map((n) => n["@type"])

const unit: DocUnit = {
  slug: "presences-le-jour-j",
  title: "Présences le jour J",
  roles: ["admin", "benevole"],
  group: "jour-j",
  order: 10,
  summary: "Pointer les arrivées le jour J, depuis un téléphone, et voir qui manque encore à l'appel.",
  related: [],
  legacy: [],
  aliases: [],
  body: "Texte.\n",
  source: "guide/presences-le-jour-j.md",
}

describe("shared nodes", () => {
  it("tie every page to one publisher and one site, by stable ids on the home", () => {
    expect(organizationNode(BASE)).toMatchObject({ "@type": "Organization", "@id": `${BASE}/#organization`, url: `${BASE}/`, logo: `${BASE}/apple-icon.png` })
    expect(websiteNode(`${BASE}/`)).toMatchObject({ "@type": "WebSite", "@id": `${BASE}/#website`, inLanguage: "fr", publisher: { "@id": `${BASE}/#organization` } })
  })

  it("describe the application as a free, open source web application", () => {
    expect(softwareApplicationNode(BASE, "D")).toMatchObject({
      "@type": "SoftwareApplication",
      operatingSystem: "Web",
      applicationCategory: "BusinessApplication",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "CHF" },
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
    })
  })

  it("number a breadcrumb from 1, every item but the last with its absolute URL", () => {
    expect(breadcrumbNode(BASE, "/doc/x", [{ name: "Documentation", path: "/doc" }, { name: "X" }])).toEqual({
      "@type": "BreadcrumbList",
      "@id": `${BASE}/doc/x#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Documentation", item: `${BASE}/doc` },
        { "@type": "ListItem", position: 2, name: "X" },
      ],
    })
  })
})

describe("publicPageJsonLd", () => {
  it("describes a page, its breadcrumb from the home, the site and its publisher", () => {
    const doc = publicPageJsonLd("/doc/admin", BASE)
    expect(types(doc)).toEqual(["WebPage", "BreadcrumbList", "WebSite", "Organization"])
    const [page, crumbs] = graphOf(doc)
    expect(page).toMatchObject({ "@id": `${BASE}/doc/admin#webpage`, url: `${BASE}/doc/admin`, inLanguage: "fr", breadcrumb: { "@id": `${BASE}/doc/admin#breadcrumb` } })
    expect((crumbs.itemListElement as { name: string }[]).map((c) => c.name)).toEqual(["Accueil", "Documentation", "Guide administrateur"])
  })

  it("makes /doc a collection, and the features page describe the application", () => {
    expect(types(publicPageJsonLd("/doc", BASE))[0]).toBe("CollectionPage")
    expect(types(publicPageJsonLd("/fonctionnalites", BASE))).toContain("SoftwareApplication")
    expect(types(publicPageJsonLd("/legal/privacy", BASE))).not.toContain("SoftwareApplication")
    expect(types(publicPageJsonLd("/logiciel-planning-benevoles", BASE))).toContain("SoftwareApplication")
    expect(types(publicPageJsonLd("/remplacer-tableur-benevoles", BASE))).toContain("SoftwareApplication")
  })

  // #767: only the questions a page renders, word for word, never a FAQ the page doesn't show.
  it("adds a FAQPage only when the page passes the questions it shows", () => {
    expect(types(publicPageJsonLd("/logiciel-planning-benevoles", BASE))).not.toContain("FAQPage")
    const faq = [{ question: "Est-ce gratuit ?", answer: "Oui." }]
    const node = graphOf(publicPageJsonLd("/logiciel-planning-benevoles", BASE, faq)).find((n) => n["@type"] === "FAQPage")
    expect(node).toEqual({
      "@type": "FAQPage",
      "@id": `${BASE}/logiciel-planning-benevoles#faq`,
      inLanguage: "fr",
      mainEntity: [{ "@type": "Question", name: "Est-ce gratuit ?", acceptedAnswer: { "@type": "Answer", text: "Oui." } }],
    })
  })
})

describe("docUnitJsonLd", () => {
  it("is a technical article in French by benevol.app, for its audiences, in its group", () => {
    const [article, crumbs] = graphOf(docUnitJsonLd(unit, BASE, new Date("2026-10-03T12:00:00Z")))
    expect(article).toMatchObject({
      "@type": "TechArticle",
      url: `${BASE}/doc/presences-le-jour-j`,
      headline: unit.title,
      description: unit.summary,
      inLanguage: "fr",
      articleSection: docGroup("jour-j").title,
      audience: [{ "@type": "Audience", audienceType: "organisateurs" }, { "@type": "Audience", audienceType: "bénévoles" }],
      image: `${BASE}/og-image.png/doc/presences-le-jour-j`,
      author: { "@id": `${BASE}/#organization` },
      publisher: { "@id": `${BASE}/#organization` },
      dateModified: "2026-10-03T12:00:00.000Z",
    })
    // The breadcrumb the page draws: Documentation, the group, the unit.
    expect(crumbs.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Documentation", item: `${BASE}/doc` },
      { "@type": "ListItem", position: 2, name: "Le jour J", item: `${BASE}/doc#jour-j` },
      { "@type": "ListItem", position: 3, name: unit.title },
    ])
  })

  it("leaves dateModified out when the last change isn't known", () => {
    expect(graphOf(docUnitJsonLd(unit, BASE))[0]).not.toHaveProperty("dateModified")
  })

  it("never fakes a FAQ: no unit declares FAQPage (the FAQ units only link to their answers)", () => {
    for (const u of loadDocUnits()) expect(JSON.stringify(docUnitJsonLd(u, BASE)), u.slug).not.toContain("FAQPage")
  })
})

describe("jsonLdScript", () => {
  it("escapes what could close the script or break the line, and stays the same JSON", () => {
    const data = { a: "</script><!-- & -->", b: "ligne\u2028suivante\u2029fin" }
    const out = jsonLdScript(data)
    expect(out).not.toMatch(/[<>&\u2028\u2029]/)
    expect(JSON.parse(out)).toEqual(data)
  })
})
