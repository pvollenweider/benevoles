// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { CONTENT_NAV, PUBLIC_PAGES, apexSitemap, pageAvailable, publicPage } from "../doc-pages"
import { parseFaq, parseFeaturesPage } from "../features-page"
import { slugifyHeading } from "../heading-anchors"
import { metaLengthProblems } from "../meta-length"
import { pageTitle } from "../seo-metadata"

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf-8")

const PATH = "/continuite-du-service"
const page = publicPage(PATH)
const source = read(page.source!)
const parsed = parseFeaturesPage(source)
const section = (heading: string) => parsed.sections.find((candidate) => candidate.heading === heading)

// #1357: a trust page states facts that live elsewhere (legal pages, terms of use, other public
// pages). Each one is checked against its source, so the page never says more than they do.
describe("/continuite-du-service, the service continuity page (#1357)", () => {
  it("is a hosted presentation page rendered from CONTINUITE-DU-SERVICE.md, with metadata that fits search results", () => {
    expect(page).toMatchObject({
      path: PATH,
      title: "Continuité du service",
      source: "content/pages/CONTINUITE-DU-SERVICE.md",
      guide: false,
      presentation: true,
      availability: "hosted",
    })
    expect(page.audience).toBeUndefined()
    expect(pageAvailable(page, true)).toBe(true)
    expect(pageAvailable(page, false)).toBe(false)
    expect(metaLengthProblems(pageTitle(page.metaTitle), page.metaDescription)).toEqual([])
    expect(page.metaDescription.length).toBeGreaterThanOrEqual(120)
    expect(page.metaDescription.length).toBeLessThanOrEqual(160)
  })

  it("has the six settled sections, in order, and a FAQ the renderer can parse", () => {
    expect(parsed.sections.map((candidate) => candidate.heading)).toEqual([
      "Vos données sont sauvegardées et restent récupérables",
      "Votre planning reste utilisable même si le service ne répond pas",
      // #1387: the status page, served off the server.
      "Savoir si le service fonctionne",
      "Le logiciel ne vous enferme pas",
      "Les limites actuelles du service hébergé",
      "Questions fréquentes",
    ])
    const faq = parseFaq(section("Questions fréquentes")!.markdown, slugifyHeading)
    expect(faq).not.toBeNull()
    expect(faq!.length).toBe(3)
  })

  // The retention periods are those of the sub-processing agreement, the only place that sets them.
  it("gives the backup retention of the sub-processing agreement", () => {
    const agreement = read("content/legal/ACCORD-SOUS-TRAITANCE.md")
    expect(agreement).toMatch(/30 jours sur le serveur, 90 jours pour la copie hors site/)
    expect(source).toMatch(/30 jours sur le serveur et 90 jours pour la copie en Suisse/)
    // The same agreement rules out a partial restore.
    expect(agreement).toMatch(/sans restauration partielle possible/)
    expect(source).toMatch(/il n'est pas possible de restaurer les données d'une seule organisation/)
  })

  it("says of the off-site copy what the list of sub-processors says: encrypted, no key held by the provider", () => {
    const processors = read("content/legal/SOUS-TRAITANTS.md")
    expect(processors).toMatch(/Infomaniak n'a pas la clé de déchiffrement et ne peut pas lire leur contenu/)
    expect(source).toMatch(/Le prestataire qui la conserve n'a pas la clé et ne peut pas la lire/)
  })

  // No frequency is published for the restore test: the 90-day threshold of the code is a guard,
  // not a practice. A number here would be a promise nobody checked.
  it("states no frequency for the restore test", () => {
    const line = source.split("\n").find((candidate) => candidate.includes("restauration de la copie"))
    expect(line).toBeDefined()
    expect(line).toMatch(/testée régulièrement/)
    expect(line).not.toMatch(/\d/)
  })

  // The notice before a final shutdown is a commitment: the page and article 7 of the terms of use
  // give the same delay, and the terms keep the access of one organisation apart from it.
  it("gives the shutdown notice of the terms of use, article 7", () => {
    const terms = read("src/app/legal/terms/page.tsx").replace(/&apos;/g, "'").replace(/\s+/g, " ")
    expect(source).toMatch(/informées au moins trois mois à l'avance/)
    expect(terms).toMatch(/nous en informons les Organisations au moins trois mois à l'avance/)
    expect(terms).toMatch(/pas l'arrêt du Service lui-même/)
    expect(terms).toMatch(/aucune garantie de continuité/)
    expect(source).toMatch(/n'offre pas de garantie contractuelle de disponibilité/)
  })

  it("names the maintainer as the Manifesto does, and answers in the same paragraph", () => {
    expect(read("content/pages/MANIFESTE.md")).toMatch(/conçu et maintenu par Philippe Vollenweider/)
    const paragraph = source.split("\n\n").find((candidate) => candidate.includes("conçu et maintenu par Philippe Vollenweider"))
    expect(paragraph).toBeDefined()
    expect(paragraph).toMatch(/les données s'exportent, le logiciel est libre et peut être installé sur un autre serveur/)
  })

  // Installing on one's own server is stated as possible, never as easy, until a guide tested on a
  // blank machine exists (#761): no link to the operators' deployment document from this page.
  it("does not link to the deployment document", () => {
    expect(source).not.toMatch(/deploiement\.md/)
  })

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

  // A trust page: whoever asks the question finds it from the three pages that raise it; nobody is
  // led to it from the home page or the header.
  it("is linked from Tarifs, Logiciel libre and the Manifesto, with the same words, and from nowhere prominent", () => {
    const sentence = "La page [Continuité du service](CONTINUITE-DU-SERVICE.md) dit comment vos données sont sauvegardées et ce que le service ne garantit pas."
    for (const file of ["content/pages/TARIFS.md", "content/pages/LOGICIEL-LIBRE-BENEVOLES.md", "content/pages/MANIFESTE.md"]) {
      expect(read(file), file).toContain(sentence)
    }
    expect(read("content/pages/FAQ-ACCUEIL.md")).not.toContain("continuite")
    expect(CONTENT_NAV.map((candidate) => candidate.path)).not.toContain(PATH)
  })

  it("is in the sitemap on the hosted service only", () => {
    const base = "https://www.benevol.app"
    expect(PUBLIC_PAGES.filter((candidate) => candidate.path === PATH)).toHaveLength(1)
    expect(apexSitemap(base, () => null, [], true).map((entry) => entry.url)).toContain(`${base}${PATH}`)
    expect(apexSitemap(base, () => null, [], false).map((entry) => entry.url)).not.toContain(`${base}${PATH}`)
  })
})
