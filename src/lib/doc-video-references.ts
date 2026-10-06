// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { parseVideoReference, resolveVideoReference, videoMediaUrls, type Audience, type Video, type VideoMediaUrls } from "@/lib/video-catalog"

/**
 * Videos referenced from the documentation by their stable id (#645). A source (GUIDE_ADMIN.md,
 * guide/<page>.md, FEATURES.md...) writes, on its own line and at the start of the line:
 *
 *     <!-- video: ORG_FIRST_STEPS -->
 *
 * An HTML comment, so GitHub shows nothing; a guide page renders it as a short link to
 * /videos/<ID>, a documentation unit (/doc/<slug>) as a button that opens the player in place
 * (`docVideoPlayer`, src/components/videos/DocVideoInline.tsx), with the title and duration taken
 * from the video catalogue (one catalogue, never two: the guide holds the id only). Nothing is rendered when the video isn't published or has no
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

/**
 * Everything a documentation unit's inline player needs for one reference, or null when it renders
 * nothing (the same rule as `docVideoLink`: published, with a render to play). The unit page draws
 * it in place of the card (DocVideoInline): the button « Voir la vidéo : <titre> (<durée>) » opens
 * the player right there, without leaving the documentation; `libraryHref` is the plain link
 * rendered before hydration (no JavaScript) and the « Ouvrir dans la bibliothèque » link below the
 * player. Plain data, safe to pass to a client component.
 */
export type DocVideoPlayer = {
  id: string
  title: string
  /** « Voir la vidéo : <titre> (<durée>) », the button's and the fallback link's text. */
  label: string
  /** /videos/<ID>?from=doc */
  libraryHref: string
  revision: number
  audience: Audience[]
  media: VideoMediaUrls
  /** The frame's ratio, from the recording viewport (« 1280 / 800 »), so the player keeps its height before the metadata loads. */
  aspectRatio: string
  /** The narration, one paragraph per segment: the « Transcription » under the player. */
  transcript: string[]
}

export function docVideoPlayer(id: string, catalog: Video[], mediaBaseUrl: string | undefined | null): DocVideoPlayer | null {
  const media = (video: Video) => videoMediaUrls(video.slug, mediaBaseUrl)
  const link = docVideoLink(id, catalog, (video) => media(video) !== null)
  const video = link ? resolveVideoReference(id, catalog) : null
  const urls = video ? media(video) : null
  if (!link || !video || !urls) return null
  const { width, height } = video.manifest.viewport
  return {
    id: video.id,
    title: video.title,
    label: link.label,
    libraryHref: link.href,
    revision: video.revision,
    audience: [...video.audience],
    media: urls,
    aspectRatio: width > 0 && height > 0 ? `${width} / ${height}` : "16 / 9",
    transcript: video.manifest.segments.map((segment) => segment.transcript).filter((text) => text.trim() !== ""),
  }
}

/**
 * Where a unit's player goes: an empty paragraph carrying the video id, which the sanitizer keeps
 * (DOC_VIDEO_ATTRIBUTE is allowed) and `splitAtDocVideoSlots` then cuts the HTML at. A reference
 * stands on its own line between blank lines (guarded by the tests over the sources), so the slot
 * is always a top-level block and both halves are whole HTML.
 */
export function renderDocVideoSlot(id: string): string {
  return `<p ${DOC_VIDEO_ATTRIBUTE}="${escapeHtml(id)}"></p>\n`
}

const DOC_VIDEO_SLOT_RE = new RegExp(`<p ${DOC_VIDEO_ATTRIBUTE}="([A-Z][A-Z0-9_]*)"></p>\\n?`, "g")

export type DocUnitPart = { kind: "html"; html: string } | { kind: "video"; player: DocVideoPlayer }

/**
 * A unit's HTML cut at its video slots: the HTML around them, and in their place the player of
 * each slot's video. A slot whose id has no player (`players` lacks it) disappears; empty HTML
 * chunks are dropped.
 */
export function splitAtDocVideoSlots(html: string, players: ReadonlyMap<string, DocVideoPlayer>): DocUnitPart[] {
  const parts: DocUnitPart[] = []
  let last = 0
  const pushHtml = (chunk: string) => {
    if (chunk.trim() !== "") parts.push({ kind: "html", html: chunk })
  }
  for (const match of html.matchAll(DOC_VIDEO_SLOT_RE)) {
    pushHtml(html.slice(last, match.index))
    const player = players.get(match[1])
    if (player) parts.push({ kind: "video", player })
    last = match.index + match[0].length
  }
  pushHtml(html.slice(last))
  return parts
}
