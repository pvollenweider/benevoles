"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useRef, useState } from "react"
import { announce } from "@/lib/announce"
import { focusFirstAvailableNextFrame } from "@/lib/focus-return"
import { consumeAutoplayIntent, shouldAutoplay } from "@/lib/video-autoplay"
import type { VideoMediaUrls } from "@/lib/video-catalog"

/**
 * The detail page's player (#644). `mediaUrls` is `null` without `VIDEO_MEDIA_BASE_URL` — no
 * network probe happens server-side either way (src/lib/video-catalog.ts `videoMediaUrls`): when
 * a URL is built but the specific render doesn't actually exist, the browser's own `onError`
 * catches it here and falls back to the same "Vidéo bientôt disponible" message, client-side only.
 *
 * `crossOrigin="anonymous"` (#644 owner decision): the media comes from a separate origin
 * (medias.benevol.app) — required for the `<track>` captions to load under CORS. The media host
 * must send `Access-Control-Allow-Origin` (videos/README.md, docs/configuration.md).
 *
 * Accessibility (#644 review): a native `<video>` that errors silently drops focus with nothing
 * announced. The fallback is always announced through a status region (src/lib/announce.ts
 * pattern); focus only moves to it when focus was actually on the player at the moment it failed
 * (`focusFirstAvailableNextFrame`, src/lib/focus-return.ts) — otherwise focus is left untouched,
 * wherever it is on the page.
 *
 * Autoplay (#644 owner decision): with sound, no `autoplay` attribute (that would also fire on a
 * reload) — src/lib/video-autoplay.ts's `shouldAutoplay` decides from the session's navigation
 * intent (set by AutoplayLink.tsx, consumed here once on mount) and `prefers-reduced-motion`; on
 * yes, `video.play()` is called directly and a rejection (the browser's own autoplay policy) is
 * swallowed — the player just waits for Play, nothing breaks. A documentation unit's inline
 * player (DocVideoInline.tsx) passes `galleryAutoplay={false}`: it ignores the session's intent and
 * starts playback itself from the reader's click on « Voir la vidéo ». `aspectRatio` reserves the frame's height before the metadata loads.
 */
export default function VideoPlayer({
  title,
  mediaUrls,
  galleryAutoplay = true,
  aspectRatio,
}: {
  title: string
  mediaUrls: VideoMediaUrls | null
  galleryAutoplay?: boolean
  aspectRatio?: string
}) {
  const [failed, setFailed] = useState(false)
  const [statusText, setStatusText] = useState("")
  const videoRef = useRef<HTMLVideoElement>(null)
  const fallbackRef = useRef<HTMLDivElement>(null)
  const focusWasOnPlayerRef = useRef(false)

  function handleError() {
    focusWasOnPlayerRef.current = document.activeElement === videoRef.current
    setFailed(true)
  }

  useEffect(() => {
    if (!failed) return
    announce(setStatusText, "Vidéo bientôt disponible.")
    if (focusWasOnPlayerRef.current) focusFirstAvailableNextFrame([fallbackRef.current])
  }, [failed])

  useEffect(() => {
    if (!galleryAutoplay) return
    // Read once, on mount, regardless of whether a video is actually available here — a flag set
    // for a video with no render yet must not leak into autoplaying a later page in the session.
    const fromGallery = consumeAutoplayIntent()
    const reducedMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (mediaUrls && shouldAutoplay({ fromGallery, reducedMotion })) {
      videoRef.current?.play().catch(() => {
        // Browser autoplay policy refused it (no recent user gesture, etc.): the player is left
        // exactly as a normal, paused player — Play still works.
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const unavailable = !mediaUrls || failed

  return (
    <>
      <div role="status" aria-live="polite" className="sr-only">{statusText}</div>
      {unavailable ? (
        <div
          ref={fallbackRef}
          tabIndex={-1}
          className="aspect-video bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl flex items-center justify-center focus:outline-none"
        >
          <p className="text-sm text-gray-600 dark:text-gray-300">Vidéo bientôt disponible.</p>
        </div>
      ) : (
        <video
          ref={videoRef}
          controls
          tabIndex={0}
          crossOrigin="anonymous"
          preload="metadata"
          // Only set when the poster was generated (videos/renders.json): never a broken image.
          poster={mediaUrls.poster}
          aria-label={title}
          className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-black"
          style={aspectRatio ? { aspectRatio } : undefined}
          onError={handleError}
        >
          <source src={mediaUrls.video} type="video/mp4" />
          {/* Off by default (owner decision): still selectable from the native controls'
              captions menu, WCAG 1.2.2 is met either way: a full transcript always follows the
              player, in a closed <details> that stays in the DOM (video page and documentation
              unit alike, DocVideoInline.tsx). */}
          <track kind="captions" srcLang="fr" label="Français" src={mediaUrls.captions} />
        </video>
      )}
    </>
  )
}
