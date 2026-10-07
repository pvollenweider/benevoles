// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata, MetadataRoute } from "next"
import { videoMediaUrls, type Video, type VideoMediaUrls } from "@/lib/video-catalog"

/**
 * Search engines, AI crawlers and link previews for the video library (/videos, /videos/<ID>):
 * which pages are indexed, their metadata (canonical, Open Graph, X/Twitter), their structured data
 * (VideoObject, BreadcrumbList, CollectionPage) and the video sitemap (/video-sitemap.xml). Pure:
 * the pages pass the catalogue and the two base URLs (`VideoSeoContext`), read at request time.
 *
 * A video page is indexed when the video is published AND its render can be played here, the
 * player's own condition (`videoMediaUrls`, i.e. VIDEO_MEDIA_BASE_URL set): never a « Vidéo
 * bientôt disponible » page. Everything declared here is what the page shows: title, summary,
 * full transcript, duration, the video itself.
 */

export const VIDEO_SITE_NAME = "benevol.app"
export const VIDEO_LIBRARY_PATH = "/videos"
export const VIDEO_LIBRARY_NAME = "Bibliothèque vidéo"
export const VIDEO_LIBRARY_TITLE = "Tutoriels vidéo | benevol.app"
export const VIDEO_LIBRARY_OG_IMAGE_PATH = "/videos/og-image.png"
export const VIDEO_LIBRARY_OG_IMAGE_ALT = "Tutoriels vidéo benevol.app"
/** The site's default social card (src/app/og-image.png/route.tsx), when a video has no poster yet. */
export const DEFAULT_OG_IMAGE_PATH = "/og-image.png"
export const VIDEO_SITEMAP_PATH = "/video-sitemap.xml"

export type VideoSeoContext = {
  /** The public site, e.g. https://www.benevol.app: canonical URLs and the sitemap are built on it. */
  siteBase: string
  /** VIDEO_MEDIA_BASE_URL; without it nothing can be played, so nothing is indexed. */
  mediaBaseUrl: string | null | undefined
}

function trimBase(base: string): string {
  return base.trim().replace(/\/+$/, "")
}

export function videoLibraryUrl(siteBase: string): string {
  return `${trimBase(siteBase)}${VIDEO_LIBRARY_PATH}`
}

/** The canonical URL of a video: its stable id, never the slug nor `?from=doc`. */
export function videoPageUrl(siteBase: string, id: string): string {
  return `${videoLibraryUrl(siteBase)}/${encodeURIComponent(id)}`
}

function videoMedia(video: Video, mediaBaseUrl: string | null | undefined): VideoMediaUrls | null {
  return videoMediaUrls(video.slug, mediaBaseUrl, video.render)
}

/** Published and playable here: the page is indexed and declared as a video. */
export function isVideoIndexable(video: Video, mediaBaseUrl: string | null | undefined): boolean {
  return video.published && videoMedia(video, mediaBaseUrl) !== null
}

export function indexableVideos(videos: Video[], mediaBaseUrl: string | null | undefined): Video[] {
  return videos.filter((v) => isVideoIndexable(v, mediaBaseUrl))
}

/** Whole seconds, at least 1 (the video sitemap's `video:duration`). */
export function durationSeconds(durationMs: number): number {
  return Math.max(1, Math.round(durationMs / 1000))
}

/** ISO 8601 duration of schema.org's VideoObject: « PT2M4S », « PT1H5M », « PT45S ». */
export function isoDuration(durationMs: number): string {
  const total = durationSeconds(durationMs)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${s || (!h && !m) ? `${s}S` : ""}`
}

/** The catalogue's `updatedAt` (AAAA-MM-JJ) as a full ISO 8601 date-time with its time zone. */
export function videoUploadDate(updatedAt: string): string {
  return `${updatedAt}T00:00:00+00:00`
}

/** The narration, one paragraph per segment: the transcript the page shows under the player. */
export function videoTranscript(video: Video): string {
  return video.manifest.segments.map((s) => s.transcript.trim()).filter(Boolean).join("\n\n")
}

/** The video's thumbnail: its poster when generated, otherwise the site's social card. */
export function videoThumbnailUrl(video: Video, ctx: VideoSeoContext): string {
  return videoMedia(video, ctx.mediaBaseUrl)?.poster ?? `${trimBase(ctx.siteBase)}${DEFAULT_OG_IMAGE_PATH}`
}

export function videoPageTitle(video: Video): string {
  return `${video.title} | Tutoriel vidéo benevol.app`
}

/**
 * JSON for a `<script type="application/ld+json">`: `<`, `>` and `&` escaped so no text can close
 * the element or open a comment, and U+2028/U+2029 escaped for older JavaScript parsers.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}

function publisher(siteBase: string) {
  const base = trimBase(siteBase)
  return {
    "@type": "Organization",
    name: VIDEO_SITE_NAME,
    url: `${base}/`,
    logo: { "@type": "ImageObject", url: `${base}/apple-icon.png` },
  }
}

/** VideoObject + BreadcrumbList of an indexed video page; null for any other page (nothing to declare). */
export function videoJsonLd(video: Video, ctx: VideoSeoContext): Record<string, unknown> | null {
  const media = videoMedia(video, ctx.mediaBaseUrl)
  if (!video.published || !media) return null
  const base = trimBase(ctx.siteBase)
  const url = videoPageUrl(base, video.id)
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "VideoObject",
        "@id": `${url}#video`,
        url,
        name: video.title,
        description: video.manifest.viewer.summary,
        thumbnailUrl: media.poster && media.ogImage ? [media.poster, media.ogImage] : [videoThumbnailUrl(video, ctx)],
        uploadDate: videoUploadDate(video.updatedAt),
        duration: isoDuration(video.durationMs),
        contentUrl: media.video,
        inLanguage: "fr",
        isFamilyFriendly: true,
        transcript: videoTranscript(video),
        keywords: video.tags.join(", "),
        publisher: publisher(base),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: VIDEO_SITE_NAME, item: `${base}/` },
          { "@type": "ListItem", position: 2, name: VIDEO_LIBRARY_NAME, item: videoLibraryUrl(base) },
          { "@type": "ListItem", position: 3, name: video.title, item: url },
        ],
      },
    ],
  }
}

export function videoLibraryDescription(count: number): string {
  const n = count > 1 ? `${count} tutoriels vidéo` : count === 1 ? "Un tutoriel vidéo" : "Des tutoriels vidéo"
  return `${n} pour prendre en main benevol.app : créer un événement, construire le planning, inscrire les bénévoles, communiquer et préparer le jour J.`
}

/** CollectionPage of the gallery, its ItemList holding the indexed videos only, in gallery order. */
export function videoLibraryJsonLd(videos: Video[], ctx: VideoSeoContext): Record<string, unknown> {
  const base = trimBase(ctx.siteBase)
  const listed = indexableVideos(videos, ctx.mediaBaseUrl)
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${videoLibraryUrl(base)}#collection`,
    url: videoLibraryUrl(base),
    name: VIDEO_LIBRARY_TITLE,
    description: videoLibraryDescription(listed.length),
    inLanguage: "fr",
    publisher: publisher(base),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: listed.length,
      itemListElement: listed.map((v, i) => ({ "@type": "ListItem", position: i + 1, url: videoPageUrl(base, v.id), name: v.title })),
    },
  }
}

const INDEX_ROBOTS: Metadata["robots"] = {
  index: true,
  follow: true,
  googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 },
}

/** Metadata of /videos: indexed as soon as one video can be played; its own social card. */
export function videoLibraryMetadata(videos: Video[], ctx: VideoSeoContext): Metadata {
  const base = trimBase(ctx.siteBase)
  const url = videoLibraryUrl(base)
  const count = indexableVideos(videos, ctx.mediaBaseUrl).length
  const description = videoLibraryDescription(count)
  const image = { url: `${base}${VIDEO_LIBRARY_OG_IMAGE_PATH}`, width: 1200, height: 630, alt: VIDEO_LIBRARY_OG_IMAGE_ALT, type: "image/png" }
  return {
    title: { absolute: VIDEO_LIBRARY_TITLE },
    description,
    alternates: { canonical: url },
    robots: count > 0 ? INDEX_ROBOTS : { index: false, follow: true },
    openGraph: { type: "website", siteName: VIDEO_SITE_NAME, locale: "fr_CH", url, title: VIDEO_LIBRARY_TITLE, description, images: [image] },
    twitter: { card: "summary_large_image", title: VIDEO_LIBRARY_TITLE, description, images: [{ url: image.url, alt: image.alt }] },
  }
}

/**
 * Metadata of /videos/<ID>. Indexed video: canonical, `og:type` video.other with the poster
 * (1200 x 630) and the MP4 (`og:video`), X/Twitter large image card (no `twitter:player`: there is
 * no embeddable player page). Any other video: same title and canonical, but `noindex`.
 */
export function videoDetailMetadata(video: Video, ctx: VideoSeoContext): Metadata {
  const base = trimBase(ctx.siteBase)
  const url = videoPageUrl(base, video.id)
  const title = videoPageTitle(video)
  const description = video.description
  const common: Metadata = { title: { absolute: title }, description, alternates: { canonical: url } }
  const media = videoMedia(video, ctx.mediaBaseUrl)
  if (!video.published || !media) return { ...common, robots: { index: false, follow: true } }

  const alt = `Aperçu de la vidéo « ${video.title} »`
  const image = media.ogImage
    ? { url: media.ogImage, secureUrl: media.ogImage.startsWith("https:") ? media.ogImage : undefined, width: 1200, height: 630, alt, type: "image/jpeg" }
    : { url: `${base}${DEFAULT_OG_IMAGE_PATH}`, width: 1200, height: 630, alt, type: "image/png" }
  const ogVideo = {
    url: media.video,
    ...(media.video.startsWith("https:") ? { secureUrl: media.video } : {}),
    type: "video/mp4",
    ...(video.render ? { width: video.render.width, height: video.render.height } : {}),
  }
  return {
    ...common,
    robots: INDEX_ROBOTS,
    openGraph: {
      type: "video.other",
      siteName: VIDEO_SITE_NAME,
      locale: "fr_CH",
      url,
      title: video.title,
      description,
      images: [image],
      videos: [ogVideo],
    },
    twitter: { card: "summary_large_image", title: video.title, description, images: [{ url: image.url, alt }] },
  }
}

function xml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

/** Sitemap priority of the gallery and of a video page: under the guides' indexes, above a documentation unit. */
export const VIDEO_LIBRARY_PRIORITY = 0.7
export const VIDEO_PAGE_PRIORITY = 0.6

type VideoSitemapPage = { url: string; lastmod: string; video: Video | null }

/**
 * The pages both sitemaps list, the one selection: the gallery (when at least one video is
 * indexed, its last change the latest video's), then each indexed video page. Never an
 * unpublished or unplayable (« À venir ») video.
 */
function videoSitemapPages(videos: Video[], ctx: VideoSeoContext): VideoSitemapPage[] {
  const base = trimBase(ctx.siteBase)
  const listed = indexableVideos(videos, ctx.mediaBaseUrl)
  if (listed.length === 0) return []
  const latest = listed.map((v) => v.updatedAt).sort().at(-1)!
  return [
    { url: videoLibraryUrl(base), lastmod: latest, video: null },
    ...listed.map((video) => ({ url: videoPageUrl(base, video.id), lastmod: video.updatedAt, video })),
  ]
}

/**
 * The same pages for the apex sitemap.xml (src/app/sitemap.ts), without the video extension: the
 * video sitemap stays the one carrying it, this makes the pages reachable from the main sitemap.
 */
export function videoSitemapEntries(videos: Video[], ctx: VideoSeoContext): MetadataRoute.Sitemap {
  return videoSitemapPages(videos, ctx).map((p) => ({
    url: p.url,
    lastModified: new Date(`${p.lastmod}T00:00:00Z`),
    changeFrequency: "monthly" as const,
    priority: p.video ? VIDEO_PAGE_PRIORITY : VIDEO_LIBRARY_PRIORITY,
  }))
}

/**
 * The video sitemap (Google's video extension): the gallery, then one `<url>` per indexed video
 * page with its `<video:video>`. Lists nothing else, so the site's own sitemap index can point to it.
 */
export function videoSitemapXml(videos: Video[], ctx: VideoSeoContext): string {
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">`,
  ]
  for (const { url, lastmod, video } of videoSitemapPages(videos, ctx)) {
    if (!video) {
      lines.push(`<url>`, `<loc>${xml(url)}</loc>`, `<lastmod>${lastmod}</lastmod>`, `</url>`)
      continue
    }
    const media = videoMedia(video, ctx.mediaBaseUrl)!
    lines.push(
      `<url>`,
      `<loc>${xml(url)}</loc>`,
      `<lastmod>${lastmod}</lastmod>`,
      `<video:video>`,
      `<video:thumbnail_loc>${xml(videoThumbnailUrl(video, ctx))}</video:thumbnail_loc>`,
      `<video:title>${xml(video.title)}</video:title>`,
      `<video:description>${xml(video.manifest.viewer.summary.slice(0, 2048))}</video:description>`,
      `<video:content_loc>${xml(media.video)}</video:content_loc>`,
      `<video:duration>${Math.min(28_800, durationSeconds(video.durationMs))}</video:duration>`,
      `<video:publication_date>${videoUploadDate(video.updatedAt)}</video:publication_date>`,
      `<video:family_friendly>yes</video:family_friendly>`,
      `<video:requires_subscription>no</video:requires_subscription>`,
      `<video:live>no</video:live>`,
      `</video:video>`,
      `</url>`,
    )
  }
  lines.push(`</urlset>`, "")
  return lines.join("\n")
}
