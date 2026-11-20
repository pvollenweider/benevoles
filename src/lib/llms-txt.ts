// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { AUDIENCE_INDEX_PATH, AUDIENCE_PAGES, DOC_GUIDES, PUBLIC_PAGES, linkSourcesToRoutes, pageAvailable, splitTitle, type PublicPage } from "@/lib/doc-pages"
import { markdownPathFor } from "@/lib/markdown-paths"
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
 * One section of /llms-full.txt: a page's title, its route, its optional date and its portable
 * text. The builders below are the only place a page's text is made portable, so /llms-full.txt
 * and that page's `.md` variant cannot drift (src/lib/markdown-pages.ts).
 */
export type LlmsSection = {
  title: string
  /** The page's route, e.g. `/doc/admin`. */
  path: string
  body: string
  /** A date to show under the address, already formatted (`6 octobre 2026`). */
  dated?: string
  /** The label of that date; « Dernière mise à jour » by default. */
  dateLabel?: string
}

/** One section as /llms-full.txt writes it: title, address, date, then the text. */
export function llmsSectionText(section: LlmsSection, base: string): string {
  return [
    `# ${section.title}`,
    "",
    `Adresse : ${absoluteUrl(base, section.path)}`,
    ...(section.dated ? ["", `${section.dateLabel ?? "Dernière mise à jour"} : ${section.dated}`] : []),
    "",
    section.body,
  ].join("\n")
}

/**
 * The section of a public page: its own title and text when it has a Markdown source, its title
 * and summary when it hasn't (/doc, /blog, the privacy policy, the terms, the operator page).
 */
export function publicPageSection(page: PublicPage, source: string | undefined, base: string): LlmsSection {
  const parsed = source === undefined ? null : splitTitle(source)
  return {
    title: parsed?.title ?? page.title,
    path: page.path,
    body: parsed?.body ? portableMarkdown(parsed.body, base, page.path) : page.summary,
  }
}

/** A practical guide's section (/ressources/<slug>), dated the day it was last checked. */
export function ressourceSection(guide: Ressource, base: string): LlmsSection {
  const path = `/ressources/${guide.slug}`
  return { title: guide.title, path, body: portableMarkdown(guide.body, base, path), dated: formatReleaseDate(guide.updated) }
}

/** A blog post's section (/blog/<slug>), dated the day it was sent. */
export function blogPostSection(post: BlogPost, base: string): LlmsSection {
  const path = blogPostPath(post)
  return { title: post.title, path, body: portableMarkdown(post.body, base, path), dated: formatReleaseDate(post.date), dateLabel: "Publié le" }
}

/** A documentation unit's section (/doc/<slug>), with its audience and its freshness date when known. */
export function docUnitSection(unit: DocUnit, base: string): LlmsSection {
  const path = `/doc/${unit.slug}`
  const dated = unit.freshness?.updated ?? unit.freshness?.added
  return {
    title: unit.title,
    path,
    body: portableMarkdown(`Pour : ${docUnitAudience(unit)}.\n\n${unit.body}`, base, path),
    ...(dated ? { dated: formatReleaseDate(dated) } : {}),
  }
}

/** The released versions of /nouveautes as /llms-full.txt writes them, each under its anchored heading. */
export function releasesMarkdown(releases: readonly ChangelogRelease[], base: string, repositoryUrl: string): string {
  return releases
    .map((release) =>
      [
        `## Version ${release.version} — ${formatReleaseDate(release.date)}`,
        "",
        `Adresse : ${absoluteUrl(base, `/nouveautes#${release.version}`)}`,
        "",
        repositoryLinks(portableMarkdown(releaseMarkdown(release), base, "/nouveautes"), repositoryUrl),
      ].join("\n"),
    )
    .join("\n\n")
}

/** /nouveautes' section: its summary, then the released versions (nothing for an unreleased one). */
export function newsSection(news: PublicPage, releasesText: string): LlmsSection {
  return { title: news.title, path: news.path, body: [news.summary, releasesText].filter(Boolean).join("\n\n") }
}

/** The home's section: the FAQ it shows (FAQ-ACCUEIL.md); the rest of the page is layout and media. */
export function homeSection(faq: string, base: string): LlmsSection {
  const parsed = splitTitle(faq)
  return { title: parsed.title ?? "Questions fréquentes", path: "/", body: portableMarkdown(parsed.body, base, "/") }
}

/**
 * A page's own Markdown variant: the same section as /llms-full.txt, with one first line under
 * the title saying which HTML page it is the Markdown version of.
 */
export function markdownPageText(section: LlmsSection, base: string): string {
  const [title, , ...rest] = llmsSectionText(section, base).split("\n")
  return [title, "", `> Version Markdown de ${absoluteUrl(base, section.path)}`, "", ...rest].join("\n") + "\n"
}

/**
 * A source's Markdown as plain, self-contained text: HTML comments (video references) removed,
 * links between sources made site links, then absolute, so each one works out of context. A bare
 * fragment (`](#comment-ca-marche)`, a table of contents) is anchored on the page that carries the
 * source (`pagePath`), since the text can be read outside that page (/llms.txt, /llms-full.txt, a
 * `.md` variant).
 */
export function portableMarkdown(markdown: string, base: string, pagePath: string): string {
  const root = base.replace(/\/+$/, "")
  return linkSourcesToRoutes(localizeInstanceText(markdown).replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*\n?/gm, ""))
    .replace(/\]\(#([^)\s]*)\)/g, (_match, id: string) => `](${pagePath}#${id})`)
    .replace(/\]\(\/(?!\/)/g, `](${root}/`)
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const link = (title: string, url: string, note?: string) => `- [${title}](${url})${note ? `: ${note}` : ""}`

/** Pages of the hosted service listed after the price: the manifesto (#1259), the citation page (#1323), the free software page (#1326), the service continuity page (#1357), then practical pages (#871, #1258). */
export const RESOURCE_PATHS = ["/manifeste", "/citer", "/logiciel-libre-benevoles", "/continuite-du-service", "/tableur-ou-outil-dedie", "/ressources"]

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
  // A page with a Markdown variant is linked to it (`/fonctionnalites.md`); a page without one
  // (/blog, /doc, the privacy policy, the terms, the operator page) keeps its HTML address.
  const markdownUrl = (path: string) => url(markdownPathFor(path)!)
  const pageUrl = (page: PublicPage) => (page.source ? markdownUrl(page.path) : url(page.path))
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
  out.push(portableMarkdown(introduction(s.features), s.base, features.path), "")

  out.push("## Présentation", "")
  out.push(link("Accueil", markdownUrl("/"), "la présentation du service, ses questions fréquentes et comment commencer."))
  out.push(link(features.title, pageUrl(features), features.summary))
  // A section anchor only exists on the HTML page: a `.md` variant has no anchors.
  for (const section of markdownSections(s.features)) out.push(`  ${link(section.title, url(`${features.path}#${section.id}`))}`)
  if (pageAvailable(planning)) out.push(link(planning.title, pageUrl(planning), planning.summary))
  // The audience pages under their index (#872), then the price (#950): the hosted service's pages.
  const audienceIndex = PUBLIC_PAGES.find((p) => p.path === AUDIENCE_INDEX_PATH)!
  if (pageAvailable(audienceIndex)) {
    out.push(link(audienceIndex.title, pageUrl(audienceIndex), audienceIndex.summary))
    for (const page of AUDIENCE_PAGES.filter((p) => pageAvailable(p))) out.push(`  ${link(page.title, pageUrl(page), page.summary)}`)
  }
  const pricing = PUBLIC_PAGES.find((p) => p.path === "/tarifs")!
  if (pageAvailable(pricing)) out.push(link(pricing.title, pageUrl(pricing), pricing.summary))
  // The practical pages of the hosted service (#871): spreadsheet and chat group, or a tool?
  for (const path of RESOURCE_PATHS) {
    const page = PUBLIC_PAGES.find((p) => p.path === path)
    if (page && pageAvailable(page)) out.push(link(page.title, pageUrl(page), page.summary))
  }
  out.push(link(news.title, pageUrl(news), news.summary))
  out.push(link(blog.title, pageUrl(blog), blog.summary))
  out.push("")

  out.push("## Guides", "")
  for (const guide of DOC_GUIDES) out.push(link(guide.title, pageUrl(guide), guide.summary))
  out.push(link(docIndex.title, pageUrl(docIndex), "toutes les fiches, par thème."))
  out.push("")

  for (const group of DOC_GROUPS) {
    const inGroup = units.filter((u) => u.group === group.id)
    if (inGroup.length === 0) continue
    out.push(`## Documentation : ${group.title}`, "")
    for (const u of inGroup) out.push(link(u.title, markdownUrl(`/doc/${u.slug}`), `${u.summary} Pour : ${docUnitAudience(u)}.`))
    out.push("")
  }

  out.push("## Informations légales", "")
  for (const path of LEGAL_PATHS) {
    const page = PUBLIC_PAGES.find((p) => p.path === path)
    if (page && pageAvailable(page)) out.push(link(page.title, pageUrl(page), page.summary))
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
  const markdown = new Map((s.pages ?? []).map((p) => [p.path, p.markdown]))
  const citer = PUBLIC_PAGES.find((p) => p.path === "/citer")!
  const identity = pageAvailable(citer) ? identityMarkdown(s.citer) : ""
  const parts: string[] = [[`# ${SITE_NAME} : documentation complète`, "", `> ${s.summary}`, ...(identity ? ["", identity] : [])].join("\n")]
  const push = (section: LlmsSection) => parts.push(llmsSectionText(section, s.base))
  const page = (p: PublicPage, body?: string) => push(publicPageSection(p, body ?? markdown.get(p.path), s.base))

  // The home's own text is its FAQ (FAQ-ACCUEIL.md); the rest of the page is layout and media.
  push(homeSection(s.faq ?? "", s.base))

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
    if (path === "/ressources") (s.ressources ?? []).forEach((guide) => push(ressourceSection(guide, s.base)))
  }

  const news = PUBLIC_PAGES.find((p) => p.path === "/nouveautes")!
  if (pageAvailable(news)) push(newsSection(news, releasesMarkdown(s.releases ?? [], s.base, s.repositoryUrl)))

  const blog = PUBLIC_PAGES.find((p) => p.path === "/blog")!
  if (pageAvailable(blog)) {
    page(blog)
    for (const p of s.posts ?? []) push(blogPostSection(p, s.base))
  }

  for (const guide of DOC_GUIDES) if (pageAvailable(guide)) page(guide)
  const docIndex = PUBLIC_PAGES.find((p) => p.path === "/doc")!
  page(docIndex)
  for (const u of sortDocUnits(s.units)) push(docUnitSection(u, s.base))

  for (const path of LEGAL_PATHS) {
    const p = PUBLIC_PAGES.find((candidate) => candidate.path === path)
    if (p && pageAvailable(p)) page(p)
  }

  return `${parts.join("\n\n---\n\n")}\n`
}
