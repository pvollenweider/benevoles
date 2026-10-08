import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"
import { metaLengthProblems } from "../meta-length"
import { pageTitle } from "../seo-metadata"
import { renderFeaturesPage } from "../public-content"
import { apexSitemap, CONTENT_NAV, DOC_UNIT_PRIORITY, DOC_GUIDES, DOC_PAGES, linkSourcesToRoutes, PUBLIC_PAGES, publicPageMetadata, splitTitle } from "../doc-pages"

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf-8")

// The public content pages (features and documentation), their metadata and the apex sitemap.
describe("PUBLIC_PAGES", () => {
  it("has a route file and a source file for every entry, so the sitemap never lists a 404", () => {
    for (const p of PUBLIC_PAGES) {
      expect(fs.existsSync(path.join(process.cwd(), "src/app", p.path, "page.tsx")), `route for ${p.path}`).toBe(true)
      if (p.source) expect(fs.existsSync(path.join(process.cwd(), p.source)), `source for ${p.path}`).toBe(true)
    }
  })

  // The dynamic segment src/app/doc/[slug] serves the documentation units (#649, doc-units.test.ts).
  it("lists every doc route that exists, and the features page, so a new page cannot be forgotten", () => {
    const docDir = path.join(process.cwd(), "src/app/doc")
    const routes = ["/doc", ...fs.readdirSync(docDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("[") && fs.existsSync(path.join(docDir, d.name, "page.tsx"))).map((d) => `/doc/${d.name}`)]
    expect(DOC_PAGES.map((p) => p.path).sort()).toEqual(routes.sort())
    expect(PUBLIC_PAGES.map((p) => p.path)).toContain("/fonctionnalites")
    expect(DOC_GUIDES.map((p) => p.path)).toEqual(["/doc/admin", "/doc/benevole"])
    expect(CONTENT_NAV.map((p) => p.path)).toEqual(["/fonctionnalites", "/doc/admin", "/doc/benevole"])
  })

  it("gives every page its own title and a description of about 140 to 160 characters", () => {
    const titles = PUBLIC_PAGES.map((p) => p.metaTitle)
    expect(new Set(titles).size).toBe(titles.length)
    for (const p of PUBLIC_PAGES) {
      expect(p.metaDescription.length, p.path).toBeGreaterThanOrEqual(130)
      expect(p.metaDescription.length, p.path).toBeLessThanOrEqual(165)
      expect(p.metaDescription).not.toBe(p.metaTitle)
    }
  })

  it("builds metadata with an absolute canonical on the apex host, Open Graph and indexing", () => {
    const m = publicPageMetadata("/fonctionnalites", "https://www.benevol.app/")
    // The site name after a vertical bar, never an em dash (#747).
    expect(m.title).toEqual({ absolute: "Fonctionnalités pour organiser vos bénévoles | benevol.app" })
    expect(m.alternates?.canonical).toBe("https://www.benevol.app/fonctionnalites")
    expect(m.openGraph).toMatchObject({ url: "https://www.benevol.app/fonctionnalites", siteName: "benevol.app", type: "website", locale: "fr_CH" })
    expect(m.robots).toMatchObject({ index: true, follow: true })
    expect(publicPageMetadata("/doc/admin", "https://www.benevol.app").alternates?.canonical).toBe("https://www.benevol.app/doc/admin")
    expect(() => publicPageMetadata("/nope", "https://x")).toThrow()
  })
})

describe("every public page's link preview", () => {
  it("has a large social card of its own, the large Twitter card and no em dash in its title", () => {
    for (const p of PUBLIC_PAGES) {
      const m = publicPageMetadata(p.path, "https://www.benevol.app")
      const image = { url: `https://www.benevol.app/og-image.png${p.path}`, width: 1200, height: 630, type: "image/png", alt: `${p.title}, benevol.app` }
      expect(m.openGraph, p.path).toMatchObject({ type: "website", siteName: "benevol.app", locale: "fr_CH", images: [image] })
      expect(m.twitter, p.path).toMatchObject({ card: "summary_large_image", description: p.metaDescription, images: [image] })
      expect(JSON.stringify(m.title), p.path).not.toMatch(/[—·]/)
      expect(m.description, p.path).toBe(p.metaDescription)
    }
  })

  it("declares privacy and terms, written in their page.tsx (no Markdown source)", () => {
    expect(PUBLIC_PAGES.filter((p) => p.path.startsWith("/legal/")).map((p) => p.path)).toEqual(["/legal/privacy", "/legal/terms", "/legal/sous-traitance", "/legal/sous-traitants"])
    expect(PUBLIC_PAGES.find((p) => p.path === "/legal/privacy")?.source).toBeNull()
  })
})

describe("FEATURES.md, the source of /fonctionnalites", () => {
  const md = read("FEATURES.md")

  it("has one title and the main categories", () => {
    expect(md.match(/^# /gm)).toHaveLength(1)
    expect(splitTitle(md).title).toBe("Le planning de vos bénévoles, simplement")
    for (const h of ["Comment ça marche", "Préparer le planning", "Inscrire les bénévoles", "Garder chacun informé", "Voir où il manque du monde", "Tenir le jour J", "Après l'événement", "Vos membres et leurs données", "Démarrer"]) {
      expect(md).toContain(`## ${h}`)
    }
  })

  it("links the guides by file (readable on GitHub), rendered as site links", () => {
    expect(md).toContain("](GUIDE_ADMIN.md)")
    const site = linkSourcesToRoutes(md)
    expect(site).toContain("](/doc/admin)")
    expect(site).toContain("](/doc/benevole)")
    expect(site).not.toContain("](GUIDE_ADMIN.md)")
  })

  it("announces nothing that isn't built yet (audit of the open tickets)", () => {
    // The organization logo shipped with #300 and left this list.
    for (const future of [/recherche d'adresse/i, /QR/i, /photo/i, /ouverture programm/i, /aperçu avant import/i, /rôle organisateur/i]) {
      expect(md, String(future)).not.toMatch(future)
    }
  })

  it("announces the organization logo now that it is built (#300)", () => {
    expect(md).toMatch(/votre logo/)
  })

  it("is copied into the runtime image, like the guides", () => {
    expect(read("Dockerfile")).toContain("/app/FEATURES.md ./FEATURES.md")
  })
})

describe("/logiciel-planning-benevoles, the editorial page on volunteer scheduling (#767)", () => {
  const page = PUBLIC_PAGES.find((p) => p.path === "/logiciel-planning-benevoles")!

  it("is a public page rendered from its own source, copied into the image, outside the header navigation", () => {
    expect(page.source).toBe("LOGICIEL-PLANNING-BENEVOLES.md")
    expect(splitTitle(read(page.source!)).title).toBe(page.title)
    expect(CONTENT_NAV.map((p) => p.path)).not.toContain(page.path)
    expect(read("Dockerfile")).toContain("/app/LOGICIEL-PLANNING-BENEVOLES.md ./LOGICIEL-PLANNING-BENEVOLES.md")
  })

  it("has a title and a description that fit search results", () => {
    expect(metaLengthProblems(pageTitle(page.metaTitle), page.metaDescription)).toEqual([])
    expect(page.metaTitle.toLowerCase()).toContain("planning pour bénévoles")
  })

  it("is linked from the home and from /fonctionnalites (internal links), its source link made a site link", () => {
    expect(read("src/app/page.tsx")).toContain('href="/logiciel-planning-benevoles"')
    expect(read("FEATURES.md")).toContain("](LOGICIEL-PLANNING-BENEVOLES.md)")
    expect(linkSourcesToRoutes("[a](LOGICIEL-PLANNING-BENEVOLES.md)")).toBe("[a](/logiciel-planning-benevoles)")
  })

  it("renders its FAQ: answers as HTML with site links for the page, as plain text for the FAQPage", () => {
    const rendered = renderFeaturesPage(null, page.source!, page.title)
    expect(rendered.title).toBe("Logiciel de planning pour bénévoles")
    const faq = rendered.sections.find((s) => s.id === "questions-frequentes")!.faq!
    expect(faq.length).toBeGreaterThanOrEqual(6)
    const small = faq.find((q) => q.id === "est-ce-adapte-a-une-petite-association")!
    expect(small.html).toContain('href="/doc/premiers-pas"')
    expect(small.text).toContain("la liste des premiers pas vous guide")
    for (const q of faq) expect(q.text, q.question).not.toMatch(/[<>[\]*`]/)
  })
})

describe("/remplacer-tableur-benevoles, the editorial page for those leaving a spreadsheet (#767)", () => {
  const page = PUBLIC_PAGES.find((p) => p.path === "/remplacer-tableur-benevoles")!

  it("is a public page rendered from its own source, copied into the image, outside the header navigation", () => {
    expect(page.source).toBe("REMPLACER-TABLEUR-BENEVOLES.md")
    expect(splitTitle(read(page.source!)).title).toBe(page.title)
    expect(CONTENT_NAV.map((p) => p.path)).not.toContain(page.path)
    expect(read("Dockerfile")).toContain("/app/REMPLACER-TABLEUR-BENEVOLES.md ./REMPLACER-TABLEUR-BENEVOLES.md")
    expect(read(".dockerignore")).toMatch(/^!REMPLACER-TABLEUR-BENEVOLES\.md$/m)
  })

  it("has a title and a description that fit search results and name the spreadsheets people use", () => {
    expect(metaLengthProblems(pageTitle(page.metaTitle), page.metaDescription)).toEqual([])
    expect(page.metaDescription.length).toBeGreaterThanOrEqual(120)
    expect(page.metaTitle).toMatch(/tableur/i)
    expect(page.metaTitle).toMatch(/bénévoles/)
    expect(page.metaDescription).toContain("Excel")
    expect(page.metaDescription).toContain("Google Sheets")
  })

  it("is linked from /logiciel-planning-benevoles and from /fonctionnalites, its source link made a site link", () => {
    expect(read("LOGICIEL-PLANNING-BENEVOLES.md")).toContain("](REMPLACER-TABLEUR-BENEVOLES.md)")
    expect(read("FEATURES.md")).toContain("](REMPLACER-TABLEUR-BENEVOLES.md)")
    expect(linkSourcesToRoutes("[a](REMPLACER-TABLEUR-BENEVOLES.md)")).toBe("[a](/remplacer-tableur-benevoles)")
  })

  it("renders its FAQ: answers as HTML for the page, as plain text for the FAQPage", () => {
    const rendered = renderFeaturesPage(null, page.source!, page.title)
    expect(rendered.title).toBe("Remplacer le tableur des bénévoles")
    const faq = rendered.sections.find((s) => s.id === "questions-frequentes")!.faq!
    expect(faq.length).toBeGreaterThanOrEqual(6)
    const importing = faq.find((q) => q.id === "comment-importer-la-liste-des-benevoles")!
    expect(importing.html).toContain("<strong>Importer CSV/Excel</strong>")
    expect(importing.text).toContain("bouton Importer CSV/Excel, avec un fichier .xlsx ou .csv")
    for (const q of faq) expect(q.text, q.question).not.toMatch(/[<>[\]*`]/)
  })

  it("links its source sections to pages that exist", () => {
    const rendered = renderFeaturesPage(null, page.source!, page.title)
    const html = [rendered.intro, ...rendered.sections].flatMap((b) => b.parts).map((p) => (p.kind === "html" ? p.html : "")).join("")
    for (const href of ["/doc/gerer-les-membres", "/doc/creer-une-serie-de-creneaux", "/doc/exporter-et-conserver-ses-donnees", "/doc/partager-le-lien", "/doc/creer-son-premier-evenement", "/logiciel-planning-benevoles", "/fonctionnalites"]) {
      expect(html, href).toContain(`href="${href}"`)
    }
    expect(html).not.toMatch(/href="[^"]*\.md/)
  })
})

describe("linkSourcesToRoutes", () => {
  // GUIDE_BENEVOLE.md is the welcome of /doc/benevole since the split (#649): a link to it leads there.
  it("rewrites links to the root sources, an anchor kept, from the root or from guide/", () => {
    expect(linkSourcesToRoutes("[a](GUIDE_ADMIN.md) [b](GUIDE_BENEVOLE.md#confirmation)")).toBe("[a](/doc/admin) [b](/doc/benevole#confirmation)")
    expect(linkSourcesToRoutes("[a](../GUIDE_ADMIN.md#creer-un-evenement)")).toBe("[a](/doc/admin#creer-un-evenement)")
  })

  it("rewrites links to the documentation units (#649), by path from the root or relative from another unit", () => {
    expect(linkSourcesToRoutes("[a](guide/revenir-sur-la-page.md)")).toBe("[a](/doc/revenir-sur-la-page)")
    expect(linkSourcesToRoutes("[a](guide/confirmation.md#le-lien)")).toBe("[a](/doc/confirmation#le-lien)")
    expect(linkSourcesToRoutes("[a](confirmation.md#le-lien) et [b](s-inscrire.md)")).toBe("[a](/doc/confirmation#le-lien) et [b](/doc/s-inscrire)")
  })

  it("leaves other links alone: site paths, URLs, the guide index, files elsewhere", () => {
    const md = "[a](/doc/admin) [b](https://example.org/x.md) [c](README.md) [d](guide/README.md) [e](docs/retention.md) [f](SECURITY.md)"
    expect(linkSourcesToRoutes(md)).toBe(md)
  })

  // #757: CHANGELOG.md is the source of /nouveautes, a version's anchor kept (#762 links to one).
  it("rewrites a link to CHANGELOG.md to the public changelog", () => {
    expect(linkSourcesToRoutes("[a](CHANGELOG.md) [b](CHANGELOG.md#2.1.0)")).toBe("[a](/nouveautes) [b](/nouveautes#2.1.0)")
  })
})

describe("apexSitemap", () => {
  // Privacy and terms too (#747), like the data processing documents.
  it("lists the home, the features page, the legal pages and the documentation on the apex host, with the source file's date", () => {
    const d = new Date("2026-09-30T10:00:00Z")
    const entries = apexSitemap("https://www.benevol.app/", (src) => (src === "FEATURES.md" ? d : null))
    expect(entries[0]).toEqual({ url: "https://www.benevol.app/", changeFrequency: "weekly", priority: 1 })
    expect(entries.map((e) => e.url)).toEqual(["https://www.benevol.app/", "https://www.benevol.app/fonctionnalites", "https://www.benevol.app/logiciel-planning-benevoles", "https://www.benevol.app/remplacer-tableur-benevoles", "https://www.benevol.app/nouveautes", "https://www.benevol.app/accessibilite", "https://www.benevol.app/legal/privacy", "https://www.benevol.app/legal/terms", "https://www.benevol.app/legal/sous-traitance", "https://www.benevol.app/legal/sous-traitants", "https://www.benevol.app/doc", "https://www.benevol.app/doc/admin", "https://www.benevol.app/doc/benevole"])
    expect(entries.find((e) => e.url.endsWith("/fonctionnalites"))).toMatchObject({ lastModified: d, priority: 0.9 })
    expect(entries.find((e) => e.url.endsWith("/doc/benevole"))).not.toHaveProperty("lastModified")
  })

  it("lists the documentation units after the pages, with their own file's date (#649)", () => {
    const d = new Date("2026-10-01T10:00:00Z")
    const entries = apexSitemap("https://www.benevol.app", (src) => (src === "guide/b.md" ? d : null), [{ slug: "a", source: "guide/a.md" }, { slug: "b", source: "guide/b.md" }])
    expect(entries.slice(-2)).toEqual([
      { url: "https://www.benevol.app/doc/a", changeFrequency: "monthly", priority: DOC_UNIT_PRIORITY },
      { url: "https://www.benevol.app/doc/b", changeFrequency: "monthly", priority: DOC_UNIT_PRIORITY, lastModified: d },
    ])
  })
})
