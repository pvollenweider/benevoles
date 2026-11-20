import { afterEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { PUBLIC_PAGES, markdownPathForPage, pageAvailable, splitTitle } from "../doc-pages"
import { blogPostPath, loadBlogPosts } from "../blog"
import { loadDocUnits } from "../doc-units"
import { loadRessources } from "../ressources"
import { parseChangelog } from "../changelog"
import { llmsFullTxt } from "../llms-txt"
import { htmlPathForMarkdown, markdownForPath, markdownPathFor } from "../markdown-pages"
import type { LlmsSources } from "../llms-txt"

const BASE = "https://www.benevol.app"
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf-8")

const pageSources = () => PUBLIC_PAGES.flatMap((p) => (p.source && p.path !== "/nouveautes" ? [{ path: p.path, markdown: read(p.source) }] : []))

const sources = (): LlmsSources => ({
  base: BASE,
  summary: "Le planning des bénévoles.",
  features: read("content/pages/FEATURES.md"),
  citer: read("content/pages/CITER.md"),
  units: loadDocUnits(),
  repositoryUrl: "https://github.com/pvollenweider/benevoles",
  pages: pageSources(),
  faq: read("content/pages/FAQ-ACCUEIL.md"),
  releases: parseChangelog(read("CHANGELOG.md")),
  posts: loadBlogPosts(),
  ressources: loadRessources(),
})

afterEach(() => vi.unstubAllEnvs())

describe("markdownPathFor", () => {
  it("maps the home to index.html.md and a page to its path plus .md", () => {
    expect(markdownPathFor("/")).toBe("/index.html.md")
    expect(markdownPathFor("/fonctionnalites")).toBe("/fonctionnalites.md")
    expect(markdownPathFor("/doc/creer-un-evenement")).toBe("/doc/creer-un-evenement.md")
  })

  it("ignores a trailing slash, a query and a fragment", () => {
    expect(markdownPathFor("/fonctionnalites/")).toBe("/fonctionnalites.md")
    expect(markdownPathFor("/x/y/")).toBe("/x/y.md")
    expect(markdownPathFor("/fonctionnalites?utm=x")).toBe("/fonctionnalites.md")
    expect(markdownPathFor("/fonctionnalites#top")).toBe("/fonctionnalites.md")
  })

  it("appends .md again to a path that already ends in .md (nothing is stripped)", () => {
    expect(markdownPathFor("/x.md")).toBe("/x.md.md")
    expect(markdownPathFor("/x/y.md")).toBe("/x/y.md.md")
  })

  it("refuses what is not a site path", () => {
    expect(markdownPathFor("")).toBeNull()
    expect(markdownPathFor("fonctionnalites")).toBeNull()
    expect(markdownPathFor("//x")).toBeNull()
    expect(markdownPathFor("/x//y")).toBeNull()
    expect(markdownPathFor("/x/../y")).toBeNull()
  })
})

describe("htmlPathForMarkdown", () => {
  it("is the inverse mapping, the home included", () => {
    expect(htmlPathForMarkdown("/index.html.md")).toBe("/")
    expect(htmlPathForMarkdown("/fonctionnalites.md")).toBe("/fonctionnalites")
    expect(htmlPathForMarkdown("/doc/creer-un-evenement.md/")).toBe("/doc/creer-un-evenement")
    expect(htmlPathForMarkdown("/x/y.md?utm=x")).toBe("/x/y")
  })

  it("strips one .md only, so mapping back and forth is stable", () => {
    expect(htmlPathForMarkdown("/x.md.md")).toBe("/x.md")
    expect(markdownPathFor(htmlPathForMarkdown("/x.md.md")!)).toBe("/x.md.md")
    expect(htmlPathForMarkdown("/x.md.md.md")).toBe("/x.md.md")
  })

  it("returns null for anything that is not a .md site path", () => {
    for (const value of ["", "/", "/x", "x.md", "/x.md.md/../y", "/.md", "/x/.md"]) expect(htmlPathForMarkdown(value), value).toBeNull()
  })
})

describe("markdownForPath", () => {
  const s = sources()
  const covered = [
    "/",
    ...PUBLIC_PAGES.filter((page) => page.source && pageAvailable(page)).map((page) => page.path),
    ...s.units.map((unit) => `/doc/${unit.slug}`),
    ...s.posts.map((post) => blogPostPath(post)),
    ...s.ressources.map((guide) => `/ressources/${guide.slug}`),
  ]

  it("covers the home, every page with a source, every unit, post and guide", () => {
    expect(new Set(covered).size).toBeGreaterThan(20)
    for (const path of new Set(covered)) expect(markdownForPath(path, s), path).not.toBeNull()
  })

  it("starts with the title, then the line saying which HTML page it mirrors", () => {
    const markdown = markdownForPath("/fonctionnalites", s)!
    const title = splitTitle(read("content/pages/FEATURES.md")).title
    expect(markdown.startsWith(`# ${title}\n\n> Version Markdown de ${BASE}/fonctionnalites\n\n`)).toBe(true)
    expect(markdown).toContain("Adresse : " + BASE + "/fonctionnalites")
  })

  it("is exactly that page's /llms-full.txt section with the source line added", () => {
    const full = llmsFullTxt(s)
    for (const path of new Set(covered)) {
      const markdown = markdownForPath(path, s)!
      const section = markdown.replace(/^> Version Markdown de .*\n\n/m, "").trimEnd()
      expect(full, path).toContain(section)
    }
  })

  it("gives the released versions of /nouveautes, never the unreleased one", () => {
    const markdown = markdownForPath("/nouveautes", s)!
    expect(markdown).toContain(`> Version Markdown de ${BASE}/nouveautes`)
    expect(markdown).toContain(`## Version ${s.releases[0].version}`)
    expect(markdown).not.toContain("[Unreleased]")
  })

  it("gives a unit, a post and a guide under their own address", () => {
    const unit = s.units[0]
    expect(markdownForPath(`/doc/${unit.slug}`, s)).toContain(`> Version Markdown de ${BASE}/doc/${unit.slug}`)
    const post = s.posts[0]
    expect(markdownForPath(blogPostPath(post), s)).toContain(`> Version Markdown de ${BASE}${blogPostPath(post)}`)
    const guide = s.ressources[0]
    expect(markdownForPath(`/ressources/${guide.slug}`, s)).toContain(`> Version Markdown de ${BASE}/ressources/${guide.slug}`)
  })

  it("returns null for a page without a Markdown source, a non-public page and an unknown one", () => {
    for (const path of ["/legal/privacy", "/legal/terms", "/legal/exploitant", "/blog", "/doc", "/inscription", "/admin", "/fete-du-village", "/doc/inconnu", "/blog/inconnu", "/ressources/inconnu", "/fonctionnalites/extra", "/index.html", "/fonctionnalites.md"]) {
      expect(markdownForPath(path, s), path).toBeNull()
    }
  })

  it("returns null for a page this instance does not serve (hosted-only pages on another instance)", () => {
    vi.stubEnv("HOSTED_SERVICE", "false")
    expect(markdownForPath("/tarifs", s)).toBeNull()
    expect(markdownForPath("/accessibilite", s)).toBeNull()
    expect(markdownForPath("/legal/sous-traitance", s)).toBeNull()
    // The documentation and the home exist everywhere.
    expect(markdownForPath("/", s)).not.toBeNull()
    expect(markdownForPath("/doc/admin", s)).not.toBeNull()
  })
})

describe("markdownPathForPage", () => {
  it("names the .md variant of a public page with a source and of the home", () => {
    expect(markdownPathForPage("/")).toBe("/index.html.md")
    expect(markdownPathForPage("/fonctionnalites")).toBe("/fonctionnalites.md")
    expect(markdownPathForPage("/nouveautes")).toBe("/nouveautes.md")
    expect(markdownPathForPage("/doc/admin")).toBe("/doc/admin.md")
  })

  it("uses the lookups for a unit, a post and a guide, and returns null for an unknown one", () => {
    const lookups = { docUnitExists: (slug: string) => slug === "se-connecter", blogPostExists: (slug: string) => slug === "premier-billet", ressourceExists: (slug: string) => slug === "un-roulement-equitable" }
    expect(markdownPathForPage("/doc/se-connecter", lookups)).toBe("/doc/se-connecter.md")
    expect(markdownPathForPage("/blog/premier-billet", lookups)).toBe("/blog/premier-billet.md")
    expect(markdownPathForPage("/ressources/un-roulement-equitable", lookups)).toBe("/ressources/un-roulement-equitable.md")
    expect(markdownPathForPage("/doc/inconnu", lookups)).toBeNull()
    expect(markdownPathForPage("/blog/inconnu", lookups)).toBeNull()
    expect(markdownPathForPage("/ressources/inconnu", lookups)).toBeNull()
    // A former unit slug redirects; it has no page of its own, hence no Markdown variant.
    expect(markdownPathForPage("/doc/ancien-nom", lookups)).toBeNull()
  })

  it("returns null for a page without a source, a feed and a deeper path", () => {
    for (const path of ["/legal/privacy", "/blog", "/doc", "/blog/feed.xml", "/videos/X", "/x/y/z"]) expect(markdownPathForPage(path), path).toBeNull()
  })
})
