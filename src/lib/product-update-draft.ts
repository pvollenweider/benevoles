// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { findRelease, formatReleaseDate, releaseMarkdown, repositoryLinks, type ChangelogRelease } from "@/lib/changelog"
import { linkSourcesToRoutes } from "@/lib/doc-pages"

/**
 * A product update email started from a released version of CHANGELOG.md (#762), so the email,
 * /nouveautes and the release notes say the same thing. Pure: the caller parses the file
 * (parseChangelog, the same filter as the page: public sections only, no internal bullet).
 *
 * - The content is the version's « En bref » when it has one (the email is a summary, the detail
 *   is on the page), otherwise all its public sections, as releaseMarkdown writes them.
 * - Links are the page's (linkSourcesToRoutes, then repositoryLinks), made absolute: an email has
 *   no site to resolve `/doc/…` against.
 * - It always ends with a link to the version on /nouveautes (`#<version>`, the page's anchor).
 * - It fits the send and test routes' limit: past it, whole blocks (a bullet with its sub-items,
 *   a paragraph) are left out from the end, never cut in the middle, and the closing line says so.
 */

/** The longest content the product update routes accept (their zod schemas). */
export const PRODUCT_UPDATE_CONTENT_MAX = 10000
/** The longest subject they accept. */
export const PRODUCT_UPDATE_SUBJECT_MAX = 150

/** The section a version's email starts from when the version has one. */
export const SUMMARY_SECTION = "En bref"

/** `dateLabel`: the release date as people read it (« 22 octobre 2026 »), for the version picker. */
export type ProductUpdateDraft = { version: string; date: string; dateLabel: string; subject: string; content: string }

export type DraftOptions = {
  /** The instance's name, as in the emails (siteName()). */
  siteName: string
  /** The site's base URL, without a trailing slash (apexBaseUrl()). */
  baseUrl: string
  /** The repository on GitHub, for links to files the site doesn't publish. */
  repositoryUrl: string
  maxLength?: number
}

/** `/nouveautes#<version>` on the site: the page's anchor for that version is its number. */
export function releasePageUrl(baseUrl: string, version: string): string {
  return `${baseUrl}/nouveautes#${encodeURIComponent(version)}`
}

/**
 * A Markdown link resolved for an email: a site path gets the base URL, an anchor alone points
 * to /nouveautes (where the version anchors live). Inline links (`](/x)`, `](</x>)`) and
 * reference definitions (`[x]: /x`) alike; full URLs and email addresses stay as they are.
 */
export function absoluteLinks(markdown: string, baseUrl: string): string {
  // The start of a destination: `](`, `](<`, or a reference definition's `[label]: ` (`<` optional).
  return markdown
    .replace(/(\]\(<?|^ {0,3}\[[^\]\n]+\]:[ \t]*<?)\/(?!\/)/gm, (_m, start: string) => `${start}${baseUrl}/`)
    .replace(/(\]\(<?|^ {0,3}\[[^\]\n]+\]:[ \t]*<?)#/gm, (_m, start: string) => `${start}${baseUrl}/nouveautes#`)
}

/**
 * The top-level blocks of a Markdown text, in order: a block starts at a bullet or a heading at
 * the margin, or at a line at the margin after a blank line or a heading (a new paragraph). It keeps what
 * follows until then: indented sub-items, blank lines, and the lines of the same paragraph or
 * bullet that continue at the margin. Joining the blocks with "\n" gives the text back.
 */
function topLevelBlocks(markdown: string): string[][] {
  const blocks: string[][] = []
  // Whether the previous line ends a block: a blank line, or a heading (always a single line).
  let previousEnds = true
  for (const line of markdown.split("\n")) {
    const blank = line.trim() === ""
    const heading = /^#{1,6}\s/.test(line)
    const atMargin = !blank && !/^\s/.test(line)
    const starts = atMargin && (previousEnds || heading || /^([-*+] |\d+[.)] )/.test(line))
    if (starts || blocks.length === 0) blocks.push([line])
    else blocks[blocks.length - 1].push(line)
    previousEnds = blank || heading
  }
  return blocks
}

const isHeadingBlock = (block: string[]) => /^#{1,6}\s/.test(block[0]) && block.slice(1).every((l) => l.trim() === "")

/**
 * The longest start of `markdown`, in whole blocks, at most `budget` characters, without a
 * heading left alone at its end. `truncated` when something was left out.
 */
export function fitBlocks(markdown: string, budget: number): { markdown: string; truncated: boolean } {
  if (markdown.length <= budget) return { markdown, truncated: false }
  const blocks = topLevelBlocks(markdown)
  const kept: string[][] = []
  for (const block of blocks) {
    const next = [...kept, block].map((b) => b.join("\n")).join("\n").trimEnd()
    if (next.length > budget) break
    kept.push(block)
  }
  while (kept.length > 0 && (isHeadingBlock(kept[kept.length - 1]) || kept[kept.length - 1].every((l) => l.trim() === ""))) kept.pop()
  return { markdown: kept.map((b) => b.join("\n")).join("\n").trimEnd(), truncated: true }
}

/** The email a version starts from, or null when the version isn't a released one with public content. */
export function productUpdateDraft(releases: readonly ChangelogRelease[], version: string, options: DraftOptions): ProductUpdateDraft | null {
  const release = findRelease(releases, version)
  if (!release) return null
  const { siteName, baseUrl, repositoryUrl, maxLength = PRODUCT_UPDATE_CONTENT_MAX } = options

  const summary = release.sections.find((s) => s.title === SUMMARY_SECTION)
  const body = releaseMarkdown(summary ? { ...release, sections: [summary] } : release)
  // The page's link pipeline (linkSourcesToRoutes, repositoryLinks: inline links), then absolute.
  const linked = absoluteLinks(repositoryLinks(linkSourcesToRoutes(body), repositoryUrl), baseUrl)
  // Reference definitions (`[g]: url`) render as nothing: set apart and always kept, at the end,
  // so a shortened text never keeps a `[texte][g]` whose definition was cut.
  const lines = linked.split("\n")
  const isDefinition = (line: string) => /^ {0,3}\[[^\]\n]+\]:\s/.test(line)
  const definitions = lines.filter(isDefinition).map((l) => l.trim()).join("\n")
  const text = lines.filter((l) => !isDefinition(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim()

  const date = formatReleaseDate(release.date)
  const opening = `Voici les nouveautés de la version ${release.version} de ${siteName}, publiée le ${date}.`
  const link = `[Nouveautés de la version ${release.version}](${releasePageUrl(baseUrl, release.version)})`
  const closing = (truncated: boolean) =>
    truncated ? `La suite de cette version n'est pas reprise ici, tout est sur la page ${link}.` : `Tout le détail sur la page ${link}.`

  // Budget for the body: what the opening, the longer closing, the definitions and the blank
  // lines between leave.
  const budget = maxLength - opening.length - closing(true).length - (definitions ? definitions.length + 2 : 0) - 4
  const fitted = fitBlocks(text, Math.max(0, budget))
  const content = [opening, fitted.markdown, closing(fitted.truncated), definitions].filter(Boolean).join("\n\n")

  // A long instance name (SITE_NAME) would make the subject too long for the routes: then without it.
  const named = `Nouveautés de ${siteName}, version ${release.version}`
  const subject = named.length <= PRODUCT_UPDATE_SUBJECT_MAX ? named : `Nouveautés de la version ${release.version}`

  return { version: release.version, date: release.date, dateLabel: date, subject, content }
}

/** One draft per released version, newest first, as the product updates screen offers them. */
export function productUpdateDrafts(releases: readonly ChangelogRelease[], options: DraftOptions): ProductUpdateDraft[] {
  return releases.map((r) => productUpdateDraft(releases, r.version, options)).filter((d): d is ProductUpdateDraft => d !== null)
}
