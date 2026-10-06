// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { parseVideoReference, resolveVideoReference, type Video } from "@/lib/video-catalog"

/**
 * Videos referenced from the documentation by their stable id (#645). A guide (GUIDE_ADMIN.md,
 * GUIDE_BENEVOLE.md, FEATURES.md...) writes, on its own line and at the start of the line:
 *
 *     <!-- video: ORG_FIRST_STEPS -->
 *
 * An HTML comment, so GitHub shows nothing; the public page renders it as a short link to
 * /videos/<ID>, with the title and duration taken from the video catalogue (one catalogue, never
 * two: the guide holds the id only). Nothing is rendered when the video isn't published or has no
 * render to play, so a guide never links to « Vidéo bientôt disponible ». Pure, no fs: the server
 * side (src/lib/public-content.ts) loads the catalogue and passes it in.
 */

/** A whole line that is an HTML comment starting with « video » (any case): a reference, well formed or not. */
const VIDEO_COMMENT_LINE_RE = /^<!--\s*(video\b[\s\S]*?)\s*-->$/i

/** The stable id of a `<!-- video: ID -->` comment (surrounding whitespace allowed), or null for any other HTML. */
export function videoReferenceId(html: string): string | null {
  const match = html.trim().match(VIDEO_COMMENT_LINE_RE)
  return match ? parseVideoReference(match[1]) : null
}

export type DocVideoReference = {
  /** 1-based line number in the source. */
  line: number
  /** The comment as written. */
  raw: string
  /** The stable id, or null when the comment is malformed (`<!-- video ORG -->`, lower case id...). */
  id: string | null
}

/** Every video reference of a Markdown source, malformed ones included, so a test can reject them. */
export function findVideoReferences(markdown: string): DocVideoReference[] {
  return markdown.split("\n").flatMap((text, index) => {
    const raw = text.trim()
    if (!/^<!--\s*video/i.test(raw)) return []
    return [{ line: index + 1, raw, id: videoReferenceId(raw) }]
  })
}

export type DocVideoLink = { href: string; label: string }

/**
 * The card's duration: « 3 min », or « 1 h 05 min » from an hour on (the gallery's « 1 h 05 »
 * reads as a time of day out of context). Never under 1 min.
 */
export function docVideoDuration(durationMs: number): string {
  const totalMinutes = Math.max(1, Math.round(durationMs / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} min`
  if (minutes === 0) return `${hours} h`
  return `${hours} h ${String(minutes).padStart(2, "0")} min`
}

/**
 * Query string on the card's link only (never in its text): the video page's feedback (#646)
 * records that the viewer came from the documentation. Ignored by the page until then.
 */
export const DOC_VIDEO_FROM = "from=doc"

/**
 * The link a reference renders, or null when it renders nothing: unknown id, video not published,
 * or no render to play (`hasRender`, false without VIDEO_MEDIA_BASE_URL — the detail page would
 * only say « Vidéo bientôt disponible »).
 */
export function docVideoLink(id: string, catalog: Video[], hasRender: (video: Video) => boolean): DocVideoLink | null {
  const video = resolveVideoReference(id, catalog)
  if (!video || !video.published || !hasRender(video)) return null
  // Non-breaking space before the colon (French typography): the colon never starts a line.
  return { href: `/videos/${video.id}?${DOC_VIDEO_FROM}`, label: `Voir la vidéo\u00a0: ${video.title} (${docVideoDuration(video.durationMs)})` }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

/** Marks the paragraph so the content frame (ContentShell) can draw it as a card. */
export const DOC_VIDEO_ATTRIBUTE = "data-doc-video"

/**
 * The card's HTML: one paragraph holding one ordinary link, opened in the same tab, without
 * autoplay (only the video library's own links ask for it, src/components/videos/AutoplayLink.tsx).
 * The link's text carries the whole meaning (title and duration); the card's border and background
 * only group it visually.
 */
export function renderDocVideoCard(link: DocVideoLink): string {
  return `<p ${DOC_VIDEO_ATTRIBUTE}="true"><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></p>\n`
}
