import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import {
  BLOG_DIR,
  blogNeighbors,
  loadBlogPosts,
  absoluteLinks,
  blogAtomFeed,
  blogFileName,
  blogIndexMetadata,
  blogPostMetadata,
  blogProblems,
  findBlogPost,
  hideLineArrows,
  parseBlogPost,
  plainBlogTitle,
  readBlogPosts,
  releaseAnchor,
  sortBlogPosts,
  type BlogPost,
} from "../blog"
import { apexSitemap, PUBLIC_PAGES } from "../doc-pages"
import { readDocUnits } from "../doc-units"
import { docUnitHeadingIds, renderBlogPost, renderChangelog } from "../public-content"
import { loadVideoCatalog } from "../video-catalog-load"
import { blogPostJsonLd } from "../structured-data"

const post = (fields: Record<string, string>, body = "Le texte.\n") =>
  ["---", ...Object.entries(fields).map(([k, v]) => `${k}: ${v}`), "---", "", body].join("\n")

const SUMMARY = "Une phrase qui résume l'article, assez longue pour une description de page dans les moteurs."
const valid = { title: "benevol.app passe en 9.0 🌱", date: "2026-10-12", summary: SUMMARY, version: "9.0" }

describe("blogFileName", () => {
  it("reads the date and the slug of YYYY-MM-DD-slug.md", () => {
    expect(blogFileName("2026-10-12-benevol-app-passe-en-2-3.md")).toEqual({ date: "2026-10-12", slug: "benevol-app-passe-en-2-3" })
  })

  it("refuses any other name, and a date that doesn't exist", () => {
    for (const name of ["benevol.md", "2026-10-12.md", "2026-10-12-Majuscule.md", "2026-10-12-a_b.md", "2026-10-12-x.txt", "2026-02-30-x.md", "2026-10-12--x.md"]) {
      expect(blogFileName(name), name).toBeNull()
    }
  })
})

describe("parseBlogPost", () => {
  it("parses the front matter and keeps the body after it", () => {
    const p = parseBlogPost("2026-10-12-neuf.md", post(valid, "## Section\n\nTexte."))
    expect(p).toEqual({ slug: "neuf", title: "benevol.app passe en 9.0 🌱", date: "2026-10-12", summary: SUMMARY, version: "9.0", body: "## Section\n\nTexte.", source: "content/blog/2026-10-12-neuf.md" })
  })

  it("makes version and image optional", () => {
    const p = parseBlogPost("2026-10-12-neuf.md", post({ title: valid.title, date: valid.date, summary: valid.summary, image: "/blog-img/neuf.png" }))
    expect(p.version).toBeUndefined()
    expect(p.image).toBe("/blog-img/neuf.png")
  })

  it("names the file and the problem on every error", () => {
    const cases: [string, string, RegExp][] = [
      ["neuf.md", post(valid), /blog\/neuf\.md: file name/],
      ["2026-10-12-neuf.md", "Pas de front matter", /blog\/2026-10-12-neuf\.md: front matter missing/],
      ["2026-10-12-neuf.md", post({ ...valid, auteur: "x" }), /auteur/],
      ["2026-10-12-neuf.md", post({ ...valid, date: "12.10.2026" }), /date: a real date/],
      ["2026-10-12-neuf.md", post({ ...valid, date: "2026-10-11" }), /differs from the file name/],
      ["2026-10-12-neuf.md", post({ ...valid, summary: "Trop court." }), /summary: at least 70/],
      ["2026-10-12-neuf.md", post({ ...valid, summary: "x".repeat(161) }), /summary: at most 160/],
      ["2026-10-12-neuf.md", post({ ...valid, summary: `${"l'été ".repeat(14)}fin` }), /as audited/],
      ["2026-10-12-neuf.md", post({ ...valid, summary: `${SUMMARY} — oui` }), /em dash/],
      ["2026-10-12-neuf.md", post({ ...valid, version: "v2" }), /version: a version number/],
      ["2026-10-12-neuf.md", post({ ...valid, image: "https://x.example/a.png" }), /image: a path on the site/],
      ["2026-10-12-neuf.md", post({ summary: SUMMARY, date: "2026-10-12" }), /title/],
      ["2026-10-12-neuf.md", post(valid, "# Le titre répété\n\nTexte."), /no « # » title in the body/],
      ["2026-10-12-neuf.md", post(valid, "\n"), /no text/],
    ]
    for (const [name, source, error] of cases) expect(() => parseBlogPost(name, source), String(error)).toThrow(error)
  })
})

const fake = (slug: string, date: string, extra: Partial<BlogPost> = {}): BlogPost => ({ slug, title: `Titre ${slug}`, date, summary: `Résumé ${slug}`, body: "Texte", source: `content/blog/${date}-${slug}.md`, ...extra })

describe("sortBlogPosts and blogProblems", () => {
  it("lists the newest first, two posts of one day by slug", () => {
    const sorted = sortBlogPosts([fake("a", "2026-09-26"), fake("c", "2026-10-12"), fake("b", "2026-10-12"), fake("d", "2026-09-30")])
    expect(sorted.map((p) => p.slug)).toEqual(["b", "c", "d", "a"])
  })

  it("reports a slug, a title or a summary used twice", () => {
    expect(blogProblems([fake("a", "2026-09-26"), fake("b", "2026-09-27")])).toEqual([])
    const problems = blogProblems([fake("a", "2026-09-26"), fake("a", "2026-09-27", { title: "Titre a", summary: "Résumé a" })])
    expect(problems).toEqual([
      "content/blog/2026-09-27-a.md: same slug as content/blog/2026-09-26-a.md",
      "content/blog/2026-09-27-a.md: same title as content/blog/2026-09-26-a.md",
      "content/blog/2026-09-27-a.md: same summary as content/blog/2026-09-26-a.md",
    ])
  })

  it("finds a post by slug, null for an unknown one", () => {
    const posts = [fake("a", "2026-09-26")]
    expect(findBlogPost("a", posts)?.slug).toBe("a")
    expect(findBlogPost("nope", posts)).toBeNull()
  })
})

describe("titles and versions", () => {
  it("drops a leading or trailing emoji for the <title>, keeps the words", () => {
    expect(plainBlogTitle("benevol.app a bien grandi 🌱")).toBe("benevol.app a bien grandi")
    expect(plainBlogTitle("🎬 benevol.app 2.2 : on a filmé, rangé, et ça va plus vite")).toBe("benevol.app 2.2 : on a filmé, rangé, et ça va plus vite")
    expect(plainBlogTitle("Sans emoji")).toBe("Sans emoji")
    expect(plainBlogTitle("🌱")).toBe("🌱")
  })

  it("gives a version its anchor on /nouveautes", () => {
    expect(releaseAnchor("2.3")).toBe("2.3.0")
    expect(releaseAnchor("2.3.1")).toBe("2.3.1")
  })
})

describe("blogAtomFeed", () => {
  const posts = [
    { ...fake("ancien", "2026-09-26"), html: '<p><a href="/doc">doc</a></p>' },
    { ...fake("nouveau", "2026-10-12", { title: "Tom & Jerry <3" }), html: '<p><a href="/videos/X">vidéo</a> <a href="https://example.org/a">ailleurs</a> <a href="//cdn.example/x">cdn</a></p>' },
  ]
  const xml = blogAtomFeed({ base: "https://www.benevol.app/", siteName: "benevol.app", posts })

  it("is an Atom feed, newest entry first, every URL absolute on the site's address", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="fr">')).toBe(true)
    expect(xml).toContain('<link rel="self" type="application/atom+xml" href="https://www.benevol.app/blog/feed.xml"/>')
    expect(xml).toContain("<id>https://www.benevol.app/blog</id>")
    expect(xml).toContain("<updated>2026-10-12T00:00:00Z</updated>")
    expect(xml.indexOf("/blog/nouveau</id>")).toBeLessThan(xml.indexOf("/blog/ancien</id>"))
    expect(xml).toContain("<published>2026-09-26T00:00:00Z</published>")
    expect(xml).not.toMatch(/localhost/)
    expect(xml).not.toMatch(/href=&quot;\/(?!\/)/)
    expect(xml).toContain("href=&quot;https://www.benevol.app/videos/X&quot;")
    expect(xml).toContain("href=&quot;//cdn.example/x&quot;")
  })

  it("escapes the text, so the XML stays well formed", () => {
    expect(xml).toContain("<title>Tom &amp; Jerry &lt;3</title>")
    // Every element closed in order; no raw « < » or stray « & » in the text.
    const stack: string[] = []
    for (const m of xml.replace(/^<\?xml[^>]*\?>/, "").matchAll(/<(\/?)([a-zA-Z:]+)[^>]*?(\/?)>/g)) {
      if (m[3]) continue
      if (m[1]) expect(stack.pop()).toBe(m[2])
      else stack.push(m[2])
    }
    expect(stack).toEqual([])
    const text = xml.split(/<[^>]*>/).join("")
    expect(text).not.toMatch(/[<>]/)
    expect(text).not.toMatch(/&(?!(amp|lt|gt|quot|apos);)/)
  })

  it("makes only site-relative links absolute", () => {
    expect(absoluteLinks('<a href="/a">a</a><img src="/b.png"><a href="#x">x</a>', "https://x.example/")).toBe('<a href="https://x.example/a">a</a><img src="https://x.example/b.png"><a href="#x">x</a>')
  })
})

describe("metadata, structured data and sitemap", () => {
  const p = fake("neuf", "2026-10-12", { title: "🎬 benevol.app 9.0 : tout neuf", version: "9.0" })

  it("gives a post its canonical on www, an article published that day, the site's card and the feed", () => {
    const m = blogPostMetadata(p, "https://www.benevol.app")
    expect(m.title).toEqual({ absolute: "benevol.app 9.0 : tout neuf | benevol.app" })
    expect(m.description).toBe(p.summary)
    expect(m.alternates?.canonical).toBe("https://www.benevol.app/blog/neuf")
    expect(m.alternates?.types).toEqual({ "application/atom+xml": [{ url: "https://www.benevol.app/blog/feed.xml", title: "Le blog de benevol.app" }] })
    expect(m.openGraph).toMatchObject({ type: "article", publishedTime: "2026-10-12T00:00:00.000Z", url: "https://www.benevol.app/blog/neuf", images: [expect.objectContaining({ url: "https://www.benevol.app/og-image.png", width: 1200, height: 630 })] })
    expect(m.robots).toMatchObject({ index: true, follow: true })
    expect(blogPostMetadata({ ...p, image: "/blog-img/neuf.png" }, "https://www.benevol.app").openGraph).toMatchObject({ images: [expect.objectContaining({ url: "https://www.benevol.app/blog-img/neuf.png" })] })
  })

  it("gives the index its registry metadata and the feed", () => {
    const m = blogIndexMetadata("https://www.benevol.app")
    expect(m.alternates?.canonical).toBe("https://www.benevol.app/blog")
    expect(m.alternates?.types).toBeDefined()
    expect(PUBLIC_PAGES.find((x) => x.path === "/blog")?.title).toBe("Blog")
  })

  it("describes a post as a BlogPosting with its breadcrumb", () => {
    const graph = blogPostJsonLd(p, "https://www.benevol.app") as { "@graph": Record<string, unknown>[] }
    expect(graph["@graph"][0]).toMatchObject({ "@type": "BlogPosting", headline: p.title, datePublished: "2026-10-12", url: "https://www.benevol.app/blog/neuf", image: "https://www.benevol.app/og-image.png" })
    expect(graph["@graph"][1]).toMatchObject({ "@type": "BreadcrumbList" })
  })

  it("lists every post in the sitemap, dated the day it was sent, and dates /blog by its newest post", () => {
    const entries = apexSitemap("https://www.benevol.app", () => null, [], true, [fake("a", "2026-09-26"), fake("b", "2026-10-12")])
    expect(entries.slice(-2)).toEqual([
      { url: "https://www.benevol.app/blog/a", changeFrequency: "yearly", priority: 0.4, lastModified: new Date("2026-09-26T00:00:00Z") },
      { url: "https://www.benevol.app/blog/b", changeFrequency: "yearly", priority: 0.4, lastModified: new Date("2026-10-12T00:00:00Z") },
    ])
    expect(entries.find((e) => e.url === "https://www.benevol.app/blog")).toMatchObject({ lastModified: new Date("2026-10-12T00:00:00Z") })
  })
})

// The posts of the repository: every file valid, and every link inside them leads somewhere.
describe("the posts of content/blog/", () => {
  const posts = readBlogPosts()

  it("are all valid, newest first, one per .md file", () => {
    const files = fs.readdirSync(path.join(process.cwd(), BLOG_DIR)).filter((f) => f.endsWith(".md"))
    expect(posts).toHaveLength(files.length)
    expect(posts.map((p) => p.date)).toEqual([...posts.map((p) => p.date)].sort().reverse())
  })

  it("import the four newsletters sent, under their subject as sent", () => {
    expect(posts.map((p) => [p.date, p.title, p.version ?? null])).toEqual(
      expect.arrayContaining([
        ["2026-09-26", "benevol.app a bien grandi 🌱", null],
        ["2026-09-30", "benevol.app passe en 2.0 🌱", "2.0"],
        ["2026-10-08", "🎬 benevol.app 2.2 : on a filmé, rangé, et ça va plus vite", "2.2"],
        ["2026-10-12", "benevol.app passe en 2.3 : moins de ressaisie, plus de remplaçants", "2.3"],
      ]),
    )
  })

  it("link the site by path, never by its absolute address", () => {
    for (const p of posts) expect(p.body, p.source).not.toMatch(/\]\(https?:\/\/(www\.)?benevol\.app/)
  })

  it("link only pages, units, anchors and videos that exist", () => {
    const units = readDocUnits()
    const catalog = loadVideoCatalog()
    const pages = new Set(["/", "/videos", ...PUBLIC_PAGES.map((p) => p.path)])
    for (const p of posts) {
      for (const [, href] of renderBlogPost(p).matchAll(/href="(\/[^"]*)"/g)) {
        const [route, anchor] = href.split("#")
        const unit = route.startsWith("/doc/") ? units.find((u) => `/doc/${u.slug}` === route) : undefined
        const video = route.startsWith("/videos/") ? catalog.find((v) => `/videos/${v.id}` === route) : undefined
        expect(pages.has(route) || unit || video, `${p.source}: ${href}`).toBeTruthy()
        if (anchor && unit) expect(docUnitHeadingIds(unit), `${p.source}: ${href}`).toContain(anchor)
      }
    }
  })

  it("announce versions that /nouveautes lists, so the link to their notes opens them", () => {
    const releases = renderChangelog().map((r) => r.version)
    for (const p of posts) if (p.version) expect(releases, p.source).toContain(releaseAnchor(p.version))
  })

  it("render without a second <h1>", () => {
    for (const p of posts) expect(renderBlogPost(p), p.source).not.toMatch(/<h1/)
  })

  it("render their line arrows hidden from screen readers, still on screen", () => {
    const html = posts.map((p) => renderBlogPost(p)).join("\n")
    expect(html).toContain('<span aria-hidden="true">→ </span><a href="/doc">')
    expect(html).toContain('<span aria-hidden="true">▶ </span>Vidéo : <a href="/videos/')
    expect(html.replace(/<span aria-hidden="true">[→▶] <\/span>/g, "")).not.toMatch(/(^|>|\n)[→▶]/)
  })
})

describe("hideLineArrows", () => {
  it("hides an arrow that starts a line, after a tag or a line break, and nothing else", () => {
    expect(hideLineArrows('<p>→ <a href="/doc">doc</a><br>\n▶ Vidéo : <a href="/v">v</a></p>')).toBe(
      '<p><span aria-hidden="true">→ </span><a href="/doc">doc</a><br>\n<span aria-hidden="true">▶ </span>Vidéo : <a href="/v">v</a></p>',
    )
    expect(hideLineArrows("<p>a → b</p>")).toBe("<p>a → b</p>")
    expect(hideLineArrows("<p>▶️ Vidéo</p>")).toBe('<p><span aria-hidden="true">▶️ </span>Vidéo</p>')
  })
})

// The « Précédent / Suivant » links of a post page.
describe("blogNeighbors", () => {
  it("gives the newer and older posts around one, by date", () => {
    const posts = loadBlogPosts()
    const sorted = [...posts].sort((a, b) => b.date.localeCompare(a.date))
    const middle = sorted[1]
    const { newer, older } = blogNeighbors(middle.slug, posts)
    expect(newer?.slug).toBe(sorted[0].slug)
    expect(older?.slug).toBe(sorted[2].slug)
    expect(blogNeighbors(sorted[0].slug, posts).newer).toBeNull()
    expect(blogNeighbors(sorted[sorted.length - 1].slug, posts).older).toBeNull()
    expect(blogNeighbors("inconnu", posts)).toEqual({ newer: null, older: null })
  })
})
