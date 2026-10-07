// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import fs from "fs"
import path from "path"
import { renderEventPageMarkdown } from "@/lib/event-page-markdown"
import { linkSourcesToRoutes, splitTitle } from "@/lib/doc-pages"
import { docVideoLink, docVideoPlayer, findVideoReferences, renderDocVideoCard, renderDocVideoSlot, splitAtDocVideoSlots, type DocUnitPart, type DocVideoPlayer } from "@/lib/doc-video-references"
import { resolveVideoReference, videoMediaUrls, type Video } from "@/lib/video-catalog"
import { parseFeaturesPage, type FeatureAction, type FeatureBlock, type FeatureImage, type FeatureStep } from "@/lib/features-page"
import { loadVideoCatalog } from "@/lib/video-catalog-load"
import type { DocUnit } from "@/lib/doc-units"
import { formatReleaseDate, parseChangelog, repositoryLinks } from "@/lib/changelog"
import { REPOSITORY_URL } from "@/lib/structured-data"

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
 */
export function renderPublicSource(source: string, fallbackTitle: string, mediaBaseUrl?: string | null): { title: string; html: string } {
  const raw = fs.readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), source), "utf-8")
  const { title, body } = splitTitle(raw)
  return { title: title ?? fallbackTitle, html: renderPublicMarkdown(body, mediaBaseUrl) }
}

/**
 * A documentation unit's HTML (#649, src/lib/doc-units.ts), the same rendering as the guides: its
 * own heading ids (one slugger per unit), its video link, links between sources made site links.
 */
export function renderDocUnit(unit: DocUnit, mediaBaseUrl?: string | null): string {
  return renderPublicMarkdown(unit.body, mediaBaseUrl)
}

/**
 * A documentation unit as its page draws it (#649): the same HTML as `renderDocUnit`, cut where a
 * video is referenced, the inline player's data in its place (src/lib/doc-video-references.ts,
 * `splitAtDocVideoSlots`); nothing there when the video can't play.
 */
export function renderDocUnitParts(unit: DocUnit, mediaBaseUrl?: string | null): DocUnitPart[] {
  const catalog = findVideoReferences(unit.body).length > 0 ? videoCatalog() : []
  const players = new Map<string, DocVideoPlayer>()
  const videoSlot = (id: string) => {
    const player = docVideoPlayer(id, catalog, mediaBaseUrl)
    if (!player) return ""
    players.set(id, player)
    return renderDocVideoSlot(id)
  }
  const html = renderEventPageMarkdown(linkSourcesToRoutes(unit.body), { shiftHeadings: false, headingIds: true, videoCard: videoSlot })
  return splitAtDocVideoSlots(html, players)
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
function renderPublicMarkdown(body: string, mediaBaseUrl?: string | null): string {
  const catalog = findVideoReferences(body).length > 0 ? videoCatalog() : []
  const hasRender = (video: Video) => videoMediaUrls(video.slug, mediaBaseUrl) !== null
  const videoCard = (id: string) => {
    const link = docVideoLink(id, catalog, hasRender)
    return link ? renderDocVideoCard(link) : ""
  }
  return renderEventPageMarkdown(linkSourcesToRoutes(body), { shiftHeadings: false, headingIds: true, videoCard })
}

/** A still of a video (its poster), as /fonctionnalites shows it: never a broken image. */
export type FeatureStill = { src: string; width: number; height: number; alt: string }

export type RenderedFeatureBlock = {
  /** The block's HTML, cut where its videos go (the inline player in their place). */
  parts: DocUnitPart[]
  actions: FeatureAction[]
  stills: FeatureStill[]
}

export type RenderedFeaturesPage = {
  title: string
  intro: RenderedFeatureBlock
  sections: (RenderedFeatureBlock & { heading: string; id: string; steps: FeatureStep[] | null })[]
}

/**
 * FEATURES.md as /fonctionnalites draws it (src/lib/features-page.ts): each block's Markdown as
 * HTML (links between sources made site links), its actions, the stills and players of the videos
 * it names. A still needs a published video whose posters were generated (videos/renders.json) and
 * VIDEO_MEDIA_BASE_URL; a player, a render to play. Otherwise nothing, never a broken image.
 */
export function renderFeaturesPage(mediaBaseUrl?: string | null): RenderedFeaturesPage {
  const raw = fs.readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "FEATURES.md"), "utf-8")
  const page = parseFeaturesPage(raw)
  const catalog = videoCatalog()
  const still = (image: FeatureImage): FeatureStill | null => {
    const video = resolveVideoReference(image.videoId, catalog)
    if (!video || !video.published || !video.render) return null
    const poster = videoMediaUrls(video.slug, mediaBaseUrl, video.render)?.poster
    return poster ? { src: poster, width: video.render.width, height: video.render.height, alt: image.alt } : null
  }
  const render = (block: FeatureBlock): RenderedFeatureBlock => {
    const players = new Map<string, DocVideoPlayer>()
    const videoSlot = (id: string) => {
      const player = docVideoPlayer(id, catalog, mediaBaseUrl)
      if (!player) return ""
      players.set(id, player)
      return renderDocVideoSlot(id)
    }
    const html = block.markdown ? renderEventPageMarkdown(linkSourcesToRoutes(block.markdown), { shiftHeadings: false, videoCard: videoSlot }) : ""
    return {
      parts: splitAtDocVideoSlots(html, players),
      actions: block.actions,
      stills: block.images.map(still).filter((s): s is FeatureStill => s !== null),
    }
  }
  return {
    title: page.title ?? "Fonctionnalités",
    intro: render(page.intro),
    sections: page.sections.map((s) => ({ ...render(s), heading: s.heading, id: s.id, steps: s.steps })),
  }
}

/** A released version as /nouveautes draws it: its date for people, its intro and sections as HTML. */
export type RenderedRelease = {
  version: string
  /** ISO date, for <time dateTime>. */
  date: string
  /** « 6 octobre 2026 ». */
  dateLabel: string
  introHtml: string
  sections: { title: string; html: string }[]
}

/**
 * CHANGELOG.md as /nouveautes shows it (#757): its released versions, newest first, public
 * sections only (src/lib/changelog.ts). Links between sources become site links, links to other
 * files of the repository GitHub links (they aren't on the site); the headings
 * inside a section (#### in the 2.0.0 notes) keep their depth under the section's <h3>, without
 * ids, which would repeat from one version to the next.
 */
export function renderChangelog(): RenderedRelease[] {
  const raw = fs.readFileSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "CHANGELOG.md"), "utf-8")
  const html = (markdown: string) => (markdown ? renderEventPageMarkdown(repositoryLinks(linkSourcesToRoutes(markdown), REPOSITORY_URL), { shiftHeadings: false }) : "")
  return parseChangelog(raw).map((r) => ({
    version: r.version,
    date: r.date,
    dateLabel: formatReleaseDate(r.date),
    introHtml: html(r.intro),
    sections: r.sections.map((s) => ({ title: s.title, html: html(s.markdown) })),
  }))
}
