// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { docVideoDuration, docVideoPlayer } from "@/lib/doc-video-references"
import type { Video, VideoMediaUrls } from "@/lib/video-catalog"
import type { VideoFrame } from "@/lib/video-frame"

/**
 * The homepage's phone (#765): what a volunteer does, in about a minute (open the link, see the
 * shifts, choose, fill in, confirm), played in place from the phone visual. The existing narrated
 * tutorial is reused, no separate cut.
 */
export const HOME_SIGNUP_VIDEO_ID = "VOLUNTEER_REGISTER"

/** The trigger's visible text; its accessible name starts with it (WCAG 2.5.3). */
export const HOME_SIGNUP_VIDEO_LABEL = "Voir l'inscription en vidéo"

export type HomeSignupVideo = {
  id: string
  title: string
  /** /videos/<ID>: the link before hydration (or without JavaScript), and « Transcription » next to the player. */
  href: string
  /** « 1 min » */
  duration: string
  media: VideoMediaUrls
  frame: VideoFrame
}

/**
 * The video when it can play here (published, rendered, VIDEO_MEDIA_BASE_URL set: the same rule
 * as a documentation unit's player), else null and the phone stays a still image. Plain data, safe
 * to pass to a client component.
 */
export function homeSignupVideo(catalog: Video[], mediaBaseUrl: string | undefined | null): HomeSignupVideo | null {
  const player = docVideoPlayer(HOME_SIGNUP_VIDEO_ID, catalog, mediaBaseUrl)
  const video = player ? catalog.find((v) => v.id === player.id) : undefined
  if (!player || !video) return null
  return {
    id: player.id,
    title: player.title,
    href: `/videos/${player.id}`,
    duration: docVideoDuration(video.durationMs),
    media: player.media,
    frame: player.frame,
  }
}
