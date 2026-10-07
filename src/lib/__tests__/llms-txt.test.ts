import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { llmsFullTxt, llmsTxt, markdownSections, portableMarkdown } from "../llms-txt"
import { PUBLIC_PAGES } from "../doc-pages"
import { DOC_GROUPS, loadDocUnits } from "../doc-units"
import { headingIdsOf, renderPublicSource } from "../public-content"

const BASE = "https://www.benevol.app"
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf-8")
const sources = () => ({
  base: BASE,
  summary: "Le planning des bénévoles.",
  features: read("FEATURES.md"),
  units: loadDocUnits(),
  repositoryUrl: "https://github.com/pvollenweider/benevoles",
  guides: [{ path: "/doc/admin", markdown: read("GUIDE_ADMIN.md") }, { path: "/doc/benevole", markdown: read("GUIDE_BENEVOLE.md") }],
})

describe("llmsTxt", () => {
  const txt = llmsTxt(sources())

  it("follows llmstxt.org: one title, the summary as a quote, then sections of links", () => {
    expect(txt.startsWith("# benevol.app\n\n> Le planning des bénévoles.\n")).toBe(true)
    expect(txt.match(/^# /gm)).toHaveLength(1)
    expect(txt).toContain("\n## Optional\n")
  })

  it("links every public page and every unit by its absolute URL, with its summary", () => {
    for (const p of PUBLIC_PAGES) expect(txt, p.path).toContain(`](${BASE}${p.path})`)
    for (const u of loadDocUnits()) expect(txt, u.slug).toContain(`- [${u.title}](${BASE}/doc/${u.slug}): ${u.summary}`)
    expect(txt).toContain(`](${BASE}/llms-full.txt)`)
  })

  it("groups the units by theme, in the documentation's order", () => {
    const groups = [...txt.matchAll(/^## Documentation : (.+)$/gm)].map((m) => m[1])
    expect(groups).toEqual(DOC_GROUPS.map((g) => g.title).filter((t) => groups.includes(t)))
    expect(groups.length).toBeGreaterThan(5)
  })

  it("links the features page's sections by the anchors the page really has", () => {
    const ids = headingIdsOf(renderPublicSource("FEATURES.md", "Fonctionnalités").html)
    const sections = markdownSections(read("FEATURES.md"))
    expect(sections.length).toBeGreaterThan(5)
    for (const s of sections) {
      expect(ids, s.title).toContain(s.id)
      expect(txt).toContain(`](${BASE}/fonctionnalites#${s.id})`)
    }
  })

  it("keeps nothing internal: no relative link, no Markdown file, no HTML comment", () => {
    expect(txt).not.toMatch(/\]\(\/|\.md\)|<!--/)
  })
})

describe("llmsFullTxt", () => {
  it("gives the features, the guides and every unit, each under its title with its address", () => {
    const full = llmsFullTxt(sources())
    expect(full).toContain(`# Le planning de vos bénévoles, simplement\n\nAdresse : ${BASE}/fonctionnalites`)
    expect(full).toContain(`# Guide administrateur\n\nAdresse : ${BASE}/doc/admin`)
    for (const u of loadDocUnits()) expect(full, u.slug).toContain(`# ${u.title}\n\nAdresse : ${BASE}/doc/${u.slug}`)
    expect(full).not.toMatch(/<!--|\]\(\/(?!\/)/)
  })
})

describe("portableMarkdown", () => {
  it("drops video references, turns links between sources into absolute site links", () => {
    const md = "Intro [a](guide/rappels.md#b) et [c](/doc/admin).\n\n<!-- video: ORG_FIRST_STEPS -->\n\n\nFin [d](https://example.org)."
    expect(portableMarkdown(md, `${BASE}/`)).toBe(`Intro [a](${BASE}/doc/rappels#b) et [c](${BASE}/doc/admin).\n\nFin [d](https://example.org).`)
  })
})
