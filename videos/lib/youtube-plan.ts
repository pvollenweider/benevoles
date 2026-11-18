// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pure part of `make video-youtube` (videos/tools/youtube.ts): the YouTube title, description and
 * tags of a video, built from its manifest and catalog entry, and the plan (upload, replace,
 * unchanged) against the state kept in videos/youtube.json.
 *
 * The site keeps its own player (no YouTube embed, no tracker); the channel only makes the videos
 * findable. Limits come from the YouTube Data API `videos` resource: title ≤ 100 characters,
 * description ≤ 5000 bytes, tags ≤ 500 characters in total, no « < » or « > » anywhere.
 */
import type { VideoCatalogEntry, VideoManifest } from "./manifest"

export const SITE_URL = "https://www.benevol.app"
export const MEDIA_BASE_URL = "https://medias.benevol.app"
export const BRAND_SUFFIX = " · benevol.app"
/** Short definition from content/pages/CITER.md, kept word for word. */
export const BRAND_DEFINITION =
  "benevol.app est un logiciel libre de planning pour bénévoles : l'association partage un lien, et chacun choisit ses créneaux depuis son téléphone, sans compte."
export const BASE_TAGS = ["benevol.app", "bénévoles", "planning bénévoles", "tutoriel"]

export const TITLE_MAX = 100
export const DESCRIPTION_MAX_BYTES = 5000
export const TAGS_MAX_CHARS = 500
/** YouTube category « Education ». */
export const CATEGORY_EDUCATION = "27"

export type Privacy = "private" | "unlisted" | "public"
export const PRIVACIES: readonly Privacy[] = ["private", "unlisted", "public"]

export type YoutubeState = Record<
  string,
  {
    videoId: string
    revision: number
    privacy: Privacy
    captions: boolean
    thumbnail: boolean
    /** The narration voice is generated (Gemini): declared as synthetic content to YouTube. */
    synthetic?: boolean
    /** What the thumbnail sent shows (videos/lib/youtube-thumbnail.ts thumbnailKey). */
    thumbnailKey?: string
    uploadedAt: string
    /** Earlier uploads of the same video, set to unlisted when a new revision replaced them. */
    replaced?: string[]
  }
>

export type YoutubeMetadata = {
  title: string
  description: string
  tags: string[]
}

/** YouTube refuses « < » and « > » in titles, descriptions and tags. */
export function stripAngleBrackets(text: string): string {
  return text.replace(/[<>]/g, "")
}

export function youtubeTitle(manifestTitle: string): string {
  const title = stripAngleBrackets(manifestTitle).trim()
  const branded = title + BRAND_SUFFIX
  if ([...branded].length <= TITLE_MAX) return branded
  const chars = [...title]
  return chars.length <= TITLE_MAX ? title : chars.slice(0, TITLE_MAX - 1).join("").trimEnd() + "…"
}

/** Length YouTube counts for a tag list: commas between tags, and quotes around a tag with a space. */
export function tagsLength(tags: string[]): number {
  return tags.reduce((sum, tag, i) => sum + [...tag].length + (tag.includes(" ") ? 2 : 0) + (i > 0 ? 1 : 0), 0)
}

export function youtubeTags(catalogTags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of [...BASE_TAGS, ...catalogTags]) {
    const tag = stripAngleBrackets(raw).replace(/[-_]+/g, " ").trim()
    const key = tag.toLocaleLowerCase("fr")
    if (!tag || seen.has(key)) continue
    if (tagsLength([...out, tag]) > TAGS_MAX_CHARS) break
    seen.add(key)
    out.push(tag)
  }
  return out
}

export function videoPageUrl(id: string): string {
  return `${SITE_URL}/videos/${id}`
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8")
}

export function youtubeDescription(manifest: VideoManifest): string {
  const head = [stripAngleBrackets(manifest.description).trim()]
  const footer = [`La vidéo et son guide sur le site : ${videoPageUrl(manifest.id)}`, "", BRAND_DEFINITION, SITE_URL]
  const blocks: string[][] = []
  if (manifest.viewer) {
    if (manifest.viewer.steps.length) blocks.push(["Étapes :", ...manifest.viewer.steps.map((s) => `- ${stripAngleBrackets(s)}`)])
    if (manifest.viewer.remember.length) blocks.push(["À retenir :", ...manifest.viewer.remember.map((s) => `- ${stripAngleBrackets(s)}`)])
  }
  // Drop the optional blocks from the end until the whole text fits the byte limit.
  for (let kept = blocks.length; kept >= 0; kept--) {
    const parts = [head.join("\n"), ...blocks.slice(0, kept).map((b) => b.join("\n")), footer.join("\n")]
    const text = parts.join("\n\n")
    if (byteLength(text) <= DESCRIPTION_MAX_BYTES) return text
  }
  return [head.join("\n"), footer.join("\n")].join("\n\n").slice(0, DESCRIPTION_MAX_BYTES)
}

export function youtubeMetadata(manifest: VideoManifest, entry: VideoCatalogEntry): YoutubeMetadata {
  return { title: youtubeTitle(manifest.title), description: youtubeDescription(manifest), tags: youtubeTags(entry.tags) }
}

export type PlanItem =
  | { slug: string; action: "upload"; revision: number }
  | { slug: string; action: "replace"; revision: number; previousVideoId: string }
  | { slug: string; action: "finish"; revision: number; videoId: string; captions: boolean; thumbnail: boolean }
  | { slug: string; action: "status"; revision: number; videoId: string; from: Privacy; to: Privacy }
  | { slug: string; action: "unchanged"; revision: number; videoId: string }

/**
 * What to do for each video. YouTube cannot swap the file of an existing video, so a new revision
 * is a new upload; the earlier one is then set to unlisted (never deleted: links keep working).
 * An upload whose captions or thumbnail failed is finished on the next run, without a new upload;
 * so is a thumbnail whose content or design changed.
 * A video whose privacy differs from the one asked, or not yet declared as synthetic, only gets
 * its status updated. Without an explicit privacy, a video already on YouTube keeps its own.
 */
export function planYoutube(videos: { slug: string; revision: number; thumbnailKey?: string }[], state: YoutubeState, privacy?: Privacy): PlanItem[] {
  return videos.map(({ slug, revision, thumbnailKey }) => {
    const known = state[slug]
    if (!known) return { slug, action: "upload", revision }
    if (known.revision !== revision) return { slug, action: "replace", revision, previousVideoId: known.videoId }
    const thumbnail = !known.thumbnail || (thumbnailKey !== undefined && known.thumbnailKey !== thumbnailKey)
    if (!known.captions || thumbnail) return { slug, action: "finish", revision, videoId: known.videoId, captions: !known.captions, thumbnail }
    const to = privacy ?? known.privacy
    if (to !== known.privacy || !known.synthetic) return { slug, action: "status", revision, videoId: known.videoId, from: known.privacy, to }
    return { slug, action: "unchanged", revision, videoId: known.videoId }
  })
}

/** Published files the upload starts from: the video, its captions (the narration text, timed) and its poster. */
/**
 * Full `status` of an upload. An update with part=status resets every writable field it omits,
 * so the same complete object is sent on insert and on every status change. The narration is a
 * generated voice (Gemini), hence containsSyntheticMedia.
 */
export function videoStatus(privacy: Privacy) {
  return { privacyStatus: privacy, selfDeclaredMadeForKids: false, containsSyntheticMedia: true, embeddable: true, license: "youtube", publicStatsViewable: true }
}

export function mediaUrls(slug: string): { mp4: string; vtt: string; poster: string } {
  const base = `${MEDIA_BASE_URL}/${slug}/${slug}`
  return { mp4: `${base}.mp4`, vtt: `${base}.vtt`, poster: `${base}.jpg` }
}

/** YouTube's recommended thumbnail size (16:9); the file must stay under 2 MB. */
export const THUMBNAIL_WIDTH = 1280
export const THUMBNAIL_HEIGHT = 720
export const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024
