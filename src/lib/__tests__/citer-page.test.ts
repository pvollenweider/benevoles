// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { CONTENT_NAV, PUBLIC_PAGES, apexSitemap, pageAvailable, publicPage } from "../doc-pages"
import { parseFeaturesPage } from "../features-page"
import { metaLengthProblems } from "../meta-length"
import { pageTitle } from "../seo-metadata"
import { CONTACT_EMAIL, REPOSITORY_URL } from "../structured-data"

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf-8")
const source = read("content/pages/CITER.md")
const page = publicPage("/citer")
const citations = parseFeaturesPage(source).sections.flatMap((section) => section.citations)
const byHeading = new Map(citations.map((citation) => [citation.heading, citation]))

// #1323: the page and its descriptions must stay honest: the exact name, lengths that fit an
// article or a directory listing, the instance's own contact and code, and the same hosting facts.
describe("/citer, the citation page (#1323)", () => {
  it("is a hosted presentation page rendered from CITER.md, with metadata that fits search results", () => {
    expect(page).toMatchObject({ path: "/citer", title: "Citer benevol.app", source: "content/pages/CITER.md", priority: 0.4, presentation: true, availability: "hosted" })
    expect(pageAvailable(page, true)).toBe(true)
    expect(pageAvailable(page, false)).toBe(false)
    expect(metaLengthProblems(pageTitle(page.metaTitle), page.metaDescription)).toEqual([])
    expect(page.metaDescription.length).toBeGreaterThanOrEqual(120)
    expect(page.metaDescription.length).toBeLessThanOrEqual(160)
  })

  it("marks the four citations of CITER.md, three in French and one in English", () => {
    expect(citations.map((citation) => [citation.heading, citation.lang])).toEqual([
      ["En une phrase", "fr"],
      ["En quelques lignes", "fr"],
      ["En un paragraphe", "fr"],
      ["En anglais", "en"],
    ])
  })

  it("keeps each citation within the length of the text it promises", () => {
    expect(byHeading.get("En une phrase")!.text.length).toBeLessThanOrEqual(170)
    expect(byHeading.get("En quelques lignes")!.text.length).toBeLessThanOrEqual(280)
    expect(byHeading.get("En un paragraphe")!.text.length).toBeLessThanOrEqual(560)
    expect(byHeading.get("En anglais")!.text.length).toBeLessThanOrEqual(300)
  })

  it("gives the instance's contact address, the code's repository and the AGPL licence", () => {
    // On an instance, the source is localised at render time (src/lib/site.ts): the fallback is the
    // upstream address the file carries.
    expect(source).toContain(CONTACT_EMAIL ?? "contact@benevol.app")
    expect(source).toContain(REPOSITORY_URL)
    expect(source).toMatch(/\bAGPL\b/)
  })

  it("states the same two hosting countries as FEATURES.md", () => {
    const citerHosting = source.match(/développé en (Suisse)[^.]*hébergé en (France)/i)
    const featuresHosting = read("content/pages/FEATURES.md").match(/Développé en (Suisse), hébergé en (France)/i)
    expect(citerHosting?.slice(1)).toEqual(["Suisse", "France"])
    expect(featuresHosting?.slice(1)).toEqual(citerHosting?.slice(1))
  })

  it("is in the sitemap on the hosted service only, and not in the header navigation", () => {
    const base = "https://www.benevol.app"
    expect(PUBLIC_PAGES.filter((candidate) => candidate.path === "/citer")).toHaveLength(1)
    expect(apexSitemap(base, () => null, [], true).map((entry) => entry.url)).toContain(`${base}/citer`)
    expect(apexSitemap(base, () => null, [], false).map((entry) => entry.url)).not.toContain(`${base}/citer`)
    expect(CONTENT_NAV.map((candidate) => candidate.path)).not.toContain("/citer")
  })
})
