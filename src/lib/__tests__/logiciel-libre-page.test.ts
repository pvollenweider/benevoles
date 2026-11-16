// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { CONTENT_NAV, PUBLIC_PAGES, apexSitemap, pageAvailable, publicPage } from "../doc-pages"
import { parseFeaturesPage } from "../features-page"
import { slugifyHeading } from "../heading-anchors"
import { metaLengthProblems } from "../meta-length"
import { pageTitle } from "../seo-metadata"
import { REPOSITORY_URL } from "../structured-data"

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf-8")

const page = publicPage("/logiciel-libre-benevoles")
const source = read(page.source!)
const parsed = parseFeaturesPage(source)
const citations = parsed.sections.flatMap((section) => section.citations)

// #1326: the free software page must stay honest and self-consistent: its licence and code, the
// service's hosting countries, citations that fit a quote, links that resolve, and no product it
// does not name.
describe("/logiciel-libre-benevoles, the free software page (#1326)", () => {
  it("is a hosted presentation page rendered from LOGICIEL-LIBRE-BENEVOLES.md, with metadata that fits search results", () => {
    expect(page).toMatchObject({
      path: "/logiciel-libre-benevoles",
      title: "Logiciel libre",
      metaTitle: "Logiciel libre pour le planning des bénévoles",
      source: "content/pages/LOGICIEL-LIBRE-BENEVOLES.md",
      priority: 0.6,
      guide: false,
      presentation: true,
      availability: "hosted",
    })
    // Not an audience page (#872): no « Pour qui ? » entry, no breadcrumb under its index.
    expect(page.audience).toBeUndefined()
    expect(pageAvailable(page, true)).toBe(true)
    expect(pageAvailable(page, false)).toBe(false)
    expect(metaLengthProblems(pageTitle(page.metaTitle), page.metaDescription)).toEqual([])
    expect(page.metaDescription.length).toBeGreaterThanOrEqual(120)
    expect(page.metaDescription.length).toBeLessThanOrEqual(160)
  })

  it("names the AGPL licence and links the repository exported by src/lib/structured-data.ts", () => {
    expect(source).toMatch(/\bAGPL\b/)
    expect(source).toContain(REPOSITORY_URL)
  })

  // The service's countries are FEATURES.md's: developed in Switzerland, hosted in France, with an
  // encrypted backup in Switzerland. A page never claims another place for the same data.
  it("names the same countries as FEATURES.md, encrypted backup in Switzerland included", () => {
    const hosting = /développé en ([A-Za-zÀ-ÿ]+)[^.]*hébergé en ([A-Za-zÀ-ÿ]+)[^.]*sauvegarde chiffrée en ([A-Za-zÀ-ÿ]+)/i
    const features = read("content/pages/FEATURES.md").match(hosting)?.slice(1)
    expect(features).toEqual(["Suisse", "France", "Suisse"])
    expect(source.match(hosting)?.slice(1)).toEqual(features)
  })

  it("marks the two citations, the English one as en, and keeps both within a quotable length", () => {
    expect(citations).toHaveLength(2)
    expect(citations.find((citation) => citation.lang === "en")).toBeDefined()
    expect(citations.find((citation) => citation.lang === "fr")).toBeDefined()
    for (const citation of citations) expect(citation.text.length, citation.lang).toBeLessThanOrEqual(300)
  })

  // Every relative link of the source is a file of the repository, and its anchor a heading of that
  // file: `linkSourcesToRoutes` then turns it into the page's site link.
  it("links only to source files that exist, anchors included", () => {
    const links = [...source.matchAll(/\]\(([^)\s]+)\)/g)].map((match) => match[1])
    const relative = links.filter((href) => !href.startsWith("/") && !href.startsWith("#") && !/^[a-z][a-z0-9+.-]*:/i.test(href))
    expect(relative.length).toBeGreaterThan(0)
    for (const href of relative) {
      const [file, anchor] = href.split("#")
      const target = path.resolve(path.dirname(page.source!), file)
      expect(fs.existsSync(target), href).toBe(true)
      if (!anchor) continue
      const headings = [...read(path.relative(process.cwd(), target)).matchAll(/^#{1,6} +(.+?) *#*$/gm)].map((match) => slugifyHeading(match[1]))
      expect(headings, href).toContain(anchor)
    }
  })

  // The section names needs the page leaves to other tools, never a product it recommends: no link,
  // and no action, in that section.
  it("leaves « Ce qu'il laisse à d'autres outils » without a link", () => {
    const section = parsed.sections.find((candidate) => candidate.heading === "Ce qu'il laisse à d'autres outils")
    expect(section).toBeDefined()
    expect(section!.markdown).not.toContain("](")
    expect(section!.actions).toEqual([])
  })

  it("is in the sitemap on the hosted service only, and not in the header navigation", () => {
    const base = "https://www.benevol.app"
    expect(PUBLIC_PAGES.filter((candidate) => candidate.path === "/logiciel-libre-benevoles")).toHaveLength(1)
    expect(apexSitemap(base, () => null, [], true).map((entry) => entry.url)).toContain(`${base}/logiciel-libre-benevoles`)
    expect(apexSitemap(base, () => null, [], false).map((entry) => entry.url)).not.toContain(`${base}/logiciel-libre-benevoles`)
    expect(CONTENT_NAV.map((candidate) => candidate.path)).not.toContain("/logiciel-libre-benevoles")
  })
})
