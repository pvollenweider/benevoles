import { describe, it, expect } from "vitest"
import { createHeadingSlugger, RESERVED_HEADING_IDS, slugifyHeading } from "../heading-anchors"
import { PUBLIC_PAGES } from "../doc-pages"
import { renderPublicSource } from "../public-content"
import { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"

// #568: stable heading anchors for the public guides.
describe("slugifyHeading", () => {
  it("removes nested or split markup completely, never leaving a tag behind", () => {
    for (const tricky of ["<scr<script>ipt>Titre</scr<b>ipt>", "a <<b>em>b", "<<script>script>x"]) {
      expect(slugifyHeading(tricky)).toMatch(/^[a-z0-9-]+$/)
    }
    expect(slugifyHeading("<em>Créer</em> un <strong>événement</strong>")).toBe("creer-un-evenement")
  })

  it("lowercases, drops accents and joins words with hyphens", () => {
    expect(slugifyHeading("Configurer les créneaux")).toBe("configurer-les-creneaux")
    expect(slugifyHeading("Inviter des membres à un événement")).toBe("inviter-des-membres-a-un-evenement")
  })

  it("turns apostrophes and punctuation into a single hyphen, none at the ends", () => {
    expect(slugifyHeading("Gérer l'équipe admin")).toBe("gerer-l-equipe-admin")
    expect(slugifyHeading("Activer la liste d’attente")).toBe("activer-la-liste-d-attente")
    expect(slugifyHeading("Où manque-t-il du monde ?")).toBe("ou-manque-t-il-du-monde")
    expect(slugifyHeading("Brouillon, publié, répertorié, archivé")).toBe("brouillon-publie-repertorie-archive")
  })

  it("spells out œ and æ instead of dropping them", () => {
    expect(slugifyHeading("Un coup d'œil")).toBe("un-coup-d-oeil")
  })

  it("ignores inline tags and HTML entities", () => {
    expect(slugifyHeading("Le champ <code>slug</code>")).toBe("le-champ-slug")
    expect(slugifyHeading("Activer la liste d&#39;attente")).toBe("activer-la-liste-d-attente")
  })

  it("keeps digits", () => {
    expect(slugifyHeading("Heures par bénévole, pour une période (CSV)")).toBe("heures-par-benevole-pour-une-periode-csv")
    expect(slugifyHeading("Rappels J-2")).toBe("rappels-j-2")
  })
})

describe("createHeadingSlugger", () => {
  it("numbers a repeated heading so anchors stay unique within the page", () => {
    const slug = createHeadingSlugger()
    expect(slug("Archiver")).toBe("archiver")
    expect(slug("Archiver")).toBe("archiver-2")
    expect(slug("Archiver")).toBe("archiver-3")
  })

  it("never reuses an anchor, even when a heading's own slug looks numbered", () => {
    const slug = createHeadingSlugger()
    expect(slug("Étape")).toBe("etape")
    expect(slug("Étape 2")).toBe("etape-2")
    expect(slug("Étape")).toBe("etape-3")
  })

  it("gives a heading without letters or digits a fallback anchor", () => {
    const slug = createHeadingSlugger()
    expect(slug("?")).toBe("section")
    expect(slug("…")).toBe("section-2")
  })

  it("starts over for each page", () => {
    expect(createHeadingSlugger()("Archiver")).toBe("archiver")
    expect(createHeadingSlugger()("Archiver")).toBe("archiver")
  })

  it("never gives a heading an id the page frame already uses, such as the skip link's « main »", () => {
    expect(RESERVED_HEADING_IDS).toContain(MAIN_CONTENT_ID)
    const slug = createHeadingSlugger()
    expect(slug("Main")).toBe("main-2")
    expect(slug("Main")).toBe("main-3")
  })
})

describe("public content sources", () => {
  const sources = PUBLIC_PAGES.map((p) => p.source).filter((s): s is string => !!s)

  it.each(sources)("%s: heading ids are unique and never a reserved id", (source) => {
    const { html } = renderPublicSource(source, "")
    const ids = [...html.matchAll(/<h[1-6] id="([^"]+)"/g)].map((m) => m[1])
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
    for (const reserved of RESERVED_HEADING_IDS) expect(ids).not.toContain(reserved)
  })
})
