// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import fs from "fs"
import path from "path"
import { describe, it, expect } from "vitest"
import { actionHref, mailtoAddress, parseFaq, parseFaqSource, parseFeatureBlock, parseFeaturesPage, parseSteps, plainAnswer } from "../features-page"
import { splitTitle } from "../doc-pages"
import { createHeadingSlugger } from "../heading-anchors"
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

// #872: the audience pages show real captures of public/doc-img, which need no media server.
describe("parseFeatureBlock, documentation screenshots", () => {
  it("takes a /doc-img screenshot alone on its line out of the Markdown, with its alt text", () => {
    const block = parseFeatureBlock("Texte.\n\n![La frise  des créneaux](/doc-img/admin-shifts.png)\n\nSuite.")
    expect(block.screenshots).toEqual([{ src: "/doc-img/admin-shifts.png", alt: "La frise des créneaux" }])
    expect(block.markdown).toBe("Texte.\n\nSuite.")
  })

  it("leaves any other image in the text: inline, elsewhere than /doc-img, or without alt text", () => {
    const md = "Voir ![a](/doc-img/a.png) ici.\n\n![b](https://example.org/b.png)\n\n![](/doc-img/c.png)\n\n![d](/doc-img/../d.png)"
    const block = parseFeatureBlock(md)
    expect(block.screenshots).toEqual([])
    expect(block.markdown).toBe(md)
  })
})

describe("parseFaqSource and the draft marker (#951)", () => {
  it("reads a file made only of questions, its title and comments aside", () => {
    const source = "<!-- BROUILLON : à relire -->\n<!-- Une note. -->\n\n# Questions\n\n### Gratuit ?\n\nOui.\n\n### Un compte ?\n\nNon, un [lien](TARIFS.md).\n"
    expect(parseFaqSource(source)).toEqual({
      title: "Questions",
      questions: [
        { question: "Gratuit ?", id: "gratuit", answer: "Oui." },
        { question: "Un compte ?", id: "un-compte", answer: "Non, un [lien](TARIFS.md)." },
      ],
    })
    expect(parseFaqSource("# Titre\n\nUn paragraphe.\n")).toBeNull()
  })

  it("lets a comment line stand before the first question of a FAQ section", () => {
    const faq = parseFaq("<!-- BROUILLON -->\n\n### Q ?\n\nR.", createHeadingSlugger())
    expect(faq).toEqual([{ question: "Q ?", id: "q", answer: "R." }])
  })

  it("drops the comments before a source's title, so the draft marker is never the title nor rendered", () => {
    expect(splitTitle("<!-- BROUILLON -->\n\n# Titre\nCorps.\n")).toEqual({ title: "Titre", body: "Corps.\n" })
    expect(splitTitle("Pas de titre.\n")).toEqual({ title: null, body: "Pas de titre.\n" })
    expect(parseFeaturesPage("<!-- BROUILLON -->\n\n# Titre\n\nIntro.\n").intro.markdown).toBe("Intro.")
  })
})

describe("actionHref (#759)", () => {
  it("turns a link to a source file into the page that serves it", () => {
    expect(actionHref("guide/premiers-pas.md")).toBe("/doc/premiers-pas")
    expect(actionHref("guide/premiers-pas.md#la-liste")).toBe("/doc/premiers-pas#la-liste")
    expect(actionHref("GUIDE_ADMIN.md")).toBe("/doc/admin")
  })

  it("leaves every other address as it is", () => {
    for (const href of ["mailto:a@b.c?subject=x", "#comment", "/videos", "https://github.com/x/y"]) expect(actionHref(href)).toBe(href)
  })

  it("a source link in an actions list becomes a site link, not a file path that 404s", () => {
    const block = parseFeatureBlock("<!-- actions -->\n- [Lire](guide/premiers-pas.md)\n")
    expect(block.actions).toEqual([{ label: "Lire", href: "/doc/premiers-pas" }])
  })

  it("no action of FEATURES.md points at a Markdown file", () => {
    const page = parseFeaturesPage(read("FEATURES.md"))
    const hrefs = [page.intro, ...page.sections].flatMap((b) => b.actions.map((a) => a.href))
    expect(hrefs.length).toBeGreaterThan(0)
    for (const href of hrefs) expect(href, href).not.toMatch(/\.md(#|$)/)
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

describe("parseFaq (#767)", () => {
  it("reads « ### Question » headings with the answer below each one, anchored by the page's slugger", () => {
    const slug = createHeadingSlugger()
    expect(parseFaq("### Est-ce gratuit ?\n\nOui.\n\n### Faut-il un compte ?\n\nNon. Un [lien](/doc) suffit.\n", slug)).toEqual([
      { question: "Est-ce gratuit ?", id: "est-ce-gratuit", answer: "Oui." },
      { question: "Faut-il un compte ?", id: "faut-il-un-compte", answer: "Non. Un [lien](/doc) suffit." },
    ])
  })

  it("is null for anything else: text before the first question, a question without answer, a deeper heading", () => {
    const slug = createHeadingSlugger()
    expect(parseFaq("Intro.\n\n### Q ?\n\nR.", slug)).toBeNull()
    expect(parseFaq("### Q ?\n\n### R ?\n\nOui.", slug)).toBeNull()
    expect(parseFaq("### Q ?\n\nR.\n\n#### Détail\n\nX.", slug)).toBeNull()
    expect(parseFaq("- un point", slug)).toBeNull()
    expect(parseFaq("", slug)).toBeNull()
  })

  it("uses no anchor for a section that turns out not to be a FAQ", () => {
    const slug = createHeadingSlugger()
    parseFaq("### Q ?\n\nR.\n\n### Sans réponse", slug)
    expect(slug("Q ?")).toBe("q")
  })

  it("makes a source's FAQ section a list of questions, and leaves the other sections alone", () => {
    const page = parseFeaturesPage("# T\n\n## Étapes\n\n1. **Un.** a\n\n## Questions fréquentes\n\n### Gratuit ?\n\nOui.\n")
    expect(page.sections[0].faq).toBeNull()
    expect(page.sections[1]).toMatchObject({ id: "questions-frequentes", steps: null, faq: [{ question: "Gratuit ?", id: "gratuit", answer: "Oui." }] })
  })
})

describe("plainAnswer (#767)", () => {
  it("keeps the words the page shows: link text, no emphasis or code marks, one line", () => {
    expect(plainAnswer("Oui. La page [Créer son premier événement](guide/creer.md) vous **mène** au `lien`.\n\nEnsuite *tout* va.")).toBe(
      "Oui. La page Créer son premier événement vous mène au lien. Ensuite tout va.",
    )
  })

  it("drops list marks, comment lines and images", () => {
    expect(plainAnswer("- un\n- deux\n1. trois\n<!-- video: X -->\n![alt](/x.png)")).toBe("un deux trois")
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

  it("opens with the promise, two actions (the sign-up first, #810) and the presentation video", () => {
    expect(page.title).toBe("Le planning de vos bénévoles, simplement")
    expect(page.intro.actions[0].label).toBe("Demander un espace")
    expect(page.intro.actions[0].href).toBe("/inscription")
    expect(page.intro.actions[1].href).toBe("#comment-ca-marche")
    expect(page.intro.videos).toHaveLength(1)
  })

  it("says what decides: free, open source, no account for the volunteers", () => {
    const text = read("FEATURES.md")
    for (const words of [/gratuit/i, /open source/i, /sans compte/i, /hébergé en France/i, /développé en Suisse/i]) expect(text).toMatch(words)
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
      "questions-frequentes",
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

  // #951: a short FAQ of its own, also its FAQPage structured data (the draft marker is no question).
  it("has one FAQ section of four to six questions, each with its answer", () => {
    const faqs = page.sections.filter((s) => s.faq !== null)
    expect(faqs.map((s) => s.id)).toEqual(["questions-frequentes"])
    const questions = faqs[0].faq!
    expect(questions.length).toBeGreaterThanOrEqual(4)
    expect(questions.length).toBeLessThanOrEqual(6)
    for (const q of questions) {
      expect(q.question, q.id).toMatch(/\?$/)
      expect(q.answer, q.id).not.toContain("BROUILLON")
    }
  })
})

describe("LOGICIEL-PLANNING-BENEVOLES.md, the editorial page on volunteer scheduling (#767)", () => {
  const source = read("LOGICIEL-PLANNING-BENEVOLES.md")
  const page = parseFeaturesPage(source)
  const catalog = loadVideoCatalog()
  const features = parseFeaturesPage(read("FEATURES.md"))

  it("answers the search with its title, then asks for a space by email, like /fonctionnalites", () => {
    expect(page.title).toBe("Logiciel de planning pour bénévoles")
    expect(page.intro.actions[0]).toEqual(features.intro.actions[0])
    expect(page.intro.actions[1].href).toBe("#questions-frequentes")
    expect(page.sections.find((s) => s.id === "demarrer")!.actions[0]).toEqual(features.intro.actions[0])
  })

  it("covers the organiser, the volunteer, the day itself, the hours after, trust, then a FAQ", () => {
    expect(page.sections.map((s) => s.id)).toEqual([
      "le-principe-en-trois-etapes",
      "pour-l-organisateur-postes-creneaux-et-frise",
      "pour-le-benevole-un-lien-sans-compte-ni-application",
      "avant-l-evenement-voir-ou-il-manque-du-monde",
      "le-jour-j-feuilles-imprimees-et-page-sur-le-telephone",
      "apres-l-evenement-heures-attestation-et-exports",
      "un-outil-sur-lequel-compter",
      "questions-frequentes",
      "demarrer",
    ])
    expect(page.sections[0].steps).toHaveLength(3)
  })

  it("answers the questions people ask before choosing, every answer short enough to read", () => {
    const faq = page.sections.find((s) => s.id === "questions-frequentes")!.faq!
    expect(faq.map((q) => q.question)).toEqual([
      "Est-ce vraiment gratuit ?",
      "Est-ce adapté à une petite association ?",
      "Les bénévoles doivent-ils créer un compte ?",
      "Faut-il installer une application ?",
      "Peut-on compter les heures de bénévolat pour un financeur ?",
      "Est-ce adapté à une fête de village ou à un festival ?",
      "Comment commencer ?",
    ])
    for (const q of faq) expect(plainAnswer(q.answer).length, q.question).toBeLessThan(400)
  })

  it("only shows the stills /fonctionnalites already shows, and published videos", () => {
    const shown = new Set([features.intro, ...features.sections].flatMap((b) => b.images.map((i) => i.videoId)))
    const blocks = [page.intro, ...page.sections]
    const images = blocks.flatMap((b) => b.images)
    expect(images.length).toBeGreaterThanOrEqual(4)
    for (const image of images) {
      expect(shown.has(image.videoId), image.videoId).toBe(true)
      expect(image.alt.length, image.videoId).toBeGreaterThan(20)
    }
    for (const id of blocks.flatMap((b) => b.videos)) expect(resolveVideoReference(id, catalog)?.published, id).toBe(true)
  })

  it("announces nothing that isn't built and keeps the site's writing rules", () => {
    // No native app, no time clock or location, no perks (#749): none is built.
    for (const future of [/pointeuse/i, /\bGPS\b/, /géolocalis/i, /avantages? (pour|aux) (les )?bénévoles/i, /App Store|Google Play/i, /application mobile/i]) {
      expect(source, String(future)).not.toMatch(future)
    }
    expect(source).not.toMatch(/—/)
    expect(source).not.toMatch(/\btags?\b/i)
  })
})
