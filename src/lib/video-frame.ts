// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The frame the video player reserves before its media loads (#773). Without it the native
 * `<video>` starts at its default 300 x 150 and grows once the metadata arrives, pushing the page
 * down (CLS 0.24 on /videos/<ID>). Dependency-free: imported by the client player, so it must not
 * pull the catalogue's schema (zod) into the page's JavaScript.
 */
export type VideoFrame = { width: number; height: number }

/** When nothing measured the frame: 16:9, the common screen-recording ratio. */
export const DEFAULT_VIDEO_FRAME: VideoFrame = { width: 1280, height: 720 }

function isFrame(frame: { width: number; height: number } | null | undefined): frame is VideoFrame {
  return !!frame && Number.isFinite(frame.width) && Number.isFinite(frame.height) && frame.width > 0 && frame.height > 0
}

/**
 * The render's real size (videos/renders.json), else the recording viewport of the manifest, else
 * `DEFAULT_VIDEO_FRAME`.
 */
export function videoFrame(video: {
  render?: { width: number; height: number } | null
  manifest?: { viewport?: { width: number; height: number } | null } | null
}): VideoFrame {
  if (isFrame(video.render)) return { width: video.render.width, height: video.render.height }
  const viewport = video.manifest?.viewport
  if (isFrame(viewport)) return { width: viewport.width, height: viewport.height }
  return { ...DEFAULT_VIDEO_FRAME }
}

/** A usable frame as is, `DEFAULT_VIDEO_FRAME` otherwise (missing, zero, negative or not finite). */
export function frameOrDefault(frame: VideoFrame | null | undefined): VideoFrame {
  return isFrame(frame) ? frame : { ...DEFAULT_VIDEO_FRAME }
}

/** The CSS `aspect-ratio` value of a frame, « 1280 / 800 » (`DEFAULT_VIDEO_FRAME`'s for an unusable one). */
export function frameAspectRatio(frame: VideoFrame | null | undefined): string {
  const { width, height } = frameOrDefault(frame)
  return `${width} / ${height}`
}
