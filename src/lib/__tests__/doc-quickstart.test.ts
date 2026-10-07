import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { readDocUnits, type DocUnit } from "../doc-units"
import { DOC_QUICKSTART_SLUG, docQuickstartUnit, firstOrganiserDocUnit } from "../doc-quickstart"
import { findVideoReferences } from "../doc-video-references"
import { loadVideoCatalog } from "../video-catalog-load"

// #758: one page that takes a new organiser from zero to a shared sign-up link.

function unit(overrides: Partial<DocUnit> & { slug: string }): DocUnit {
  return {
    title: `Titre ${overrides.slug}`,
    roles: ["admin"],
    group: "demarrer",
    order: 10,
    summary: `Une phrase assez longue pour décrire la page, entre soixante et cent soixante caractères (${overrides.slug}).`,
    related: [],
    legacy: [],
    aliases: [],
    body: "Texte.\n",
    source: `guide/${overrides.slug}.md`,
    ...overrides,
  }
}

describe("docQuickstartUnit", () => {
  it("finds the quickstart by its slug, or nothing when it is gone", () => {
    const quickstart = unit({ slug: DOC_QUICKSTART_SLUG })
    expect(docQuickstartUnit([unit({ slug: "autre" }), quickstart])).toBe(quickstart)
    expect(docQuickstartUnit([unit({ slug: "autre" })])).toBeNull()
  })
})

describe("firstOrganiserDocUnit", () => {
  it("is the first unit of the organisers' first group, by order", () => {
    const units = [
      unit({ slug: "b", order: 10 }),
      unit({ slug: "a", order: 5 }),
      unit({ slug: "c", group: "preparer", order: 1 }),
      unit({ slug: "v", roles: ["benevole"], order: 1 }),
    ]
    expect(firstOrganiserDocUnit(units)?.slug).toBe("a")
  })

  it("is null when the organisers' first group has no unit", () => {
    expect(firstOrganiserDocUnit([unit({ slug: "c", group: "preparer" })])).toBeNull()
    expect(firstOrganiserDocUnit([])).toBeNull()
  })
})

describe("the quickstart of guide/", () => {
  const units = readDocUnits()
  const quickstart = docQuickstartUnit(units)!
  const steps = quickstart.body.split(/^## /m).slice(1)

  it("exists, for organisers, first under « Démarrer » and first on their guide", () => {
    expect(quickstart).not.toBeNull()
    expect(quickstart.roles).toEqual(["admin"])
    expect(quickstart.group).toBe("demarrer")
    expect(firstOrganiserDocUnit(units)?.slug).toBe(DOC_QUICKSTART_SLUG)
  })

  it("has eight numbered steps, in order, each linking to an existing unit", () => {
    const slugs = new Set(units.map((u) => u.slug))
    expect(steps).toHaveLength(8)
    steps.forEach((step, i) => {
      expect(step.startsWith(`${i + 1}. `), step.split("\n")[0]).toBe(true)
      const links = [...step.matchAll(/\]\(([a-z0-9-]+)\.md(?:#[^)]*)?\)/g)].map((m) => m[1])
      expect(links.length, step.split("\n")[0]).toBeGreaterThan(0)
      for (const slug of links) expect(slugs.has(slug), slug).toBe(true)
    })
  })

  it("keeps each step short: links to the detail rather than repeating it", () => {
    for (const step of steps) {
      const sentences = step.split("\n").slice(1).join(" ").split(/[.?!](?:\s|$)/).filter((s) => s.trim() !== "")
      expect(sentences.length, step.split("\n")[0]).toBeLessThanOrEqual(6)
    }
  })

  it("shows one published video of the catalogue", () => {
    const refs = findVideoReferences(quickstart.body)
    expect(refs).toHaveLength(1)
    const video = loadVideoCatalog().find((v) => v.id === refs[0].id)
    expect(video?.published).toBe(true)
  })

  it("is where the organisers' guide tells a newcomer to start", () => {
    const intro = fs.readFileSync(path.join(process.cwd(), "GUIDE_ADMIN.md"), "utf-8")
    expect(intro).toContain(`(guide/${DOC_QUICKSTART_SLUG}.md)`)
  })
})
