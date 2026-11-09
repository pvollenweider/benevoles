import { describe, it, expect, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { llmsFullTxt, llmsTxt, markdownSections, portableMarkdown, LEGAL_PATHS, RESOURCE_PATHS } from "../llms-txt"
import { AUDIENCE_PAGES, PUBLIC_PAGES, pageAvailable, splitTitle } from "../doc-pages"
import { DOC_GROUPS, loadDocUnits } from "../doc-units"
import { headingIdsOf, renderPublicSource } from "../public-content"
import { blogPostPath, loadBlogPosts } from "../blog"
import { formatReleaseDate, parseChangelog, releaseMarkdown } from "../changelog"
import { loadRessources } from "../ressources"

const BASE = "https://www.benevol.app"
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf-8")

const pageSources = () => PUBLIC_PAGES.flatMap((p) => (p.source && p.path !== "/nouveautes" ? [{ path: p.path, markdown: read(p.source) }] : []))

const sources = () => ({
  base: BASE,
  summary: "Le planning des bénévoles.",
  features: read("content/pages/FEATURES.md"),
  units: loadDocUnits(),
  repositoryUrl: "https://github.com/pvollenweider/benevoles",
  pages: pageSources(),
  faq: read("content/pages/FAQ-ACCUEIL.md"),
  releases: parseChangelog(read("CHANGELOG.md")),
  posts: loadBlogPosts(),
  ressources: loadRessources(),
})

const full = llmsFullTxt(sources())

/** The first line of a source that carries text (not a heading or an author-only comment), links as their text. */
function excerpt(markdown: string): string {
  const { body } = splitTitle(markdown)
  const line = body
    .replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*$/gm, "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l !== "" && !l.startsWith("#") && !l.startsWith("<!--"))!
  return line.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").slice(0, 60)
}

/** The page URLs of the sections of /llms.txt (not the prose links of the features introduction above them). */
function listedContentPaths(): Set<string> {
  const txt = llmsTxt(sources())
  const sections = txt.slice(txt.indexOf("\n## Présentation"))
  return new Set([...sections.matchAll(new RegExp(`^ {0,2}- \\[[^\\]]+\\]\\(${BASE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^)#\\s]+)\\)`, "gm"))].map((m) => m[1]))
}

describe("llmsTxt", () => {
  const txt = llmsTxt(sources())

  it("follows llmstxt.org: one title, the summary as a quote, then sections of links", () => {
    expect(txt.startsWith("# benevol.app\n\n> Le planning des bénévoles.\n")).toBe(true)
    expect(txt.match(/^# /gm)).toHaveLength(1)
    expect(txt).toContain("\n## Optional\n")
  })

  it("links every public page and every unit by its absolute URL, with its summary", () => {
    // The pages this instance shows (#760): the tests run as the hosted service.
    for (const p of PUBLIC_PAGES.filter((page) => pageAvailable(page))) expect(txt, p.path).toContain(`](${BASE}${p.path})`)
    expect(txt).not.toContain(`](${BASE}/legal/exploitant)`)
    for (const u of loadDocUnits()) expect(txt, u.slug).toContain(`- [${u.title}](${BASE}/doc/${u.slug}): ${u.summary}`)
    expect(txt).toContain(`](${BASE}/llms-full.txt)`)
  })

  it("groups the units by theme, in the documentation's order", () => {
    const groups = [...txt.matchAll(/^## Documentation : (.+)$/gm)].map((m) => m[1])
    expect(groups).toEqual(DOC_GROUPS.map((g) => g.title).filter((t) => groups.includes(t)))
    expect(groups.length).toBeGreaterThan(5)
  })

  it("links the features page's sections by the anchors the page really has", () => {
    const ids = headingIdsOf(renderPublicSource("content/pages/FEATURES.md", "Fonctionnalités").html)
    const sections = markdownSections(read("content/pages/FEATURES.md"))
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
    expect(full).toContain(`# Le planning de vos bénévoles, simplement\n\nAdresse : ${BASE}/fonctionnalites`)
    expect(full).toContain(`# Guide organisateur\n\nAdresse : ${BASE}/doc/admin`)
    for (const u of loadDocUnits()) expect(full, u.slug).toContain(`# ${u.title}\n\nAdresse : ${BASE}/doc/${u.slug}`)
    expect(full).not.toMatch(/<!--|\]\(\/(?!\/)/)
  })

  it("gives every content page with a source its canonical address and an excerpt of its text", () => {
    // The lists the issue names (#1256): the registry, the audience pages, the legal and resource paths.
    const paths = new Set([
      ...PUBLIC_PAGES.filter((p) => p.source).map((p) => p.path),
      ...AUDIENCE_PAGES.map((p) => p.path),
      ...LEGAL_PATHS,
      ...RESOURCE_PATHS,
    ])
    let checked = 0
    for (const pagePath of paths) {
      const page = PUBLIC_PAGES.find((candidate) => candidate.path === pagePath)!
      if (!pageAvailable(page) || !page.source || pagePath === "/nouveautes") continue
      const source = read(page.source)
      expect(full, pagePath).toContain(`# ${splitTitle(source).title}`)
      expect(full, pagePath).toContain(`Adresse : ${BASE}${pagePath}`)
      expect(full, pagePath).toContain(excerpt(source))
      checked++
    }
    expect(checked).toBeGreaterThan(10)
  })

  it("keeps the title, address and summary of every public page without a source", () => {
    let checked = 0
    for (const pagePath of listedContentPaths()) {
      if (pagePath === "/llms-full.txt") continue
      const page = PUBLIC_PAGES.find((candidate) => candidate.path === pagePath)
      if (!page || !pageAvailable(page) || page.source) continue
      expect(full, pagePath).toContain(`# ${page.title}`)
      expect(full, pagePath).toContain(`Adresse : ${BASE}${page.path}`)
      expect(full, pagePath).toContain(page.summary)
      checked++
    }
    // /doc, /blog, /legal/privacy and /legal/terms on the hosted service.
    expect(checked).toBeGreaterThan(3)
  })

  it("gives the text of every content URL listed by llmsTxt", () => {
    const listed = listedContentPaths()
    expect(listed.size).toBeGreaterThan(10)
    for (const pagePath of listed) {
      if (pagePath === "/llms-full.txt") continue
      expect(full, pagePath).toContain(`Adresse : ${BASE}${pagePath}`)
    }
  })

  it("gives the operator page on a self-hosted instance, not the hosted service's legal pages", () => {
    vi.stubEnv("HOSTED_SERVICE", "false")
    try {
      const exploitant = PUBLIC_PAGES.find((page) => page.path === "/legal/exploitant")!
      const text = llmsFullTxt(sources())
      expect(text).toContain(`# ${exploitant.title}`)
      expect(text).toContain(`Adresse : ${BASE}/legal/exploitant`)
      expect(text).toContain(exploitant.summary)
      expect(text).not.toContain(`Adresse : ${BASE}/legal/privacy`)
      expect(text).not.toContain(`Adresse : ${BASE}/legal/terms`)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("gives the home's FAQ", () => {
    expect(full).toContain(`Adresse : ${BASE}/`)
    expect(full).toContain("### Combien ça coûte ?")
  })

  it("gives the published versions of /nouveautes, never the unreleased ones", () => {
    const releases = parseChangelog(read("CHANGELOG.md"))
    expect(releases.length).toBeGreaterThan(0)
    expect(full).toContain(`Adresse : ${BASE}/nouveautes`)
    for (const release of releases.slice(0, 3)) {
      expect(full).toContain(`## Version ${release.version} — ${formatReleaseDate(release.date)}`)
      expect(full).toContain(`Adresse : ${BASE}/nouveautes#${release.version}`)
    }
    expect(full).toContain(releaseMarkdown(releases[0]).split("\n").find((line) => line.startsWith("- "))!.slice(0, 40))
    expect(full).not.toContain("[Unreleased]")
  })

  it("gives every blog post and every practical guide under its own address", () => {
    const posts = loadBlogPosts()
    expect(posts.length).toBeGreaterThan(0)
    for (const post of posts) {
      expect(full, post.slug).toContain(`# ${post.title}`)
      expect(full, post.slug).toContain(`Adresse : ${BASE}${blogPostPath(post)}`)
      expect(full, post.slug).toContain(excerpt(post.body))
    }
    const guides = loadRessources()
    expect(guides.length).toBeGreaterThan(0)
    for (const guide of guides) {
      expect(full, guide.slug).toContain(`# ${guide.title}`)
      expect(full, guide.slug).toContain(`Adresse : ${BASE}/ressources/${guide.slug}`)
      expect(full, guide.slug).toContain(excerpt(guide.body))
    }
  })
})

describe("portableMarkdown", () => {
  it("drops video references, turns links between sources into absolute site links", () => {
    const md = "Intro [a](content/guide/rappels.md#b) et [c](/doc/admin).\n\n<!-- video: ORG_FIRST_STEPS -->\n\n\nFin [d](https://example.org)."
    expect(portableMarkdown(md, `${BASE}/`)).toBe(`Intro [a](${BASE}/doc/rappels#b) et [c](${BASE}/doc/admin).\n\nFin [d](https://example.org).`)
  })
})
