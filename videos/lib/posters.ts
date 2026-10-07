// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Posters of the rendered videos and the render facts the app needs without the render itself
 * (`videos/renders.json`): pure, so the choices are tested on their own; videos/tools/posters.ts
 * runs ffprobe/ffmpeg and writes the files.
 *
 * Two images per video, next to its MP4 in videos/output/<slug>/ (git-ignored like the MP4, sent
 * by `make video-publish`):
 * - `<slug>.jpg`: one frame at the video's own aspect ratio (at most 1280 px wide), the `<video
 *   poster>` and the thumbnail of the structured data and of the video sitemap;
 * - `<slug>-og.jpg`: the same frame fitted into 1200 x 630 on the brand's dark blue, for link
 *   previews (Open Graph, X/Twitter, WhatsApp...), which crop anything else.
 */

/** The poster's maximum width; a narrower (mobile) recording keeps its own width. */
export const POSTER_MAX_WIDTH = 1280
/** Link preview size recommended by Open Graph consumers (1.91:1). */
export const OG_POSTER_WIDTH = 1200
export const OG_POSTER_HEIGHT = 630
/** Background of the link preview around the frame: the social card's blue (src/app/og-image.png/route.tsx). */
export const OG_POSTER_BACKGROUND = "0x1e3a8a"
/** Frames ffmpeg's `thumbnail` filter compares after the timestamp, to avoid a transition or a blank frame. */
export const POSTER_THUMBNAIL_FRAMES = 48

/** The two poster files of a slug, relative to videos/output (and to the media root). */
export function posterFiles(slug: string): { poster: string; og: string } {
  return { poster: `${slug}/${slug}.jpg`, og: `${slug}/${slug}-og.jpg` }
}

/**
 * Where the frame is taken: the manifest's `posterAtMs` when it lies inside the video, otherwise a
 * third of the way in (past the title, into the demonstration).
 */
export function posterTimestampMs(durationMs: number, override?: number | null): number {
  if (override != null && override >= 0 && override < durationMs) return Math.round(override)
  return Math.round(durationMs / 3)
}

function seconds(ms: number): string {
  return (ms / 1000).toFixed(3)
}

/** ffmpeg arguments writing the native-ratio poster. */
export function posterFfmpegArgs(input: string, output: string, atMs: number): string[] {
  return [
    "-y", "-v", "error",
    "-ss", seconds(atMs), "-i", input,
    "-vf", `thumbnail=${POSTER_THUMBNAIL_FRAMES},scale=w='min(${POSTER_MAX_WIDTH},iw)':h=-2`,
    "-frames:v", "1", "-q:v", "3",
    output,
  ]
}

/** ffmpeg arguments writing the 1200 x 630 link preview (whole frame, centred, never cropped). */
export function ogPosterFfmpegArgs(input: string, output: string, atMs: number): string[] {
  const w = OG_POSTER_WIDTH
  const h = OG_POSTER_HEIGHT
  return [
    "-y", "-v", "error",
    "-ss", seconds(atMs), "-i", input,
    "-vf", `thumbnail=${POSTER_THUMBNAIL_FRAMES},scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=${OG_POSTER_BACKGROUND}`,
    "-frames:v", "1", "-q:v", "3",
    output,
  ]
}

/** One rendered video, as the app sees it (src/lib/video-catalog.ts `renderInfoSchema`). */
export type RenderInfo = {
  /** Real length of the MP4, measured by ffprobe. */
  durationMs: number
  width: number
  height: number
  /** `<slug>.jpg` and `<slug>-og.jpg` exist (generated here, to be published with the video). */
  poster: boolean
}

export type Renders = Record<string, RenderInfo>

/** Parses `ffprobe -show_entries stream=width,height:format=duration -of json` output. */
export function parseProbe(json: string): Omit<RenderInfo, "poster"> {
  const data = JSON.parse(json) as { streams?: { width?: number; height?: number }[]; format?: { duration?: string } }
  const stream = data.streams?.find((s) => s.width && s.height)
  const duration = Number(data.format?.duration)
  if (!stream?.width || !stream.height || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("ffprobe: no video stream with a size and a duration")
  }
  return { durationMs: Math.round(duration * 1000), width: stream.width, height: stream.height }
}

/** Updates `videos/renders.json` with fresh entries, keys sorted so the diff stays readable. */
export function mergeRenders(current: Renders, updates: Renders): Renders {
  const merged: Renders = { ...current, ...updates }
  return Object.fromEntries(Object.keys(merged).sort().map((slug) => [slug, merged[slug]]))
}
