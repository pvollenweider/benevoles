// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { linkSourcesToRoutes, splitTitle } from "@/lib/doc-pages"
import { createHeadingSlugger } from "@/lib/heading-anchors"
import { videoReferenceId } from "@/lib/doc-video-references"

/**
 * The structure of FEATURES.md as /fonctionnalites lays it out: FEATURES.md stays the only copy of
 * the page's content (AGENTS.md), the page only arranges it. Plain Markdown that reads well on
 * GitHub, plus three conventions, each an HTML comment on its own line (GitHub shows nothing):
 *
 *     <!-- video: ADMIN_FEATURES_OVERVIEW -->         the video's inline player (src/lib/doc-video-references.ts)
 *     <!-- image: STAFFING_GAPS | Texte alternatif --> a still of that video (its poster), with its alt text
 *     <!-- actions -->                                 the list of links right below becomes buttons
 *
 * The text before the first `## ` is the page's opening; each `## ` opens a section, its id the
 * heading's slug (the same anchors as the rest of the site, src/lib/heading-anchors.ts). A section
 * made of a single ordered list whose items start with a bold title is drawn as numbered steps; a
 * section made only of `### Question ?` headings, each followed by its answer, is a list of
 * questions (the FAQ of an editorial page, also its FAQPage structured data). The same layout
 * serves other sources than FEATURES.md (the editorial pages, src/lib/doc-pages.ts).
 * Pure: the page resolves the videos and renders the Markdown (src/lib/public-content.ts).
 */

export type FeatureAction = { label: string; href: string }
export type FeatureImage = { videoId: string; alt: string }
export type FeatureStep = { title: string; text: string }
/** A question of a FAQ section, its answer as written (Markdown). */
export type FeatureQuestion = { question: string; id: string; answer: string }

export type FeatureBlock = {
  /** The Markdown once the images and actions are taken out (video lines stay, where the players go). */
  markdown: string
  actions: FeatureAction[]
  images: FeatureImage[]
  videos: string[]
}

export type FeatureSection = FeatureBlock & {
  heading: string
  id: string
  /** Set when the section is a single ordered list of « **Title.** text » items. */
  steps: FeatureStep[] | null
  /** Set when the section is made only of « ### Question » headings with their answers. */
  faq: FeatureQuestion[] | null
}

export type FeaturesPage = { title: string | null; intro: FeatureBlock; sections: FeatureSection[] }

const IMAGE_RE = /^<!--\s*image:\s*([A-Z][A-Z0-9_]+)\s*\|\s*([\s\S]+?)\s*-->$/
const ACTIONS_RE = /^<!--\s*actions\s*-->$/i
const LINK_ITEM_RE = /^[-*]\s+\[([^\]]+)\]\(([^)\s]+)\)\s*$/

/**
 * An action's address as the site serves it: a link to a source file (`guide/premiers-pas.md`,
 * `GUIDE_ADMIN.md#x`) becomes its page, like the links of the text (`linkSourcesToRoutes`); the
 * buttons are drawn from the raw list, so without this they pointed at a file path that 404s (#759).
 */
export function actionHref(href: string): string {
  const routed = linkSourcesToRoutes(`](${href})`)
  return routed.slice(2, -1)
}

/** A block's conventions taken out of its Markdown. An image or a video with a malformed id is dropped. */
export function parseFeatureBlock(markdown: string): FeatureBlock {
  const lines = markdown.split("\n")
  const kept: string[] = []
  const actions: FeatureAction[] = []
  const images: FeatureImage[] = []
  const videos: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (/^<!--\s*image\b/i.test(line)) {
      // A malformed image line (lower-case id, no alt text) shows nothing, like a malformed video.
      const image = line.match(IMAGE_RE)
      if (image) images.push({ videoId: image[1], alt: image[2].replace(/\s+/g, " ") })
      continue
    }
    if (line.startsWith("<!--") && /^<!--\s*video\b/i.test(line)) {
      // Kept in place: the page draws the player where the line stands.
      const id = videoReferenceId(line)
      if (id) videos.push(id)
      kept.push(lines[i])
      continue
    }
    if (ACTIONS_RE.test(line)) {
      // The list right below (blank lines before it allowed) holds the actions.
      let j = i + 1
      while (j < lines.length && lines[j].trim() === "") j++
      while (j < lines.length) {
        const item = lines[j].trim().match(LINK_ITEM_RE)
        if (!item) break
        actions.push({ label: item[1], href: actionHref(item[2]) })
        j++
      }
      i = j - 1
      continue
    }
    kept.push(lines[i])
  }
  return { markdown: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(), actions, images, videos }
}

/** « 1. **Title.** text » items (comment lines ignored), or null when the Markdown is anything else than such a list. */
export function parseSteps(markdown: string): FeatureStep[] | null {
  const lines = markdown.split("\n").filter((l) => l.trim() !== "" && !l.trim().startsWith("<!--"))
  if (lines.length === 0) return null
  const steps: FeatureStep[] = []
  for (const line of lines) {
    const m = line.trim().match(/^\d+\.\s+\*\*(.+?)\*\*\s*(.*)$/)
    if (!m) return null
    steps.push({ title: m[1].trim(), text: m[2].trim() })
  }
  return steps
}

/**
 * « ### Question » headings, each with the answer below it, or null when the Markdown is anything
 * else (text before the first question, a question without an answer). `slug` gives each question
 * its anchor, from the page's own slugger so ids never repeat.
 */
export function parseFaq(markdown: string, slug: (text: string) => string): FeatureQuestion[] | null {
  const trimmed = markdown.trim()
  if (!trimmed.startsWith("### ")) return null
  const entries: { question: string; answer: string }[] = []
  for (const chunk of trimmed.split(/^### +/m).slice(1)) {
    const newline = chunk.indexOf("\n")
    const question = (newline === -1 ? chunk : chunk.slice(0, newline)).replace(/ +#*$/, "").trim()
    const answer = newline === -1 ? "" : chunk.slice(newline + 1).trim()
    if (!question || !answer || /^#{1,6} /m.test(answer)) return null
    entries.push({ question, answer })
  }
  // Slugged once the whole section is known to be a FAQ, so a section that isn't uses no id.
  return entries.map((e) => ({ ...e, id: slug(e.question) }))
}

/**
 * An answer as plain text, for the FAQPage structured data: the same words the page shows, links
 * kept as their text, emphasis and code marks dropped, paragraphs and list items on one line.
 */
export function plainAnswer(markdown: string): string {
  return markdown
    .replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, "$1$2")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[ \t]*(?:[-*]|\d+\.)[ \t]+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** A source laid out by the page (FEATURES.md, an editorial page) as the page arranges it. */
export function parseFeaturesPage(source: string): FeaturesPage {
  const { title, body } = splitTitle(source)
  const slug = createHeadingSlugger()
  const chunks = body.split(/^## +/m)
  const intro = parseFeatureBlock(chunks[0])
  const sections = chunks.slice(1).map((chunk): FeatureSection => {
    const newline = chunk.indexOf("\n")
    const heading = (newline === -1 ? chunk : chunk.slice(0, newline)).replace(/ +#*$/, "").trim()
    const block = parseFeatureBlock(newline === -1 ? "" : chunk.slice(newline + 1))
    const id = slug(heading)
    return { heading, id, ...block, steps: parseSteps(block.markdown), faq: parseFaq(block.markdown, slug) }
  })
  return { title, intro, sections }
}

/** A `mailto:` action: the address it writes to, for the button's accessible name; null otherwise. */
export function mailtoAddress(href: string): string | null {
  const m = href.match(/^mailto:([^?]+)/i)
  return m ? decodeURIComponent(m[1]) : null
}
