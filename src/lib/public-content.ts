// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import fs from "fs"
import path from "path"
import { renderEventPageMarkdown } from "@/lib/event-page-markdown"
import { linkSourcesToRoutes, splitTitle } from "@/lib/doc-pages"
import { docVideoLink, findVideoReferences, renderDocVideoCard } from "@/lib/doc-video-references"
import { videoMediaUrls, type Video } from "@/lib/video-catalog"
import { loadVideoCatalog } from "@/lib/video-catalog-load"
import type { DocUnit } from "@/lib/doc-units"

// The catalogue doesn't change while the server runs (it's in the image), so production reads it
// once; in development it's read again on each render, so editing videos/catalog.json shows up.
let cachedCatalog: Video[] | null = null
function videoCatalog(): Video[] {
  if (process.env.NODE_ENV !== "production") return loadVideoCatalog()
  cachedCatalog ??= loadVideoCatalog()
  return cachedCatalog
}

/**
 * A public content page's HTML from its Markdown source at the repo root (server only). The file's
 * own "# " title becomes the page's single <h1>; the remaining headings (##, ###...) keep their
 * depth, each with a stable id, the slug of its text (#568), so links can open a given section.
 * Links to other source files become site links. The Dockerfile copies every source into
 * the runtime image: `output: "standalone"` only traces files Next itself detects.
 *
 * A `<!-- video: ID -->` line becomes a link to that video (#645, src/lib/doc-video-references.ts)
 * when it's published and `mediaBaseUrl` (VIDEO_MEDIA_BASE_URL) lets it play; otherwise nothing.
 * The pages pass the variable at request time, so they're rendered per request (force-dynamic).
 *
 * `shiftHeadings` renders every heading one level down (## → <h3>, capped at <h6>), for a guide
 * placed under a heading of its page (« Le guide complet », #649); the ids don't change.
 */
export function renderPublicSource(
  source: string,
  fallbackTitle: string,
  mediaBaseUrl?: string | null,
  options: { shiftHeadings?: boolean } = {},
): { title: string; html: string } {
  const raw = fs.readFileSync(path.join(process.cwd(), source), "utf-8")
  const { title, body } = splitTitle(raw)
  return { title: title ?? fallbackTitle, html: renderPublicMarkdown(body, mediaBaseUrl, options.shiftHeadings ?? false) }
}

/**
 * A documentation unit's HTML (#649, src/lib/doc-units.ts), the same rendering as the guides: its
 * own heading ids (one slugger per unit), its video link, links between sources made site links.
 */
export function renderDocUnit(unit: DocUnit, mediaBaseUrl?: string | null): string {
  return renderPublicMarkdown(unit.body, mediaBaseUrl)
}

/** The ids of the headings of a rendered page, in order (`<h2 id="…">`). */
export function headingIdsOf(html: string): string[] {
  return [...html.matchAll(/<h[1-6] id="([^"]+)"/g)].map((m) => m[1])
}

/** A unit's heading ids, as its page renders them: where a moved anchor can keep its fragment (#649). */
export function docUnitHeadingIds(unit: DocUnit): string[] {
  return headingIdsOf(renderDocUnit(unit))
}

/** The Markdown of a public source, without its title, as the page's HTML. */
function renderPublicMarkdown(body: string, mediaBaseUrl?: string | null, shiftHeadings = false): string {
  const catalog = findVideoReferences(body).length > 0 ? videoCatalog() : []
  const hasRender = (video: Video) => videoMediaUrls(video.slug, mediaBaseUrl) !== null
  const videoCard = (id: string) => {
    const link = docVideoLink(id, catalog, hasRender)
    return link ? renderDocVideoCard(link) : ""
  }
  return renderEventPageMarkdown(linkSourcesToRoutes(body), { shiftHeadings, headingIds: true, videoCard })
}
