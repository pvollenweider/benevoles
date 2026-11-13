// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { AUDIENCE_INDEX_PATH, AUDIENCE_PAGES, DOC_GUIDES, PUBLIC_PAGES, linkSourcesToRoutes, pageAvailable, splitTitle, type PublicPage } from "@/lib/doc-pages"
import { DOC_GROUPS, docUnitAudience, sortDocUnits, type DocUnit } from "@/lib/doc-units"
import { parseFeaturesPage } from "@/lib/features-page"
import { createHeadingSlugger } from "@/lib/heading-anchors"
import { SITE_NAME, absoluteUrl } from "@/lib/seo-metadata"
import { localizeInstanceText } from "@/lib/site"
import { blogPostPath, type BlogPost } from "@/lib/blog"
import { formatReleaseDate, releaseMarkdown, repositoryLinks, type ChangelogRelease } from "@/lib/changelog"
import type { Ressource } from "@/lib/ressources"

/**
 * /llms.txt and /llms-full.txt (llmstxt.org): the apex site summed up for AI assistants, in plain
 * Markdown. Built from the same sources as the pages (FEATURES.md, the public pages' Markdown, the
 * home's FAQ, content/guide/<slug>.md, CHANGELOG.md, content/blog/ and content/ressources/), so it
 * can never drift from them: a new unit or page appears here as soon as it appears on the site.
 * Pure: the routes read the files and the pages pass them in, with the base URL of the running
 * deployment.
 */

/** One public page's Markdown source, by the path the site serves it at. */
export type LlmsPageSource = { path: string; markdown: string }

export type LlmsSources = {
  /** Base URL of the apex host. */
  base: string
  /** One line saying what benevol.app is (the home's description). */
  summary: string
  /** FEATURES.md, as written. */
  features: string
  /** content/pages/CITER.md, the identity block of /llms.txt and /llms-full.txt (#1323). */
  citer: string
  units: readonly DocUnit[]
  /** Link to the source code. */
  repositoryUrl: string
  /** Every public content page that has a Markdown source (PUBLIC_PAGES.source), except /nouveautes. */
  pages: readonly LlmsPageSource[]
  /** content/pages/FAQ-ACCUEIL.md, the home's questions and answers. */
  faq: string
  /** The released versions of CHANGELOG.md, newest first (/nouveautes). */
  releases: readonly ChangelogRelease[]
  /** The blog posts, newest first (/blog and /blog/<slug>). */
  posts: readonly BlogPost[]
  /** The practical guides of /ressources, most useful first (/ressources/<slug>). */
  ressources: readonly Ressource[]
}

/** The level-2 sections of a Markdown source, with the ids the page gives them (src/lib/heading-anchors.ts). */
export function markdownSections(markdown: string): { title: string; id: string }[] {
  const slug = createHeadingSlugger()
  const { body } = splitTitle(markdown)
  return [...body.matchAll(/^(#{2,6}) +(.+?) *#*$/gm)].flatMap(([, hashes, text]) => {
    const id = slug(text)
    return hashes.length === 2 ? [{ title: text.trim(), id }] : []
  })
}

/** The text before the first section of a Markdown source, without its title. */
function introduction(markdown: string): string {
  const { body } = splitTitle(markdown)
  const end = body.search(/^## /m)
  return (end === -1 ? body : body.slice(0, end)).trim()
}

/**
 * A source's Markdown as plain, self-contained text: HTML comments (video references) removed,
 * links between sources made site links, then absolute, so each one works out of context.
 */
export function portableMarkdown(markdown: string, base: string): string {
  const root = base.replace(/\/+$/, "")
  return linkSourcesToRoutes(localizeInstanceText(markdown).replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*\n?/gm, ""))
    .replace(/\]\(\/(?!\/)/g, `](${root}/`)
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const link = (title: string, url: string, note?: string) => `- [${title}](${url})${note ? `: ${note}` : ""}`

/** Pages of the hosted service listed after the price: the manifesto (#1259), the citation page (#1323), then practical pages (#871, #1258). */
export const RESOURCE_PATHS = ["/manifeste", "/citer", "/tableur-ou-outil-dedie", "/ressources"]

/**
 * The identity block of /llms.txt and /llms-full.txt (#1323), from CITER.md: the exact name, the
 * one-sentence and few-lines French descriptions, then the English one. Built from the parsed
 * citations, so their HTML comments never reach the output, and never a paraphrase.
 */
export function identityMarkdown(citer: string): string {
  const page = parseFeaturesPage(citer)
  const nameLine = page.sections
    .find((section) => section.heading === "Le nom")
    ?.markdown.split("\n")
    .map((line) => line.trim())
    .find((line) => line !== "" && !line.startsWith("<!--"))
  const citations = new Map(page.sections.flatMap((section) => section.citations).map((citation) => [citation.heading, citation.text]))
  const descriptions = ["En une phrase", "En quelques lignes", "En anglais"].flatMap((heading) => {
    const text = citations.get(heading)
    return text ? [text] : []
  })
  return [nameLine, ...descriptions].filter((line): line is string => Boolean(line)).join("\n\n")
}

export const LEGAL_PATHS = ["/legal/privacy", "/legal/terms", "/legal/sous-traitance", "/legal/sous-traitants", "/accessibilite", "/legal/exploitant"]

/** /llms.txt: what benevol.app is, then every public page by theme, each with its one-line summary. */
export function llmsTxt(s: LlmsSources): string {
  const url = (path: string) => absoluteUrl(s.base, path)
  const features = PUBLIC_PAGES.find((p) => p.path === "/fonctionnalites")!
  const docIndex = PUBLIC_PAGES.find((p) => p.path === "/doc")!
  const news = PUBLIC_PAGES.find((p) => p.path === "/nouveautes")!
  const blog = PUBLIC_PAGES.find((p) => p.path === "/blog")!
  const planning = PUBLIC_PAGES.find((p) => p.path === "/logiciel-planning-benevoles")!
  const citer = PUBLIC_PAGES.find((p) => p.path === "/citer")!
  const units = sortDocUnits(s.units)
  const identity = pageAvailable(citer) ? identityMarkdown(s.citer) : ""
  const out: string[] = [`# ${SITE_NAME}`, "", `> ${s.summary}`, ""]

  // The identity block comes first, before the feature list (#1323): the exact name and the
  // paragraphs to quote, never their directives. Another instance has no such page and no block (#760).
  if (identity) out.push(identity, "")
  out.push(portableMarkdown(introduction(s.features), s.base), "")

  out.push("## Présentation", "")
  out.push(link("Accueil", url("/"), "la présentation du service, ses questions fréquentes et comment commencer."))
  out.push(link(features.title, url(features.path), features.summary))
  for (const section of markdownSections(s.features)) out.push(`  ${link(section.title, url(`${features.path}#${section.id}`))}`)
  if (pageAvailable(planning)) out.push(link(planning.title, url(planning.path), planning.summary))
  // The audience pages under their index (#872), then the price (#950): the hosted service's pages.
  const audienceIndex = PUBLIC_PAGES.find((p) => p.path === AUDIENCE_INDEX_PATH)!
  if (pageAvailable(audienceIndex)) {
    out.push(link(audienceIndex.title, url(audienceIndex.path), audienceIndex.summary))
    for (const page of AUDIENCE_PAGES.filter((p) => pageAvailable(p))) out.push(`  ${link(page.title, url(page.path), page.summary)}`)
  }
  const pricing = PUBLIC_PAGES.find((p) => p.path === "/tarifs")!
  if (pageAvailable(pricing)) out.push(link(pricing.title, url(pricing.path), pricing.summary))
  // The practical pages of the hosted service (#871): spreadsheet and chat group, or a tool?
  for (const path of RESOURCE_PATHS) {
    const page = PUBLIC_PAGES.find((p) => p.path === path)
    if (page && pageAvailable(page)) out.push(link(page.title, url(page.path), page.summary))
  }
  out.push(link(news.title, url(news.path), news.summary))
  out.push(link(blog.title, url(blog.path), blog.summary))
  out.push("")

  out.push("## Guides", "")
  for (const guide of DOC_GUIDES) out.push(link(guide.title, url(guide.path), guide.summary))
  out.push(link(docIndex.title, url(docIndex.path), "toutes les fiches, par thème."))
  out.push("")

  for (const group of DOC_GROUPS) {
    const inGroup = units.filter((u) => u.group === group.id)
    if (inGroup.length === 0) continue
    out.push(`## Documentation : ${group.title}`, "")
    for (const u of inGroup) out.push(link(u.title, url(`/doc/${u.slug}`), `${u.summary} Pour : ${docUnitAudience(u)}.`))
    out.push("")
  }

  out.push("## Informations légales", "")
  for (const path of LEGAL_PATHS) {
    const page = PUBLIC_PAGES.find((p) => p.path === path)
    if (page && pageAvailable(page)) out.push(link(page.title, url(page.path), page.summary))
  }
  out.push("")

  out.push("## Optional", "")
  out.push(link("Texte complet de la documentation", url("/llms-full.txt"), "toutes les pages publiques, les guides et toutes les fiches en un seul fichier."))
  out.push(link("Code source", s.repositoryUrl, "licence AGPL-3.0, guide de déploiement pour installer le logiciel soi-même."))
  return `${out.join("\n").trim()}\n`
}

/**
 * /llms-full.txt: every public page /llms.txt lists, in its order, each under its title with its
 * address, then the documentation units. A page with a Markdown source gets its full text (the
 * released versions, a blog post, a practical guide); a page without one (the hosted service's
 * privacy policy and terms, the documentation and blog indexes, the instance operator page) keeps
 * its title and summary.
 */
export function llmsFullTxt(s: LlmsSources): string {
  const url = (path: string) => absoluteUrl(s.base, path)
  const markdown = new Map((s.pages ?? []).map((p) => [p.path, p.markdown]))
  const citer = PUBLIC_PAGES.find((p) => p.path === "/citer")!
  const identity = pageAvailable(citer) ? identityMarkdown(s.citer) : ""
  const parts: string[] = [[`# ${SITE_NAME} : documentation complète`, "", `> ${s.summary}`, ...(identity ? ["", identity] : [])].join("\n")]

  const section = (title: string, path: string, body: string, dated?: string, dateLabel = "Dernière mise à jour") =>
    [`# ${title}`, "", `Adresse : ${url(path)}`, ...(dated ? ["", `${dateLabel} : ${dated}`] : []), "", body].join("\n")
  const page = (p: PublicPage, body?: string) => {
    const source = body ?? markdown.get(p.path)
    const parsed = source === undefined ? null : splitTitle(source)
    parts.push(section(parsed?.title ?? p.title, p.path, parsed?.body ? portableMarkdown(parsed.body, s.base) : p.summary))
  }
  const resource = (r: Ressource) =>
    parts.push(section(r.title, `/ressources/${r.slug}`, portableMarkdown(r.body, s.base), formatReleaseDate(r.updated)))
  const post = (p: BlogPost) =>
    parts.push(section(p.title, blogPostPath(p), portableMarkdown(p.body, s.base), formatReleaseDate(p.date), "Publié le"))

  // The home's own text is its FAQ (FAQ-ACCUEIL.md); the rest of the page is layout and media.
  const faq = splitTitle(s.faq ?? "")
  parts.push(section(faq.title ?? "Questions fréquentes", "/", portableMarkdown(faq.body, s.base)))

  // The order of /llms.txt: the presentation pages, then the practical guides, the news and the
  // blog, before the documentation and the legal pages.
  const features = PUBLIC_PAGES.find((candidate) => candidate.path === "/fonctionnalites")!
  page(features, s.features)
  const planning = PUBLIC_PAGES.find((candidate) => candidate.path === "/logiciel-planning-benevoles")!
  if (pageAvailable(planning)) page(planning)
  const audienceIndex = PUBLIC_PAGES.find((p) => p.path === AUDIENCE_INDEX_PATH)!
  if (pageAvailable(audienceIndex)) {
    page(audienceIndex)
    for (const p of AUDIENCE_PAGES.filter((candidate) => pageAvailable(candidate))) page(p)
  }
  const pricing = PUBLIC_PAGES.find((p) => p.path === "/tarifs")!
  if (pageAvailable(pricing)) page(pricing)
  for (const path of RESOURCE_PATHS) {
    const p = PUBLIC_PAGES.find((candidate) => candidate.path === path)
    if (!p || !pageAvailable(p)) continue
    page(p)
    if (path === "/ressources") (s.ressources ?? []).forEach(resource)
  }

  const news = PUBLIC_PAGES.find((p) => p.path === "/nouveautes")!
  const releases = (s.releases ?? []).map((r) =>
    [`## Version ${r.version} — ${formatReleaseDate(r.date)}`, "", `Adresse : ${url(`/nouveautes#${r.version}`)}`, "", repositoryLinks(portableMarkdown(releaseMarkdown(r), s.base), s.repositoryUrl)].join("\n"),
  )
  if (pageAvailable(news)) parts.push(section(news.title, news.path, [news.summary, ...releases].join("\n\n")))

  const blog = PUBLIC_PAGES.find((p) => p.path === "/blog")!
  if (pageAvailable(blog)) {
    page(blog)
    for (const p of s.posts ?? []) post(p)
  }

  for (const guide of DOC_GUIDES) if (pageAvailable(guide)) page(guide)
  const docIndex = PUBLIC_PAGES.find((p) => p.path === "/doc")!
  page(docIndex)
  for (const u of sortDocUnits(s.units)) {
    const dated = u.freshness?.updated ?? u.freshness?.added
    const body = portableMarkdown(`Pour : ${docUnitAudience(u)}.\n\n${u.body}`, s.base)
    parts.push(section(u.title, `/doc/${u.slug}`, body, dated ? formatReleaseDate(dated) : undefined))
  }

  for (const path of LEGAL_PATHS) {
    const p = PUBLIC_PAGES.find((candidate) => candidate.path === path)
    if (p && pageAvailable(p)) page(p)
  }

  return `${parts.join("\n\n---\n\n")}\n`
}
