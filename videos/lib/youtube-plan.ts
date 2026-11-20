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

export type VideoFormat = "native" | "framed"

export type YoutubeVideo = {
  videoId: string
  revision: number
  privacy: Privacy
  captions: boolean
  thumbnail: boolean
  /** The narration voice is generated (Gemini): declared as synthetic content to YouTube. */
  synthetic?: boolean
  /** What the thumbnail sent shows (videos/lib/youtube-thumbnail.ts thumbnailKey). */
  thumbnailKey?: string
  /** « framed »: a phone recording sent inside a 16:9 frame; « native » (or absent): the MP4 as published. */
  format?: VideoFormat
  /** Themes (catalog `themes`) whose playlist already holds this upload. */
  playlists?: string[]
  uploadedAt: string
  /** Earlier uploads of the same video, set to unlisted when a new revision replaced them. */
  replaced?: string[]
  /** Earlier uploads still to withdraw from these theme playlists (kept until done, so a stopped run resumes). */
  staleInPlaylists?: PlaylistWithdrawal[]
}

/** An earlier upload to take out of the playlists of these themes. */
export type PlaylistWithdrawal = { videoId: string; themes: string[] }

/** videos/youtube.json: one playlist per theme, and what was sent per manifest slug. */
export type YoutubeState = {
  playlists: Record<string, { playlistId: string; title: string }>
  videos: Record<string, YoutubeVideo>
}

/** Reads videos/youtube.json, including its first shape (the videos only, keyed by slug). */
export function parseYoutubeState(raw: unknown): YoutubeState {
  const data = (raw ?? {}) as Partial<YoutubeState> & Record<string, unknown>
  if (data.videos && typeof data.videos === "object") return { playlists: data.playlists ?? {}, videos: data.videos }
  return { playlists: {}, videos: data as Record<string, YoutubeVideo> }
}

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

export type PlanItem = {
  slug: string
  revision: number
  /** upload: never sent; replace: new revision or format; update: something to finish or change. */
  action: "upload" | "replace" | "update" | "unchanged"
  videoId?: string
  previousVideoId?: string
  previousPrivacy?: Privacy
  captions: boolean
  thumbnail: boolean
  /** Themes whose playlist must receive the video. */
  playlists: string[]
  status?: { from: Privacy; to: Privacy }
  /** Earlier uploads to take out of their theme playlists, so a playlist never shows two versions. */
  withdraw: PlaylistWithdrawal[]
}

export type PlanInput = { slug: string; revision: number; thumbnailKey?: string; format?: VideoFormat; themes?: string[] }

/**
 * What to do for each video. YouTube cannot swap the file of an existing video, so a new revision
 * or a new format is a new upload; the earlier one is then set to unlisted, or left private if it
 * never was public (never deleted: links keep working). For a video already sent, whatever is
 * missing is finished without a new upload: captions, thumbnail (also when its content or design
 * changed), theme playlists, and the status (privacy asked, synthetic voice declared). A replaced
 * upload is also taken out of its theme playlists. Without an explicit privacy, a video already on
 * YouTube keeps its own.
 */
export function planYoutube(videos: PlanInput[], state: YoutubeState, privacy?: Privacy): PlanItem[] {
  return videos.map(({ slug, revision, thumbnailKey, format = "native", themes = [] }) => {
    const known = state.videos[slug]
    const fresh = { captions: true, thumbnail: true, playlists: [...themes] }
    if (!known) return { slug, revision, action: "upload", ...fresh, withdraw: [] }
    const pending = known.staleInPlaylists ?? []
    if (known.revision !== revision || (known.format ?? "native") !== format) {
      const previous = known.playlists?.length ? [{ videoId: known.videoId, themes: [...known.playlists] }] : []
      return { slug, revision, action: "replace", previousVideoId: known.videoId, previousPrivacy: known.privacy, ...fresh, withdraw: [...pending, ...previous] }
    }
    const to = privacy ?? known.privacy
    const item: PlanItem = {
      slug,
      revision,
      action: "update",
      videoId: known.videoId,
      captions: !known.captions,
      thumbnail: !known.thumbnail || (thumbnailKey !== undefined && known.thumbnailKey !== thumbnailKey),
      playlists: themes.filter((t) => !(known.playlists ?? []).includes(t)),
      ...(to !== known.privacy || !known.synthetic ? { status: { from: known.privacy, to } } : {}),
      withdraw: pending,
    }
    if (!item.captions && !item.thumbnail && !item.playlists.length && !item.status && !item.withdraw.length) item.action = "unchanged"
    return item
  })
}

/** Title and description of a theme's playlist. */
export function playlistMetadata(label: string): { title: string; description: string } {
  return {
    title: stripAngleBrackets(label).slice(0, 150),
    description: [`Tutoriels vidéo benevol.app : ${stripAngleBrackets(label)}.`, `Toutes les vidéos, avec leur guide : ${SITE_URL}/videos`, "", BRAND_DEFINITION, SITE_URL].join("\n"),
  }
}

/** Errors after which nothing more can be sent today: the daily quota is spent. */
export const QUOTA_REASONS = ["quotaExceeded", "dailyLimitExceeded", "uploadLimitExceeded", "rateLimitExceeded"]

/**
 * Full `status` of an upload. An update with part=status resets every writable field it omits,
 * so the same complete object is sent on insert and on every status change. The narration is a
 * generated voice (Gemini), hence containsSyntheticMedia.
 */
export function videoStatus(privacy: Privacy) {
  return { privacyStatus: privacy, selfDeclaredMadeForKids: false, containsSyntheticMedia: true, embeddable: true, license: "youtube", publicStatsViewable: true }
}

/** Published files the upload starts from: the video, its captions (the narration text, timed) and its poster. */
export function mediaUrls(slug: string): { mp4: string; vtt: string; poster: string } {
  const base = `${MEDIA_BASE_URL}/${slug}/${slug}`
  return { mp4: `${base}.mp4`, vtt: `${base}.vtt`, poster: `${base}.jpg` }
}

/** YouTube's recommended thumbnail size (16:9); the file must stay under 2 MB. */
export const THUMBNAIL_WIDTH = 1280
export const THUMBNAIL_HEIGHT = 720
export const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024
