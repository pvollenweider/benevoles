import { describe, it, expect, beforeAll, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {
  DOC_GROUPS,
  DOC_INDEX_END,
  DOC_INDEX_START,
  DOC_ROLE_INFO,
  RESERVED_DOC_SLUGS,
  docGroup,
  docGroupHref,
  docIndexMarkdown,
  docUnitAudience,
  docUnitsByGroup,
  legacyAnchorTargets,
  roleHasDocUnits,
  docUnitMetadata,
  docUnitProblems,
  parseDocUnit,
  parseFrontMatter,
  readDocUnits,
  relatedDocUnits,
  resolveDocSlug,
  resolveLegacyAnchor,
  sortDocUnits,
  withDocIndex,
  type DocUnit,
} from "../doc-units"
import { PUBLIC_PAGES } from "../doc-pages"
import { findVideoReferences } from "../doc-video-references"
import { loadVideoCatalog } from "../video-catalog-load"
import { docUnitHeadingIds, renderDocUnit } from "../public-content"

// #649: the documentation split into one Markdown file per task in guide/, served at /doc/<slug>.

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf-8")

const SUMMARY = "Une phrase assez longue pour décrire la page, entre soixante et cent soixante caractères."

function source(front: string, body = "# Titre\n\nTexte.\n"): string {
  return `---\n${front}\n---\n\n${body}`
}

const validFront = `roles: [benevole]\ngroup: apres-inscription\norder: 10\nsummary: ${SUMMARY}`

function unit(overrides: Partial<DocUnit> & { slug: string }): DocUnit {
  return {
    title: `Titre ${overrides.slug}`,
    roles: ["benevole"],
    group: "apres-inscription",
    order: 10,
    summary: `${SUMMARY} (${overrides.slug})`,
    related: [],
    legacy: [],
    aliases: [],
    body: "Texte.\n",
    source: `guide/${overrides.slug}.md`,
    ...overrides,
  }
}

describe("parseFrontMatter", () => {
  it("reads flat key: value and key: [a, b] lines, and returns the rest of the file", () => {
    const { data, body } = parseFrontMatter("---\nroles: [admin, benevole]\norder: 3\nsummary: Un texte : avec deux-points\nrelated: []\n---\n# T\n")
    expect(data).toEqual({ roles: ["admin", "benevole"], order: "3", summary: "Un texte : avec deux-points", related: [] })
    expect(body).toBe("# T\n")
  })

  it("accepts Windows line endings and blank lines", () => {
    expect(parseFrontMatter("---\r\norder: 1\r\n\r\ngroup: x\r\n---\r\n# T\r\n").data).toEqual({ order: "1", group: "x" })
  })

  it("rejects a missing or unclosed block, a malformed line, a duplicate key, an unclosed list or an empty item", () => {
    expect(() => parseFrontMatter("# T\n")).toThrow(/missing/)
    expect(() => parseFrontMatter("---\norder: 1\n# T\n")).toThrow(/not closed/)
    expect(() => parseFrontMatter("---\n  nested: 1\n---\n")).toThrow(/key: value/)
    expect(() => parseFrontMatter("---\nOrder: 1\n---\n")).toThrow(/key: value/)
    expect(() => parseFrontMatter("---\norder: 1\norder: 2\n---\n")).toThrow(/duplicate/)
    expect(() => parseFrontMatter("---\nroles: [admin\n---\n")).toThrow(/not closed/)
    expect(() => parseFrontMatter("---\nroles: [admin, ]\n---\n")).toThrow(/empty list item/)
  })
})

describe("parseDocUnit", () => {
  it("builds a unit from its file name, front matter and own title, optional lists defaulting to empty", () => {
    const u = parseDocUnit("ma-page.md", source(validFront, "# Ma page\n\n## Section\n\nTexte.\n"))
    expect(u).toEqual({
      slug: "ma-page",
      title: "Ma page",
      roles: ["benevole"],
      group: "apres-inscription",
      order: 10,
      summary: SUMMARY,
      related: [],
      legacy: [],
      aliases: [],
      body: "\n## Section\n\nTexte.\n",
      source: "guide/ma-page.md",
    })
  })

  it("rejects an unknown role, a role listed twice, no role, an unknown group, an order that isn't a whole number", () => {
    const front = (key: string, value: string) => source(validFront.replace(new RegExp(`^${key}: .*$`, "m"), `${key}: ${value}`))
    expect(() => parseDocUnit("p.md", front("roles", "[responsable]"))).toThrow(/guide\/p\.md: roles/)
    expect(() => parseDocUnit("p.md", front("roles", "[admin, admin]"))).toThrow(/listed twice/)
    expect(() => parseDocUnit("p.md", front("roles", "[]"))).toThrow(/at least one role/)
    expect(() => parseDocUnit("p.md", front("group", "nope"))).toThrow(/unknown group/)
    expect(() => parseDocUnit("p.md", front("order", "premier"))).toThrow(/whole number/)
  })

  it("keeps the summary between 70 and 160 characters, as audited too, without « · » or em dash", () => {
    expect(() => parseDocUnit("p.md", source(validFront.replace(SUMMARY, "Trop court.")))).toThrow(/at least 70/)
    expect(() => parseDocUnit("p.md", source(validFront.replace(SUMMARY, "x".repeat(161))))).toThrow(/at most 160/)
    // 149 characters, but about 300 bytes once escaped and encoded, as SEO audit tools count them.
    expect(() => parseDocUnit("p.md", source(validFront.replace(SUMMARY, "l'été ".repeat(25).trim())))).toThrow(/as audited/)
    expect(() => parseDocUnit("p.md", source(validFront.replace(SUMMARY, `${SUMMARY} · suite`)))).toThrow(/no « · »/)
    expect(() => parseDocUnit("p.md", source(validFront.replace(SUMMARY, `${SUMMARY} — suite`)))).toThrow(/no « · »/)
  })

  it("rejects an unknown key (a misspelt one would be ignored otherwise), a bad slug, a bad legacy anchor", () => {
    expect(() => parseDocUnit("p.md", source(`${validFront}\nrelatd: [x]`))).toThrow(/relatd|Unrecognized/i)
    expect(() => parseDocUnit("p.md", source(`${validFront}\nrelated: [Autre_Page]`))).toThrow(/slug/)
    expect(() => parseDocUnit("p.md", source(`${validFront}\nlegacy: [confirmation]`))).toThrow(/role#anchor/)
    expect(() => parseDocUnit("Ma_Page.md", source(validFront))).toThrow(/file name/)
  })

  it("needs the « # » title right after the front matter, and only one", () => {
    expect(() => parseDocUnit("p.md", source(validFront, "Texte sans titre.\n"))).toThrow(/title/)
    expect(() => parseDocUnit("p.md", source(validFront, "# Un\n\n# Deux\n"))).toThrow(/one « # » title only/)
  })
})

describe("docUnitProblems", () => {
  it("is empty for a coherent set", () => {
    expect(docUnitProblems([unit({ slug: "a", related: ["b"] }), unit({ slug: "b", aliases: ["ancien-b"] })])).toEqual([])
  })

  it("rejects the reserved slugs, as a slug or an alias", () => {
    expect(docUnitProblems([unit({ slug: "admin" })])).toEqual(["admin: reserved slug (a static page of /doc)"])
    expect(docUnitProblems([unit({ slug: "a", aliases: ["benevole"] })])).toEqual(["a: alias « benevole » is a reserved slug"])
  })

  it("rejects an unknown or self related unit", () => {
    expect(docUnitProblems([unit({ slug: "a", related: ["nope", "a"] })])).toEqual(["a: related unit « nope » doesn't exist", "a: related to itself"])
  })

  it("rejects aliases colliding with a slug or another alias, and a legacy anchor claimed twice", () => {
    expect(docUnitProblems([unit({ slug: "a", aliases: ["b"] }), unit({ slug: "b" })])).toEqual(["a: alias « b » is the slug of a unit"])
    expect(docUnitProblems([unit({ slug: "a", aliases: ["x"] }), unit({ slug: "b", aliases: ["x"] })])).toEqual(["b: alias « x » already used by a"])
    expect(docUnitProblems([unit({ slug: "a", legacy: ["benevole#x"] }), unit({ slug: "b", legacy: ["benevole#x"] })])).toEqual(["b: legacy anchor « benevole#x » already claimed by a"])
  })

  it("keeps titles and summaries unique (each page has its own <title> and description)", () => {
    expect(docUnitProblems([unit({ slug: "a", title: "T" }), unit({ slug: "b", title: "T" })])).toEqual(["b: same title as a"])
    expect(docUnitProblems([unit({ slug: "a", summary: SUMMARY }), unit({ slug: "b", summary: SUMMARY })])).toEqual(["b: same summary as a"])
  })

  it("allows one video per unit at most, and no « · » in a title", () => {
    expect(docUnitProblems([unit({ slug: "a", body: "\n<!-- video: A -->\n\nx\n\n<!-- video: B -->\n" })])).toEqual(["a: one video at most per unit"])
    expect(docUnitProblems([unit({ slug: "a", title: "Un · deux" })])).toEqual(["a: no « · » or em dash in the title"])
  })

  it("rejects « · » and the em dash in a summary too (a unit built without the front matter's schema)", () => {
    expect(docUnitProblems([unit({ slug: "a", summary: `${SUMMARY} · suite` })])).toEqual(["a: no « · » or em dash in the summary"])
    expect(docUnitProblems([unit({ slug: "a", summary: `${SUMMARY} — suite` })])).toEqual(["a: no « · » or em dash in the summary"])
    expect(docUnitProblems([unit({ slug: "a", summary: `${SUMMARY} - suite` })])).toEqual([])
  })
})

describe("readDocUnits", () => {
  let dir: string
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "doc-units-"))
    fs.writeFileSync(path.join(dir, "README.md"), "# Index, not a unit\n")
    fs.writeFileSync(path.join(dir, "deuxieme.md"), source(validFront.replace("order: 10", "order: 20").replace(SUMMARY, `${SUMMARY} Deux.`), "# Deuxième\n"))
    fs.writeFileSync(path.join(dir, "premiere.md"), source(`${validFront}\nrelated: [deuxieme]`, "# Première\n"))
    fs.writeFileSync(path.join(dir, "notes.txt"), "ignored")
  })
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

  it("reads every .md but the index, in reading order", () => {
    expect(readDocUnits(dir).map((u) => u.slug)).toEqual(["premiere", "deuxieme"])
  })

  it("is empty without the folder, and throws on an incoherent set", () => {
    expect(readDocUnits(path.join(dir, "absent"))).toEqual([])
    fs.writeFileSync(path.join(dir, "troisieme.md"), source(`${validFront.replace(SUMMARY, `${SUMMARY} Trois.`)}\nrelated: [nope]`, "# Troisième\n"))
    try {
      expect(() => readDocUnits(dir)).toThrow(/related unit « nope »/)
    } finally {
      fs.rmSync(path.join(dir, "troisieme.md"))
    }
  })
})

describe("lookups", () => {
  const units = [unit({ slug: "a", aliases: ["ancien-a"], legacy: ["benevole#revenir"], related: ["b"] }), unit({ slug: "b" })]

  it("resolves a slug to its unit, a former slug to a redirect, anything else to nothing", () => {
    expect(resolveDocSlug("a", units)).toEqual({ unit: units[0] })
    expect(resolveDocSlug("ancien-a", units)).toEqual({ redirectTo: "/doc/a" })
    expect(resolveDocSlug("nope", units)).toBeNull()
  })

  it("finds where an anchor of the old guides now lives", () => {
    expect(resolveLegacyAnchor("benevole", "revenir", units)).toBe("/doc/a")
    expect(resolveLegacyAnchor("admin", "revenir", units)).toBeNull()
    expect(resolveLegacyAnchor("benevole", "autre", units)).toBeNull()
  })

  it("keeps the fragment when the unit has a heading of the same id (a subsection moved as is)", () => {
    const withHeading = [unit({ slug: "a", legacy: ["benevole#revenir", "benevole#modifier"] })]
    const headingIds = () => ["modifier"]
    expect(resolveLegacyAnchor("benevole", "modifier", withHeading, headingIds)).toBe("/doc/a#modifier")
    expect(resolveLegacyAnchor("benevole", "revenir", withHeading, headingIds)).toBe("/doc/a")
  })

  it("maps every old anchor of a role to its target, and nothing of the other role", () => {
    const many = [
      unit({ slug: "a", legacy: ["benevole#revenir", "admin#creneaux", "benevole#modifier"] }),
      unit({ slug: "b", roles: ["admin"], legacy: ["admin#inviter"] }),
    ]
    const headingIds = (u: DocUnit) => (u.slug === "a" ? ["modifier"] : [])
    expect(legacyAnchorTargets("benevole", many, headingIds)).toEqual({ revenir: "/doc/a", modifier: "/doc/a#modifier" })
    expect(legacyAnchorTargets("admin", many)).toEqual({ creneaux: "/doc/a", inviter: "/doc/b" })
    expect(legacyAnchorTargets("admin", [])).toEqual({})
  })

  it("lists the related units in the front matter's order", () => {
    expect(relatedDocUnits(units[0], units).map((u) => u.slug)).toEqual(["b"])
  })

  it("sorts by group, then order, then slug", () => {
    const sorted = sortDocUnits([unit({ slug: "z", group: "apres-inscription", order: 1 }), unit({ slug: "y", group: "inscription", order: 5 }), unit({ slug: "x", group: "inscription", order: 5 })])
    expect(sorted.map((u) => u.slug)).toEqual(["x", "y", "z"])
  })
})

describe("docUnitsByGroup", () => {
  const units = [
    unit({ slug: "z", group: "apres-inscription", order: 1, roles: ["admin", "benevole"] }),
    unit({ slug: "y", group: "inscription", order: 5 }),
    unit({ slug: "x", group: "apres-inscription", order: 0, roles: ["admin"] }),
  ]

  it("groups every unit in the groups' order, then reading order, without empty groups", () => {
    expect(docUnitsByGroup(units).map((g) => [g.group.id, g.units.map((u) => u.slug)])).toEqual([
      ["inscription", ["y"]],
      ["apres-inscription", ["x", "z"]],
    ])
  })

  it("keeps a role's units only, a group with none of them left out", () => {
    expect(docUnitsByGroup(units, "admin").map((g) => [g.group.id, g.units.map((u) => u.slug)])).toEqual([["apres-inscription", ["x", "z"]]])
    expect(docUnitsByGroup([], "benevole")).toEqual([])
  })

  it("tells whether a role has units yet", () => {
    expect(roleHasDocUnits(units, "admin")).toBe(true)
    expect(roleHasDocUnits([units[1]], "admin")).toBe(false)
    expect(roleHasDocUnits([], "benevole")).toBe(false)
  })

  it("says who a unit is for, and where its group is listed", () => {
    expect(docUnitAudience(units[0])).toBe("organisateurs, bénévoles")
    expect(docGroupHref(DOC_GROUPS[1])).toBe("/doc#apres-inscription")
  })
})

describe("docUnitMetadata", () => {
  it("gives the unit's title and summary, an absolute canonical on the apex host, Open Graph and indexing", () => {
    const m = docUnitMetadata(unit({ slug: "a", title: "Ma page" }), "https://www.benevol.app/")
    // The site name after a vertical bar, never an em dash (#747).
    expect(m.title).toEqual({ absolute: "Ma page | benevol.app" })
    expect(m.description).toBe(`${SUMMARY} (a)`)
    expect(m.alternates?.canonical).toBe("https://www.benevol.app/doc/a")
    expect(m.openGraph).toMatchObject({ type: "article", url: "https://www.benevol.app/doc/a", siteName: "benevol.app", locale: "fr_CH", section: expect.any(String) })
    expect(m.robots).toMatchObject({ index: true, follow: true })
  })

  it("is an article of its group, with its own social card, the large Twitter card and its last change when known", () => {
    const u = unit({ slug: "a", title: "Ma page" })
    const image = { url: "https://www.benevol.app/og-image.png/doc/a", width: 1200, height: 630, type: "image/png", alt: "Ma page, documentation de benevol.app" }
    const m = docUnitMetadata(u, "https://www.benevol.app", new Date("2026-10-01T08:00:00Z"))
    expect(m.openGraph).toMatchObject({ section: docGroup(u.group).title, modifiedTime: "2026-10-01T08:00:00.000Z", images: [image] })
    expect(m.twitter).toEqual({ card: "summary_large_image", title: "Ma page | benevol.app", description: `${SUMMARY} (a)`, images: [image] })
    expect(docUnitMetadata(u, "https://www.benevol.app").openGraph).not.toHaveProperty("modifiedTime")
  })
})

describe("the guide index (guide/README.md)", () => {
  it("lists the units by group, linked by file, with their roles", () => {
    const md = docIndexMarkdown([unit({ slug: "b", title: "B", roles: ["admin", "benevole"], summary: "Résumé B." }), unit({ slug: "a", title: "A", group: "inscription", summary: "Résumé A." })])
    expect(md).toBe("### S'inscrire à un créneau\n\n- [A](a.md) : Résumé A. Pour : bénévoles.\n\n### Après l'inscription\n\n- [B](b.md) : Résumé B. Pour : organisateurs, bénévoles.")
    expect(docIndexMarkdown([])).toBe("Aucune page pour l'instant.")
  })

  it("replaces only what is between the markers", () => {
    const md = `avant\n${DOC_INDEX_START}\nvieux\n${DOC_INDEX_END}\naprès\n`
    expect(withDocIndex(md, "neuf")).toBe(`avant\n${DOC_INDEX_START}\nneuf\n${DOC_INDEX_END}\naprès\n`)
    expect(() => withDocIndex("sans marqueurs", "x")).toThrow(/markers/)
  })

  it("is up to date (npm run doc:index)", () => {
    const readme = read("guide/README.md")
    expect(readme).toBe(withDocIndex(readme, docIndexMarkdown(readDocUnits())))
  })
})

// Guards over the real units of guide/.
describe("the units of guide/", () => {
  const units = readDocUnits()

  it("exist and load without any problem", () => {
    expect(units.length).toBeGreaterThan(0)
  })

  it("never take the slug of a static page of /doc: every static folder of src/app/doc is reserved", () => {
    const docDir = path.join(process.cwd(), "src/app/doc")
    const staticDirs = fs.readdirSync(docDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("[")).map((d) => d.name)
    expect([...RESERVED_DOC_SLUGS].sort()).toEqual(staticDirs.sort())
    for (const u of units) expect(RESERVED_DOC_SLUGS, u.slug).not.toContain(u.slug)
    expect(fs.existsSync(path.join(docDir, "[slug]", "page.tsx"))).toBe(true)
  })

  it("have titles distinct from the other public pages' (each page its own <title>)", () => {
    const pageTitles = new Set(PUBLIC_PAGES.flatMap((p) => [p.metaTitle, p.title]))
    for (const u of units) expect(pageTitles.has(u.title), u.slug).toBe(false)
  })

  it("speak to volunteers with « tu », and split a shared unit into « Côté bénévole » then « Côté organisation »", () => {
    for (const u of units) {
      // « rendez-vous » (the meeting point of a shift) isn't a « vous ».
      if (u.roles.length === 1 && u.roles[0] === "benevole") expect(u.body, u.slug).not.toMatch(/(?<![\w-])(vous|votre|vos)\b/i)
      if (u.roles.length === 2) {
        // The volunteer half first, as the jump links under « Pour : … » offer it (DOC_SIDE_SECTIONS).
        const volunteer = u.body.search(/^## Côté bénévole$/m)
        const organiser = u.body.search(/^## Côté organisation$/m)
        expect(volunteer, `${u.slug}: « ## Côté bénévole »`).toBeGreaterThan(-1)
        expect(organiser, `${u.slug}: « ## Côté organisation »`).toBeGreaterThan(-1)
        expect(volunteer, `${u.slug}: « Côté bénévole » before « Côté organisation »`).toBeLessThan(organiser)
        // The introduction, shared by both audiences, says « vous » to no one.
        expect(u.body.slice(0, volunteer), `${u.slug}: introduction`).not.toMatch(/(?<![\w-])(vous|votre|vos)\b/i)
      }
    }
  })

  it("reference only videos of the catalogue, each on its own line between blank lines", () => {
    const ids = new Set(loadVideoCatalog().map((v) => v.id))
    for (const u of units) {
      const lines = read(u.source).split("\n")
      for (const ref of findVideoReferences(read(u.source))) {
        expect(ref.id, `${u.source}:${ref.line}`).not.toBeNull()
        expect(ids.has(ref.id!), `${u.source}:${ref.line} unknown video ${ref.id}`).toBe(true)
        expect(lines[ref.line - 2], `${u.source}:${ref.line} needs a blank line before`).toBe("")
        expect(lines[ref.line], `${u.source}:${ref.line} needs a blank line after`).toBe("")
      }
    }
  })

  it("link to other units by a file that exists", () => {
    const slugs = new Set(units.map((u) => u.slug))
    for (const u of units) {
      for (const [, slug] of u.body.matchAll(/\]\(([a-z0-9-]+)\.md(?:#[^)]*)?\)/g)) expect(slugs.has(slug), `${u.slug} links to ${slug}.md`).toBe(true)
    }
    for (const file of PUBLIC_PAGES.map((p) => p.source).filter((f): f is string => !!f)) {
      for (const [, slug] of read(file).matchAll(/\]\(guide\/([a-z0-9-]+)\.md(?:#[^)]*)?\)/g)) expect(slugs.has(slug), `${file} links to guide/${slug}.md`).toBe(true)
    }
  })

  // The volunteer FAQ (#649) links to each question in its unit: a renamed heading would break it.
  it("link to a heading of another unit only by an id it renders", () => {
    for (const u of units) {
      for (const [, slug, id] of u.body.matchAll(/\]\(([a-z0-9-]+)\.md#([^)]*)\)/g)) {
        expect(docUnitHeadingIds(units.find((other) => other.slug === slug)!), `${u.slug} links to ${slug}.md#${id}`).toContain(id)
      }
    }
  })

  it("render without an <h1> of their own: the page gives the only one", () => {
    for (const u of units) expect(renderDocUnit(u)).not.toContain("<h1")
  })

  it("name only known groups and roles", () => {
    for (const u of units) {
      expect(DOC_GROUPS.map((g) => g.id), u.slug).toContain(u.group)
      for (const r of u.roles) expect(Object.keys(DOC_ROLE_INFO)).toContain(r)
    }
  })
})

// The guides name a page the way the reader finds it, by the labels of the admin navigation
// (« Événements, puis l'événement, puis Gérer les créneaux »), never by its internal route: a URL with
// « [id] » in it is no use to a reader and goes stale when the routes move. Code fences may still
// show one (an example of an address, say).
describe("the pages of guide/", () => {
  const outsideCodeFences = (markdown: string) => markdown.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, "")

  it("drops fenced code only", () => {
    expect(outsideCodeFences("Avant\n```\n/admin/events\n```\nAprès `/admin/x`")).toBe("Avant\n\nAprès `/admin/x`")
  })

  it("never name an internal /admin/ route outside a code fence", () => {
    const dir = path.join(process.cwd(), "guide")
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const lines = outsideCodeFences(fs.readFileSync(path.join(dir, file), "utf8")).split("\n").filter((line) => line.includes("/admin/"))
      expect(lines, file).toEqual([])
    }
  })
})
