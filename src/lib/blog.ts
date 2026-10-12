// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import fs from "node:fs"
import path from "node:path"
import type { Metadata } from "next"
import { z } from "zod"
import { publicPageMetadata } from "@/lib/doc-pages"
import { parseFrontMatter } from "@/lib/doc-units"
import { OG_IMAGE_ALT } from "@/lib/landing-seo"
import { SITE_NAME, absoluteUrl, seoMetadata } from "@/lib/seo-metadata"
import { parseCalendarDate } from "@/lib/freshness"
import { META_DESCRIPTION_MAX, META_DESCRIPTION_MIN, auditedLength } from "@/lib/meta-length"

/**
 * The blog (#944): the product newsletters, archived at /blog, one Markdown file per post in the
 * root folder `blog/`, named `YYYY-MM-DD-slug.md` and rendered at `/blog/<slug>`. Each file opens
 * with a small flat front matter (the same parser as the documentation units, src/lib/doc-units.ts):
 *
 *     ---
 *     title: The newsletter's subject, as sent (emoji included)
 *     date: 2026-10-12
 *     summary: One or two sentences of 70 to 160 characters, also the meta description.
 *     version: 2.3
 *     image: /some-image.png
 *     ---
 *
 * `version` and `image` are optional. The body follows, without a « # » title: the page renders
 * the title as its single <h1>. The file is the only copy of the post. The parser and the checks
 * are pure; only `readBlogPosts` and `loadBlogPosts` touch the disk (server side).
 */

/** The folder of the posts, at the repo root. */
export const BLOG_DIR = "blog"

/** `2026-10-12-benevol-app-passe-en-2-3.md`: the date, then the slug. */
const FILE_RE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/

/** Separators the copy never uses (read aloud as noise, or not at all), as in the documentation. */
const FORBIDDEN_SEPARATORS = /[·—]/

export const blogFrontMatterSchema = z.strictObject({
  title: z.string().min(1, "title: required"),
  date: z.string().refine((v) => parseCalendarDate(v) !== null, "date: a real date, YYYY-MM-DD"),
  summary: z
    .string()
    .min(META_DESCRIPTION_MIN, `summary: at least ${META_DESCRIPTION_MIN} characters`)
    .max(META_DESCRIPTION_MAX, `summary: at most ${META_DESCRIPTION_MAX} characters`)
    // As SEO audit tools count it (src/lib/meta-length.ts): an apostrophe or an accent costs more than one.
    .refine((s) => auditedLength(s) <= META_DESCRIPTION_MAX, `summary: at most ${META_DESCRIPTION_MAX} as audited (an apostrophe counts 6, an accent 2)`)
    .refine((s) => !FORBIDDEN_SEPARATORS.test(s), "summary: no « · » or em dash"),
  version: z.string().regex(/^\d+\.\d+(?:\.\d+)?$/, "version: a version number, e.g. 2.3 or 2.3.1").optional(),
  image: z.string().regex(/^\/[^\s]*$/, "image: a path on the site, starting with /").optional(),
})

export type BlogPost = {
  slug: string
  title: string
  /** YYYY-MM-DD, the day the newsletter was sent. */
  date: string
  summary: string
  /** « 2.3 », when the post announces a version. */
  version?: string
  /** A site path to the post's own social image; the site's default image otherwise. */
  image?: string
  /** The Markdown after the front matter. */
  body: string
  /** Path of the source from the repo root, e.g. `blog/2026-10-12-x.md`. */
  source: string
}

/** The slug and date of a post from its file name, or null when the name doesn't follow `YYYY-MM-DD-slug.md`. */
export function blogFileName(fileName: string): { date: string; slug: string } | null {
  const m = FILE_RE.exec(fileName)
  if (!m || !parseCalendarDate(m[1])) return null
  return { date: m[1], slug: m[2] }
}

/** One post from its file name and content; throws with the file name on any error. */
export function parseBlogPost(fileName: string, source: string): BlogPost {
  const fail = (message: string): never => {
    throw new Error(`${BLOG_DIR}/${fileName}: ${message}`)
  }
  const name = blogFileName(fileName)
  if (!name) return fail("file name: YYYY-MM-DD-slug.md, the slug in lower case letters, digits and hyphens")
  let parsed: ReturnType<typeof parseFrontMatter>
  try {
    parsed = parseFrontMatter(source)
  } catch (error) {
    return fail((error as Error).message)
  }
  const result = blogFrontMatterSchema.safeParse(parsed.data)
  if (!result.success) return fail(result.error.issues.map((i) => `${i.path.join(".") || "front matter"}: ${i.message}`).join("; "))
  const data = result.data
  if (data.date !== name.date) fail(`date: ${data.date} differs from the file name's ${name.date}`)
  const body = parsed.body.replace(/^\n+/, "")
  if (/^# /m.test(body)) fail("no « # » title in the body: the page renders the title as its <h1>")
  if (body.trim() === "") fail("the post has no text")
  return {
    slug: name.slug,
    title: data.title,
    date: data.date,
    summary: data.summary,
    ...(data.version ? { version: data.version } : {}),
    ...(data.image ? { image: data.image } : {}),
    body,
    source: `${BLOG_DIR}/${fileName}`,
  }
}

/** The problems of a set of posts (empty when all is well): a slug, a title or a summary used twice. */
export function blogProblems(posts: readonly BlogPost[]): string[] {
  const problems: string[] = []
  const seen = { slug: new Map<string, string>(), title: new Map<string, string>(), summary: new Map<string, string>() }
  for (const post of posts) {
    for (const key of ["slug", "title", "summary"] as const) {
      const owner = seen[key].get(post[key])
      if (owner) problems.push(`${post.source}: same ${key} as ${owner}`)
      seen[key].set(post[key], post.source)
    }
  }
  return problems
}

/** Newest first; two posts of the same day by slug, so the order never depends on the disk. */
export function sortBlogPosts(posts: readonly BlogPost[]): BlogPost[] {
  return [...posts].sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug))
}

/** Reads, parses and checks every post of `blog/` (server only); throws on the first broken file or any problem. */
export function readBlogPosts(dir: string = path.join(/*turbopackIgnore: true*/ process.cwd(), BLOG_DIR)): BlogPost[] {
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"))
  const posts = files.map((f) => parseBlogPost(f, fs.readFileSync(path.join(dir, f), "utf-8")))
  const problems = blogProblems(posts)
  if (problems.length > 0) throw new Error(`blog posts:\n${problems.join("\n")}`)
  return sortBlogPosts(posts)
}

// The posts don't change while the server runs (they're in the image): production reads them
// once; development reads them again on each request, so editing a post shows up.
let cachedPosts: BlogPost[] | null = null
export function loadBlogPosts(): BlogPost[] {
  if (process.env.NODE_ENV !== "production") return readBlogPosts()
  cachedPosts ??= readBlogPosts()
  return cachedPosts
}

/** The post at `/blog/<slug>`, or null. */
export function findBlogPost(slug: string, posts: readonly BlogPost[]): BlogPost | null {
  return posts.find((p) => p.slug === slug) ?? null
}

/** The page of a post. */
/** The posts around one, for the « précédent / suivant » links of its page (posts newest first). */
export function blogNeighbors(slug: string, posts: readonly BlogPost[]): { newer: BlogPost | null; older: BlogPost | null } {
  const sorted = sortBlogPosts(posts)
  const i = sorted.findIndex((p) => p.slug === slug)
  if (i < 0) return { newer: null, older: null }
  return { newer: sorted[i - 1] ?? null, older: sorted[i + 1] ?? null }
}

/** Encoded although slugs are already [a-z0-9-]: the href never carries raw file-name text. */
export function blogPostPath(post: Pick<BlogPost, "slug">): string {
  return `/blog/${encodeURIComponent(post.slug)}`
}

/**
 * The title without a leading or trailing emoji, for the <title> tag and the social card: the
 * subject's words stay, the decoration goes. The page, the index and the feed keep the title as sent.
 */
export function plainBlogTitle(title: string): string {
  const deco = "[\\p{Extended_Pictographic}\\u{FE0F}\\u{200D}\\s]+"
  const plain = title.replace(new RegExp(`^${deco}|${deco}$`, "gu"), "").trim()
  return plain || title
}

/**
 * The newsletters open their link lines with an arrow (« → [La documentation](/doc) », « ▶ Vidéo :
 * [titre](/videos/ID) »): kept as sent on screen, hidden from screen readers, which would read
 * « flèche droite » before each link. Applied to the sanitized HTML (a fixed <span>, nothing
 * from the source), only where the arrow starts a line: after a tag or a line break.
 */
export function hideLineArrows(html: string): string {
  return html.replace(/(^|>|\n)([→▶])([︎️]?) /g, '$1<span aria-hidden="true">$2$3 </span>')
}

/** « 2.3 » or « 2.3.0 » as the anchor of its version on /nouveautes (« 2.3.0 »). */
export function releaseAnchor(version: string): string {
  return version.split(".").length === 2 ? `${version}.0` : version
}

// ---------------------------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------------------------

/** Where the feed lives. */
export const BLOG_FEED_PATH = "/blog/feed.xml"

/** The feed, announced by every page of the blog (`<link rel="alternate" type="application/atom+xml">`). */
export function blogFeedAlternate(base: string): NonNullable<Metadata["alternates"]>["types"] {
  return { "application/atom+xml": [{ url: absoluteUrl(base, BLOG_FEED_PATH), title: `Le blog de ${SITE_NAME}` }] }
}

/** /blog's metadata: its registry entry (src/lib/doc-pages.ts), and its feed. */
export function blogIndexMetadata(base: string): Metadata {
  const m = publicPageMetadata("/blog", base)
  return { ...m, alternates: { ...m.alternates, types: blogFeedAlternate(base) } }
}

/**
 * A post's metadata: its title without its emoji (the <title> tag, the link previews), its summary
 * as the description, an absolute canonical on the apex host, an article published the day it was
 * sent, its own image or the site's card, and the feed.
 */
export function blogPostMetadata(post: BlogPost, base: string): Metadata {
  const title = plainBlogTitle(post.title)
  const m = seoMetadata({
    base,
    path: blogPostPath(post),
    title,
    description: post.summary,
    type: "article",
    section: "Blog",
    publishedTime: parseCalendarDate(post.date),
    imagePath: post.image ?? "/og-image.png",
    imageAlt: post.image ? title : OG_IMAGE_ALT,
  })
  return { ...m, alternates: { ...m.alternates, types: blogFeedAlternate(base) } }
}

// ---------------------------------------------------------------------------------------------
// Atom feed
// ---------------------------------------------------------------------------------------------

/** Text escaped for XML content and attributes. */
export function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

/** Site-relative links and images of a post's HTML made absolute, so the post reads well in a feed reader. */
export function absoluteLinks(html: string, base: string): string {
  const root = base.replace(/\/+$/, "")
  return html.replace(/(href|src)="\/(?!\/)/g, `$1="${root}/`)
}

export type BlogFeed = {
  /** Base URL of the apex host, e.g. https://www.benevol.app. */
  base: string
  siteName: string
  posts: readonly (BlogPost & { html: string })[]
}

/**
 * The Atom feed of the blog (RFC 4287), newest first: every URL absolute on `base`, each entry its
 * title, its page, its date (the day it was sent, at midnight UTC), its summary and its content.
 */
export function blogAtomFeed({ base, siteName, posts }: BlogFeed): string {
  const root = base.replace(/\/+$/, "")
  const sorted = sortBlogPosts(posts) as (BlogPost & { html: string })[]
  const stamp = (date: string) => `${date}T00:00:00Z`
  const updated = sorted[0] ? stamp(sorted[0].date) : "1970-01-01T00:00:00Z"
  const lines = [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="fr">`,
    `  <id>${escapeXml(`${root}/blog`)}</id>`,
    `  <title>${escapeXml(`Le blog de ${siteName}`)}</title>`,
    `  <subtitle>${escapeXml(`Les nouvelles de ${siteName}, la plus récente en premier.`)}</subtitle>`,
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(`${root}/blog/feed.xml`)}"/>`,
    `  <link rel="alternate" type="text/html" href="${escapeXml(`${root}/blog`)}"/>`,
    `  <updated>${updated}</updated>`,
    `  <author><name>${escapeXml(siteName)}</name><uri>${escapeXml(`${root}/`)}</uri></author>`,
    `  <icon>${escapeXml(`${root}/apple-icon.png`)}</icon>`,
  ]
  for (const post of sorted) {
    const url = `${root}${blogPostPath(post)}`
    lines.push(
      `  <entry>`,
      `    <id>${escapeXml(url)}</id>`,
      `    <title>${escapeXml(post.title)}</title>`,
      `    <link rel="alternate" type="text/html" href="${escapeXml(url)}"/>`,
      `    <published>${stamp(post.date)}</published>`,
      `    <updated>${stamp(post.date)}</updated>`,
      `    <summary>${escapeXml(post.summary)}</summary>`,
      `    <content type="html">${escapeXml(absoluteLinks(post.html, root))}</content>`,
      `  </entry>`,
    )
  }
  lines.push(`</feed>`, "")
  return lines.join("\n")
}
