import { describe, it, expect } from "vitest"
import fs from "fs"
import path from "path"
import { metaLengthProblems } from "../meta-length"
import { pageTitle } from "../seo-metadata"
import { AUDIENCE_INDEX_PATH, AUDIENCE_PAGES, CONTENT_NAV, PUBLIC_PAGES, audienceNav, linkSourcesToRoutes, publicPage, splitTitle } from "../doc-pages"
import { featuresPageFaq, renderFaqSource, renderFeaturesPage } from "../public-content"
import { parseFeaturesPage } from "../features-page"
import { publicPageJsonLd } from "../structured-data"
import { loadVideoCatalog } from "../video-catalog-load"
import { readDocUnits } from "../doc-units"
import { LANDING_FAQ_SOURCE } from "../landing-seo"

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf-8")
const BASE = "https://www.benevol.app"

/** The new editorial pages: the audience pages (#872), their index and the pricing page (#950). */
const EDITORIAL = [AUDIENCE_INDEX_PATH, ...AUDIENCE_PAGES.map((p) => p.path), "/tarifs"]

describe("the audience pages (#872)", () => {
  it("are the first four situations, in the order of the « Pour qui ? » list, then their index", () => {
    expect(AUDIENCE_PAGES.map((p) => p.path)).toEqual([
      "/benevoles-fete-de-village",
      "/benevoles-festival",
      "/benevoles-manifestation-sportive",
      "/planning-permanences-benevoles",
    ])
    expect(audienceNav(true).map((l) => l.path)).toEqual([...AUDIENCE_PAGES.map((p) => p.path), AUDIENCE_INDEX_PATH])
    expect(audienceNav(true).at(-1)?.title).toBe("Toutes les situations")
  })

  // #760: the hosted service's own pages; another instance shows no « Pour qui ? » entry at all.
  it("are the hosted service's pages only, and leave the header list empty elsewhere", () => {
    for (const path of EDITORIAL) expect(publicPage(path).availability, path).toBe("hosted")
    expect(audienceNav(false)).toEqual([])
  })

  it("stay out of the plain header links: they live under the « Pour qui ? » disclosure", () => {
    expect(CONTENT_NAV.map((p) => p.path)).toEqual(["/fonctionnalites", "/doc/admin", "/doc/benevole", "/blog"])
  })

  it("are each linked from the index page, the index from the home, the features page and the editorial page", () => {
    const index = linkSourcesToRoutes(read("content/pages/POUR-QUI.md"))
    for (const page of AUDIENCE_PAGES) expect(index, page.path).toContain(`](${page.path})`)
    expect(read("src/app/page.tsx")).toContain('href="/pour-qui"')
    for (const source of ["content/pages/FEATURES.md", "content/pages/LOGICIEL-PLANNING-BENEVOLES.md"]) expect(linkSourcesToRoutes(read(source)), source).toContain("](/pour-qui)")
  })
})

// #760: a self-hosted instance has no presentation page; a shared source must not link to a 404.
describe("links to the presentation pages from a shared source", () => {
  const md = "[a](TARIFS.md) [b](POUR-QUI.md#une-fete-de-village) [c](LOGICIEL-PLANNING-BENEVOLES.md) [d](content/guide/rappels.md) [e](GUIDE_ADMIN.md) [f](FEATURES.md) [g](/videos/SHIFT_RECURRENCE) [h](CHANGELOG.md)"

  it("stay relative on the hosted service", () => {
    expect(linkSourcesToRoutes(md, true)).toBe("[a](/tarifs) [b](/pour-qui#une-fete-de-village) [c](/logiciel-planning-benevoles) [d](/doc/rappels) [e](/doc/admin) [f](/fonctionnalites) [g](/videos/SHIFT_RECURRENCE) [h](/nouveautes)")
  })

  it("point at the hosted service on another instance; documentation, videos and the instance's own pages stay relative", () => {
    expect(linkSourcesToRoutes(md, false)).toBe(
      "[a](https://www.benevol.app/tarifs) [b](https://www.benevol.app/pour-qui#une-fete-de-village) [c](https://www.benevol.app/logiciel-planning-benevoles) [d](/doc/rappels) [e](/doc/admin) [f](/fonctionnalites) [g](/videos/SHIFT_RECURRENCE) [h](/nouveautes)",
    )
  })

  it("are rewritten in FEATURES.md as another instance renders it", () => {
    const site = linkSourcesToRoutes(read("content/pages/FEATURES.md"), false)
    for (const page of AUDIENCE_PAGES) expect(site, page.path).toContain(`](https://www.benevol.app${page.path})`)
    expect(site).toContain("](https://www.benevol.app/tarifs)")
    expect(site).not.toMatch(/\]\(\/(tarifs|pour-qui|benevoles-|planning-permanences|logiciel-planning)/)
    expect(site).toContain("](/doc/creer-un-evenement)")
    for (const page of PUBLIC_PAGES.filter((p) => p.presentation)) expect(page.availability, page.path).toBe("hosted")
  })
})

describe("the pricing page (#950)", () => {
  it("is linked from the home, the features page and the editorial page", () => {
    expect(read("src/app/page.tsx")).toContain('href="/tarifs"')
    for (const source of ["content/pages/FEATURES.md", "content/pages/LOGICIEL-PLANNING-BENEVOLES.md"]) expect(linkSourcesToRoutes(read(source)), source).toContain("](/tarifs)")
  })

  it("has a title and a heading about « gratuit », and its structured data states the free offer", () => {
    expect(publicPage("/tarifs").metaTitle.toLowerCase()).toContain("gratuit")
    expect(splitTitle(read("content/pages/TARIFS.md")).title?.toLowerCase()).toContain("gratuit")
    const graph = publicPageJsonLd("/tarifs", BASE)["@graph"] as Record<string, unknown>[]
    expect(graph.find((n) => n["@type"] === "SoftwareApplication")).toMatchObject({ isAccessibleForFree: true, offers: { price: "0" } })
  })

  // The figures it gives are the code's (src/lib/shift-series.ts, shift-recurrence.ts, member import).
  it("states the technical limits the code enforces", async () => {
    const { SERIES_MAX_SHIFTS } = await import("../shift-series")
    const { RECURRENCE_MAX_SHIFTS } = await import("../shift-recurrence")
    const md = read("content/pages/TARIFS.md")
    expect(md).toContain(`au plus ${SERIES_MAX_SHIFTS} créneaux`)
    expect(md).toContain(`une permanence au plus ${RECURRENCE_MAX_SHIFTS}`)
  })
})

describe.each(EDITORIAL)("%s", (pagePath) => {
  const page = publicPage(pagePath)
  const source = read(page.source!)
  const rendered = renderFeaturesPage(null, page.source!, page.title)
  const faq = featuresPageFaq(rendered)

  it("is declared with its own source, copied into the image, and a title and description that fit search results", () => {
    expect(page.source).toMatch(/^content\/pages\/[A-Z-]+\.md$/)
    expect(read("Dockerfile")).toContain(`/app/${page.source} ./${page.source}`)
    expect(metaLengthProblems(pageTitle(page.metaTitle), page.metaDescription)).toEqual([])
  })

  // The draft marker (removed once the owner rewrites the copy, « Draft content » CI job) is never rendered.
  it("never renders a draft marker", () => {
    expect(splitTitle(source).title).toBe(rendered.title)
    expect(JSON.stringify(rendered)).not.toContain("BROUILLON")
  })

  it("has a FAQ of three to six questions, the same words in its FAQPage data", () => {
    expect(faq.length).toBeGreaterThanOrEqual(3)
    expect(faq.length).toBeLessThanOrEqual(6)
    const graph = publicPageJsonLd(pagePath, BASE, faq)["@graph"] as Record<string, unknown>[]
    const node = graph.find((n) => n["@type"] === "FAQPage") as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] }
    const shown = rendered.sections.flatMap((s) => s.faq ?? [])
    expect(node.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(shown.map((q) => [q.question, q.text]))
  })

  it("ends with the two actions: ask for a space, then a guide or another page", () => {
    const last = rendered.sections.at(-1)!
    expect(last.actions[0]).toEqual({ label: "Demander un espace", href: "/inscription" })
    expect(last.actions).toHaveLength(2)
  })

  // Plain, concrete copy (the owner's rules): « vous », no em dash, no exclamation mark.
  it("keeps to the site's voice", () => {
    // Comments and screenshots aside: an alt text quotes the screen as it is (« Avant ta mission »).
    // Repeated until nothing changes, so no comment survives a single pass (CodeQL js/incomplete-multi-character-sanitization).
    let text = source
    for (let prev = ""; prev !== text; ) {
      prev = text
      text = text.replace(/<!--[\s\S]*?-->/g, "")
    }
    text = text.replace(/^!\[.*$/gm, "")
    expect(text).not.toMatch(/—/)
    expect(text).not.toMatch(/!(?!\[)/)
    // Whole words only: \b would cut « fêtes » after its « ê ».
    expect(text).not.toMatch(/(^|[\s«(])(tu|ton|ta|tes|toi)(?=[\s,.;:?)»]|$)/im)
    expect(text).not.toMatch(/Fini les|Et si /)
  })

  it("links only to guides, videos and pages that exist", () => {
    const units = new Set(readDocUnits().map((u) => u.slug))
    const videos = new Set(loadVideoCatalog().filter((v) => v.published).map((v) => v.id))
    const site = linkSourcesToRoutes(source)
    for (const [, slug] of site.matchAll(/\]\(\/doc\/([a-z0-9-]+)/g)) expect(units.has(slug), slug).toBe(true)
    for (const [, id] of site.matchAll(/\]\(\/videos\/([A-Z0-9_]+)\)/g)) expect(videos.has(id), id).toBe(true)
    for (const [, file] of site.matchAll(/\]\(([A-Z][A-Z0-9_-]*\.md)/g)) expect.fail(`unrouted source link ${file}`)
    for (const [, img] of source.matchAll(/\]\((\/doc-img\/[a-z0-9-]+\.png)\)/g)) expect(fs.existsSync(path.join(process.cwd(), "public", img)), img).toBe(true)
  })
})

describe.each(AUDIENCE_PAGES.map((p) => p.path))("audience page %s", (pagePath) => {
  const page = publicPage(pagePath)
  const parsed = parseFeaturesPage(read(page.source!))

  // Real captures of main, each with its alt text; guides and tutorials for each situation.
  it("shows a screenshot, links its guides and at least one tutorial video", () => {
    const shots = [parsed.intro, ...parsed.sections].flatMap((b) => b.screenshots)
    expect(shots.length).toBeGreaterThanOrEqual(1)
    for (const s of shots) expect(s.alt.length, s.src).toBeGreaterThan(40)
    const site = linkSourcesToRoutes(read(page.source!))
    expect(site.match(/\]\(\/doc\/[a-z]/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
    expect(site).toMatch(/\]\(\/videos\/[A-Z]/)
  })
})

// #951: a question may be answered on several pages (owner's decision). Repeats are reported, for
// the owner's review, never a failure.
describe("the FAQs of the editorial pages, the features page and the home", () => {
  it("report the questions asked on several pages", () => {
    const sources = ["content/pages/FEATURES.md", ...PUBLIC_PAGES.filter((p) => p.path === "/logiciel-planning-benevoles" || EDITORIAL.includes(p.path)).map((p) => p.source!)]
    const questions = [
      ...sources.flatMap((s) => renderFeaturesPage(null, s).sections.flatMap((sec) => sec.faq ?? []).map((q) => q.question)),
      ...renderFaqSource(LANDING_FAQ_SOURCE).map((q) => q.question),
    ]
    expect(questions.length).toBeGreaterThan(0)
    const repeated = [...new Set(questions.filter((q, i) => questions.indexOf(q) !== i))]
    if (repeated.length > 0) console.info(`FAQ questions asked on several pages (allowed, for review):\n- ${repeated.join("\n- ")}`)
  })
})
