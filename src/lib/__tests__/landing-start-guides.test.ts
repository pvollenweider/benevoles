import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { readDocUnits, type DocUnit } from "../doc-units"
import { DOC_QUICKSTART_SLUG } from "../doc-quickstart"
import { LANDING_START_GUIDE_PATH, LANDING_START_UNITS, landingQuickstartLink, landingStartLinks, landingVolunteerGuideLink } from "../landing-start-guides"

// #764: the home page's entry points to the documentation.

function unit(slug: string): DocUnit {
  return {
    slug,
    title: `Titre ${slug}`,
    roles: ["admin"],
    group: "demarrer",
    order: 10,
    summary: `Résumé ${slug}.`,
    related: [],
    legacy: [],
    aliases: [],
    body: "",
    source: `guide/${slug}.md`,
  }
}

describe("landingStartLinks", () => {
  it("lists the essential units in their set order, with their own title and summary", () => {
    const units = [...LANDING_START_UNITS].reverse().map(unit)
    const links = landingStartLinks(units)
    expect(links.map((l) => l.href)).toEqual(LANDING_START_UNITS.map((s) => `/doc/${s}`))
    expect(links[0]).toEqual({ href: `/doc/${DOC_QUICKSTART_SLUG}`, title: `Titre ${DOC_QUICKSTART_SLUG}`, summary: `Résumé ${DOC_QUICKSTART_SLUG}.` })
  })

  it("keeps the volunteers' guide out of the ordered sequence, with its registry title and summary", () => {
    expect(landingStartLinks([...LANDING_START_UNITS].map(unit)).map((l) => l.href)).not.toContain(LANDING_START_GUIDE_PATH)
    const guide = landingVolunteerGuideLink()
    expect(guide.href).toBe(LANDING_START_GUIDE_PATH)
    expect(guide.title).toBe("Guide bénévole")
    expect(guide.summary.length).toBeGreaterThan(0)
  })

  it("skips a unit that no longer exists instead of linking to a 404", () => {
    const links = landingStartLinks([unit("partager-le-lien")])
    expect(links.map((l) => l.href)).toEqual(["/doc/partager-le-lien"])
  })
})

describe("landingQuickstartLink", () => {
  it("is the quickstart's link, or null without it", () => {
    expect(landingQuickstartLink([unit(DOC_QUICKSTART_SLUG)])?.href).toBe(`/doc/${DOC_QUICKSTART_SLUG}`)
    expect(landingQuickstartLink([unit("partager-le-lien")])).toBeNull()
  })
})

describe("the home page's links to guide/", () => {
  const units = readDocUnits()

  it("starts with the quickstart and reaches at least five units, all of them organisers' units", () => {
    const links = landingStartLinks(units)
    expect(links[0].href).toBe(`/doc/${DOC_QUICKSTART_SLUG}`)
    expect(links).toHaveLength(LANDING_START_UNITS.length)
    expect(links.length).toBeGreaterThanOrEqual(5)
    for (const slug of LANDING_START_UNITS) expect(units.find((u) => u.slug === slug)?.roles, slug).toContain("admin")
  })

  it("are rendered by the home page, the quickstart in the hero", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "src/app/page.tsx"), "utf-8")
    expect(page).toContain("landingQuickstartLink(units)")
    expect(page).toContain("<LandingStartGuides links={landingStartLinks(units)} guide={landingVolunteerGuideLink()} />")
  })
})
