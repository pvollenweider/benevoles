// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * CHANGELOG.md, the only editorial source of what changed (Keep a Changelog, in French), read for
 * people rather than for developers: the public page /nouveautes (#757) and, later, the product
 * update email started from a version (#762). Pure: the caller reads the file.
 *
 * What is public, the convention (documented in CONTRIBUTING.md, « Le CHANGELOG ») :
 * - only released versions: a `## [x.y.z] — AAAA-MM-JJ` heading. `[Unreleased]` is never shown (not
 *   deployed yet), and a heading without a valid version or date is ignored, its content with it;
 * - only the sections that speak to organisers and volunteers (PUBLIC_SECTIONS: « En bref »,
 *   « Ajouté », « Modifié », « Corrigé », « Sécurité »...). « Mise à jour depuis … »,
 *   « Infrastructure », « Refactoring », « Documentation » are for whoever runs or develops the
 *   application and stay on GitHub;
 * - inside a public section, a bullet that ends with `<!-- interne -->` is left out (a test, a
 *   monitoring setting). The marker is an HTML comment: invisible on GitHub, nothing rewritten;
 * - a heading in a version's intro (before its first `### `) becomes a bold paragraph, so the
 *   page never skips from the version's <h2> to an <h4>;
 * - a section left empty is dropped, and so is a version left with nothing to say.
 */

/** A section of a version, as written (`### Ajouté`), its Markdown filtered for the public. */
export type ChangelogSection = { title: string; markdown: string }

export type ChangelogRelease = {
  /** As written between the brackets: "2.1.0", "1.0.0-beta.6". Also the anchor on /nouveautes. */
  version: string
  /** Release date, ISO (AAAA-MM-JJ). */
  date: string
  /** The text between the version heading and its first section ("" when there is none). */
  intro: string
  sections: ChangelogSection[]
}

/** The marker of a bullet kept out of the public page: an HTML comment, invisible on GitHub. */
export const INTERNAL_MARKER = "<!-- interne -->"

/**
 * The sections shown to the public, by the start of their title: « Ajouté (repris de … ) » is an
 * « Ajouté ». Any other section (« Mise à jour depuis 2.0.x », « Infrastructure », « Refactoring »,
 * « Documentation ») is for operators and developers.
 */
export const PUBLIC_SECTIONS = [
  "En bref",
  "Ajouté",
  "Modifié",
  "Amélioré",
  "Corrigé",
  "Corrections notables",
  "Supprimé",
  "Sécurité",
  "Accessibilité",
  "Fonctionnalités",
] as const

const VERSION_HEADING = /^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)\]\s+[—–-]\s+(\d{4})-(\d{2})-(\d{2})\s*$/
const SECTION_HEADING = /^### (.+?)\s*$/
const LIST_ITEM = /^[-*+] /

/**
 * A line of a version's intro (before its first `### ` section). A heading there would render as
 * an <h4> straight under the version's <h2>, skipping a level: it becomes a bold paragraph.
 */
function introLine(line: string): string {
  const heading = line.match(/^#{4,6}\s+(.+?)\s*#*\s*$/)
  return heading ? `**${heading[1]}**` : line
}

/** Whether a section title is one of the public sections (by its start, case and accents as written). */
export function isPublicSection(title: string): boolean {
  return PUBLIC_SECTIONS.some((s) => title === s || title.startsWith(`${s} `))
}

/** A real calendar date, so 2026-02-30 is a malformed heading rather than 2 March. */
function isoDate(year: string, month: string, day: string): string | null {
  const iso = `${year}-${month}-${day}`
  const d = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null
}

/**
 * The Markdown of a block without its internal bullets: a top-level bullet runs until the next
 * line that starts at the margin (another bullet, a paragraph, a heading), its indented sub-items
 * and continuation lines with it. Then the remaining HTML comments go, the `---` that separates
 * versions, and the blank lines around.
 */
export function publicMarkdown(markdown: string): string {
  const blocks: { item: boolean; lines: string[] }[] = []
  for (const line of markdown.split("\n")) {
    const atMargin = line.length > 0 && !/^\s/.test(line)
    if (LIST_ITEM.test(line)) blocks.push({ item: true, lines: [line] })
    else if (atMargin || blocks.length === 0) blocks.push({ item: false, lines: [line] })
    else blocks[blocks.length - 1].lines.push(line)
  }
  // An internal bullet goes, but not the blank lines after it, which separate what follows.
  const trailingBlanks = (lines: string[]) => lines.slice(lines.findLastIndex((l) => l.trim() !== "") + 1)
  let text = blocks
    .flatMap((b) => (b.item && b.lines.join("\n").includes(INTERNAL_MARKER) ? trailingBlanks(b.lines) : b.lines))
    .filter((line) => line.trim() !== "---")
    .join("\n")
  // Until nothing changes: removing one comment must not leave another one assembled from its
  // pieces (« <!<!-- -->-- »). The HTML is sanitized after rendering anyway (DOMPurify).
  for (let previous = ""; previous !== text; ) {
    previous = text
    text = text.replace(/[ \t]*<!--[\s\S]*?-->/g, "")
  }
  return text.replace(/\n{3,}/g, "\n\n").trim()
}

/**
 * The released versions of CHANGELOG.md, newest first (by date, the file's order between two
 * versions of the same day), each with its public sections only (see the convention above).
 */
export function parseChangelog(markdown: string): ChangelogRelease[] {
  type Draft = { version: string; date: string; intro: string[]; sections: { title: string; lines: string[] }[] }
  const drafts: Draft[] = []
  // null: outside a released version (the file's header, [Unreleased], a malformed heading).
  let current: Draft | null = null
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.startsWith("## ")) {
      const m = line.match(VERSION_HEADING)
      const date = m ? isoDate(m[2], m[3], m[4]) : null
      current = m && date ? { version: m[1], date, intro: [], sections: [] } : null
      if (current) drafts.push(current)
      continue
    }
    if (!current) continue
    const section = line.match(SECTION_HEADING)
    if (section) current.sections.push({ title: section[1], lines: [] })
    else if (current.sections.length > 0) current.sections[current.sections.length - 1].lines.push(line)
    else current.intro.push(introLine(line))
  }

  const releases = drafts
    .map((d): ChangelogRelease => ({
      version: d.version,
      date: d.date,
      intro: publicMarkdown(d.intro.join("\n")),
      sections: d.sections
        .filter((s) => isPublicSection(s.title))
        .map((s) => ({ title: s.title, markdown: publicMarkdown(s.lines.join("\n")) }))
        .filter((s) => s.markdown !== ""),
    }))
    .filter((r) => r.intro !== "" || r.sections.length > 0)
  // Array.prototype.sort is stable: two versions of the same day keep the file's order.
  return releases.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/** One released version by its number, as written ("2.1.0"), or null when it has nothing public. */
export function findRelease(releases: readonly ChangelogRelease[], version: string): ChangelogRelease | null {
  return releases.find((r) => r.version === version) ?? null
}

/**
 * A version's public content as one Markdown document: its intro, then each section under a
 * `### ` heading, as in CHANGELOG.md. What a product update email starts from (#762).
 */
export function releaseMarkdown(release: ChangelogRelease): string {
  return [release.intro, ...release.sections.map((s) => `### ${s.title}\n\n${s.markdown}`)].filter(Boolean).join("\n\n")
}

/**
 * Links to files of the repository that the site doesn't publish (`](docs/deploiement.md#x)`),
 * made absolute on GitHub, where they can be read: relative, they would lead to a 404 on the site.
 * Run after linkSourcesToRoutes, which has already made the published sources site links; a site
 * path, an anchor, a full URL or an email address is left alone.
 */
export function repositoryLinks(markdown: string, repositoryUrl: string): string {
  return markdown.replace(/\]\((?!\/|#|[a-z][a-z0-9+.-]*:)(?:\.\/)?([^)\s]+)\)/gi, (_match, target: string) => `](${repositoryUrl}/blob/main/${target})`)
}

const MONTHS =["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]

/** "2026-10-06" as people read it: "6 octobre 2026" ("1er" for the first of the month). */
export function formatReleaseDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number)
  return `${day === 1 ? "1er" : day} ${MONTHS[month - 1]} ${year}`
}
