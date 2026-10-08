// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * CORS mode of the video player (src/components/videos/VideoPlayer.tsx): the media and the
 * captions track come from medias.benevol.app, and a cross-origin <track> only loads in CORS mode.
 * The browser then fetches the poster in that same mode, so the page's poster preload must use it
 * too: a preload without `crossorigin` does not match the poster request, which downloads the image
 * a second time (« credentials mode does not match » in the console).
 */
export const VIDEO_CROSS_ORIGIN = "anonymous" as const

/** Options of the poster's preload on /videos/[id] (react-dom `preload`). */
export function posterPreloadOptions() {
  return { as: "image", fetchPriority: "high", crossOrigin: VIDEO_CROSS_ORIGIN } as const
}
