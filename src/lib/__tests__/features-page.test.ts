// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import fs from "fs"
import path from "path"
import { describe, it, expect } from "vitest"
import { mailtoAddress, parseFeatureBlock, parseFeaturesPage, parseSteps } from "../features-page"
import { loadVideoCatalog } from "../video-catalog-load"
import { resolveVideoReference } from "../video-catalog"

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf-8")

describe("parseFeatureBlock", () => {
  it("takes the actions list out of the Markdown, in order", () => {
    const block = parseFeatureBlock("Texte.\n\n<!-- actions -->\n- [Demander](mailto:a@b.c)\n- [Voir](#comment)\n\nSuite.")
    expect(block.actions).toEqual([
      { label: "Demander", href: "mailto:a@b.c" },
      { label: "Voir", href: "#comment" },
    ])
    expect(block.markdown).toBe("Texte.\n\nSuite.")
  })

  it("reads an image's video id and alt text, and drops a malformed one", () => {
    const block = parseFeatureBlock("<!-- image: STAFFING_GAPS | Les créneaux à compléter -->\n<!-- image: lower_case | non -->\nTexte.")
    expect(block.images).toEqual([{ videoId: "STAFFING_GAPS", alt: "Les créneaux à compléter" }])
    expect(block.markdown).toBe("Texte.")
  })

  it("keeps a video line where it stands, and lists its id", () => {
    const block = parseFeatureBlock("- **Un** point.\n\n<!-- video: EVENT_REPORTS -->\n\nEn savoir plus.")
    expect(block.videos).toEqual(["EVENT_REPORTS"])
    expect(block.markdown).toBe("- **Un** point.\n\n<!-- video: EVENT_REPORTS -->\n\nEn savoir plus.")
  })

  it("stops the actions at the first line that isn't a link item", () => {
    const block = parseFeatureBlock("<!-- actions -->\n- [Un](/un)\n- pas un lien\n")
    expect(block.actions).toEqual([{ label: "Un", href: "/un" }])
    expect(block.markdown).toBe("- pas un lien")
  })
})

describe("parseSteps", () => {
  it("reads « 1. **Title.** text » items", () => {
    expect(parseSteps("1. **Préparez.** Le planning.\n2. **Partagez.** Le lien.")).toEqual([
      { title: "Préparez.", text: "Le planning." },
      { title: "Partagez.", text: "Le lien." },
    ])
  })

  it("is null for anything else: bullets, a paragraph, an item without a bold title", () => {
    expect(parseSteps("- **Un** point.")).toBeNull()
    expect(parseSteps("Un paragraphe.")).toBeNull()
    expect(parseSteps("1. Sans titre.")).toBeNull()
    expect(parseSteps("")).toBeNull()
  })
})

describe("parseFeaturesPage", () => {
  it("splits the title, the opening and the sections, with the site's heading anchors", () => {
    const page = parseFeaturesPage("# Titre\n\nOuverture.\n\n## Comment ça marche\n\n1. **Un.** a\n\n## Après l'événement\n\n- b\n")
    expect(page.title).toBe("Titre")
    expect(page.intro.markdown).toBe("Ouverture.")
    expect(page.sections.map((s) => [s.heading, s.id])).toEqual([
      ["Comment ça marche", "comment-ca-marche"],
      ["Après l'événement", "apres-l-evenement"],
    ])
    expect(page.sections[0].steps).toEqual([{ title: "Un.", text: "a" }])
    expect(page.sections[1].steps).toBeNull()
  })
})

describe("mailtoAddress", () => {
  it("gives the address of a mailto link, without its query", () => {
    expect(mailtoAddress("mailto:contact@benevol.app?subject=Bonjour")).toBe("contact@benevol.app")
    expect(mailtoAddress("/doc")).toBeNull()
  })
})

describe("FEATURES.md, as /fonctionnalites lays it out", () => {
  const page = parseFeaturesPage(read("FEATURES.md"))
  const catalog = loadVideoCatalog()

  it("opens with the promise, two actions (the email request first) and the presentation video", () => {
    expect(page.title).toBe("Le planning de vos bénévoles, simplement")
    expect(page.intro.actions[0].label).toBe("Demander un espace")
    expect(page.intro.actions[0].href).toMatch(/^mailto:contact@benevol\.app\?subject=[^\s()]+&body=[^\s()]+$/)
    expect(page.intro.actions[1].href).toBe("#comment-ca-marche")
    expect(page.intro.videos).toHaveLength(1)
  })

  it("says what decides: free, open source, no account for the volunteers", () => {
    const text = read("FEATURES.md")
    for (const words of [/gratuit/i, /open source/i, /sans compte/i, /hébergé en France/i]) expect(text).toMatch(words)
  })

  it("has the decision page's sections, « Comment ça marche » drawn as three steps", () => {
    expect(page.sections.map((s) => s.id)).toEqual([
      "comment-ca-marche",
      "preparer-le-planning",
      "inscrire-les-benevoles",
      "garder-chacun-informe",
      "voir-ou-il-manque-du-monde",
      "tenir-le-jour-j",
      "apres-l-evenement",
      "vos-membres-et-leurs-donnees",
      "a-l-image-de-votre-association",
      "un-outil-sur-lequel-compter",
      "se-former",
      "demarrer",
      "ce-que-benevol-app-ne-fait-pas-volontairement",
    ])
    expect(page.sections[0].steps).toHaveLength(3)
  })

  it("ends with the email request again", () => {
    const start = page.sections.find((s) => s.id === "demarrer")!
    expect(start.actions[0]).toEqual(page.intro.actions[0])
  })

  it("only shows stills and videos of published tutorials that have a poster", () => {
    const blocks = [page.intro, ...page.sections]
    const images = blocks.flatMap((b) => b.images)
    expect(images.length).toBeGreaterThanOrEqual(7)
    for (const image of images) {
      const video = resolveVideoReference(image.videoId, catalog)
      expect(video?.published, image.videoId).toBe(true)
      expect(video?.render?.poster, image.videoId).toBe(true)
      expect(image.alt.length, image.videoId).toBeGreaterThan(20)
    }
    for (const id of blocks.flatMap((b) => b.videos)) expect(resolveVideoReference(id, catalog)?.published, id).toBe(true)
  })

  it("says « étiquette », never « tag », like the rest of the page", () => {
    expect(read("FEATURES.md")).not.toMatch(/\btags?\b/i)
  })
})
