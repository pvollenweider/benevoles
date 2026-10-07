// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { DOC_GUIDES, PUBLIC_PAGES, linkSourcesToRoutes, splitTitle } from "@/lib/doc-pages"
import { DOC_GROUPS, docUnitAudience, sortDocUnits, type DocUnit } from "@/lib/doc-units"
import { createHeadingSlugger } from "@/lib/heading-anchors"
import { SITE_NAME, absoluteUrl } from "@/lib/seo-metadata"

/**
 * /llms.txt and /llms-full.txt (llmstxt.org): the apex site summed up for AI assistants, in plain
 * Markdown. Built from the same sources as the pages (FEATURES.md, the guides' introductions,
 * guide/<slug>.md and the registry of src/lib/doc-pages.ts), so it can never drift from them: a
 * new unit or page appears here as soon as it appears on the site. Pure: the routes read the files
 * and pass them in, with the base URL of the running deployment.
 */

export type LlmsSources = {
  /** Base URL of the apex host. */
  base: string
  /** One line saying what benevol.app is (the home's description). */
  summary: string
  /** FEATURES.md, as written. */
  features: string
  units: readonly DocUnit[]
  /** Link to the source code. */
  repositoryUrl: string
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
  return linkSourcesToRoutes(markdown.replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*\n?/gm, ""))
    .replace(/\]\(\/(?!\/)/g, `](${root}/`)
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

const link = (title: string, url: string, note?: string) => `- [${title}](${url})${note ? `: ${note}` : ""}`

const LEGAL_PATHS = ["/legal/privacy", "/legal/terms", "/legal/sous-traitance", "/legal/sous-traitants", "/accessibilite"]

/** /llms.txt: what benevol.app is, then every public page by theme, each with its one-line summary. */
export function llmsTxt(s: LlmsSources): string {
  const url = (path: string) => absoluteUrl(s.base, path)
  const features = PUBLIC_PAGES.find((p) => p.path === "/fonctionnalites")!
  const docIndex = PUBLIC_PAGES.find((p) => p.path === "/doc")!
  const news = PUBLIC_PAGES.find((p) => p.path === "/nouveautes")!
  const units = sortDocUnits(s.units)
  const out: string[] = [`# ${SITE_NAME}`, "", `> ${s.summary}`, "", portableMarkdown(introduction(s.features), s.base), ""]

  out.push("## Présentation", "")
  out.push(link("Accueil", url("/"), "la présentation du service, ses questions fréquentes et comment commencer."))
  out.push(link(features.title, url(features.path), features.summary))
  for (const section of markdownSections(s.features)) out.push(`  ${link(section.title, url(`${features.path}#${section.id}`))}`)
  out.push(link(news.title, url(news.path), news.summary))
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
    if (page) out.push(link(page.title, url(page.path), page.summary))
  }
  out.push("")

  out.push("## Optional", "")
  out.push(link("Texte complet de la documentation", url("/llms-full.txt"), "les fonctionnalités, les guides et toutes les fiches en un seul fichier."))
  out.push(link("Code source", s.repositoryUrl, "licence AGPL-3.0, guide de déploiement pour installer benevol.app soi-même."))
  return `${out.join("\n").trim()}\n`
}

/**
 * /llms-full.txt: the features page, the guides' introductions and every unit in reading order,
 * each under its own title with its address, as one Markdown document.
 */
export function llmsFullTxt(s: LlmsSources & { guides: readonly { path: string; markdown: string }[] }): string {
  const url = (path: string) => absoluteUrl(s.base, path)
  const section = (title: string, path: string, markdown: string) =>
    [`# ${title}`, "", `Adresse : ${url(path)}`, "", portableMarkdown(markdown, s.base)].join("\n")
  const parts = [
    [`# ${SITE_NAME} : documentation complète`, "", `> ${s.summary}`].join("\n"),
    section(splitTitle(s.features).title ?? "Fonctionnalités", "/fonctionnalites", splitTitle(s.features).body),
    ...s.guides.map((g) => section(splitTitle(g.markdown).title ?? g.path, g.path, splitTitle(g.markdown).body)),
    ...sortDocUnits(s.units).map((u) => section(u.title, `/doc/${u.slug}`, `Pour : ${docUnitAudience(u)}.\n\n${u.body}`)),
  ]
  return `${parts.join("\n\n---\n\n")}\n`
}
