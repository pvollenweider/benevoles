"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useLayoutEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { useHydrated } from "@/lib/use-hydrated"
import { DOC_VIDEO_ATTRIBUTE, type DocVideoPlayer } from "@/lib/doc-video-references"
import VideoPlayer from "@/components/videos/VideoPlayer"
import VideoFeedback from "@/components/videos/VideoFeedback"

const docVideoAttr = { [DOC_VIDEO_ATTRIBUTE]: "true" }

const buttonClass =
  "cursor-pointer text-left font-medium text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:decoration-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"

const linkClass =
  "text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:decoration-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400"

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="mr-1.5 inline-block size-3.5 -translate-y-px fill-current align-middle">
      <path d="M4 2.5v11l9-5.5z" />
    </svg>
  )
}

/**
 * A video referenced by a documentation unit (#645, #649), drawn in place of the card: the button
 * « Voir la vidéo : <titre> (<durée>) » opens the player right there, so the reader never leaves
 * the documentation. A disclosure, not a dialog: `aria-expanded` and `aria-controls` on the button,
 * the player below it in DOM order; focus stays on the button (nothing moves it) and pressing it
 * again hides the player and pauses the video. Opening starts playback (owner decision): the press is
 * the reader's own gesture, so the player is mounted synchronously (`flushSync`) and `play()` runs
 * inside the click handler, which every browser accepts with sound; a refusal leaves the player
 * paused, Play still works. Reopening resumes where it was. No `autoplay` attribute, and the
 * gallery's session autoplay intent is never read or consumed here.
 *
 * Progressive enhancement: the server HTML (and a page whose JavaScript failed) is the plain link to
 * /videos/<ID>?from=doc in the same card, the button replaces it once hydrated (src/lib/use-hydrated.ts),
 * with the same text in the same paragraph, so the line doesn't move. A reader who had already
 * focused the link (Tab before hydration) gets the focus on the button that replaces it, never on
 * <body> (DESIGN.md, « Retour du focus »).
 *
 * Nothing is downloaded until the reader opens it: the player (preload="metadata") is mounted on the
 * first opening only, then kept, hidden, so closing and reopening resumes where it was. Below it,
 * « Cette vidéo vous a-t-elle été utile ? » (#646, context « documentation », a paragraph rather
 * than a heading so it doesn't open a section of the unit), the transcript, closed, and the video's
 * page in the library.
 */
export default function DocVideoInline({ player }: { player: DocVideoPlayer }) {
  const hydrated = useHydrated()
  const [expanded, setExpanded] = useState(false)
  const [opened, setOpened] = useState(false)
  const regionRef = useRef<HTMLDivElement>(null)
  const linkRef = useRef<HTMLAnchorElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const linkHadFocusRef = useRef(false)
  const regionId = useId()

  // The hydration pass commits the link (its layout effects run before the re-render that swaps it
  // for the button): note whether it has the focus then, and hand it to the button after the swap.
  useLayoutEffect(() => {
    if (!hydrated) {
      linkHadFocusRef.current = document.activeElement === linkRef.current
    } else if (linkHadFocusRef.current) {
      linkHadFocusRef.current = false
      buttonRef.current?.focus()
    }
  }, [hydrated])

  if (!hydrated) {
    return (
      <p {...docVideoAttr}>
        <a ref={linkRef} href={player.libraryHref}>
          <PlayIcon />
          {player.label}
        </a>
      </p>
    )
  }

  function toggle() {
    if (expanded) {
      regionRef.current?.querySelector("video")?.pause()
      setExpanded(false)
      return
    }
    flushSync(() => {
      setOpened(true)
      setExpanded(true)
    })
    const video = regionRef.current?.querySelector("video")
    // One soundtrack at a time: any other video playing on the page is paused first.
    document.querySelectorAll("video").forEach((other) => { if (other !== video) other.pause() })
    // Promise.resolve: older engines return undefined from play() instead of a promise.
    Promise.resolve(video?.play()).catch(() => {
      // Refused (no media, browser policy): the player stays paused, Play still works.
    })
  }

  return (
    <>
      <p {...docVideoAttr}>
        <button ref={buttonRef} type="button" className={buttonClass} aria-expanded={expanded} aria-controls={regionId} onClick={toggle}>
          <PlayIcon />
          {player.label}
        </button>
      </p>
      <div ref={regionRef} id={regionId} hidden={!expanded} className="not-prose my-6 space-y-4">
        {opened && (
          <>
            <VideoPlayer title={player.title} mediaUrls={player.media} galleryAutoplay={false} aspectRatio={player.aspectRatio} />
            <VideoFeedback videoId={player.id} revision={player.revision} audience={player.audience} context="documentation" heading="p" />
            {player.transcript.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer list-none rounded text-sm font-semibold text-gray-900 dark:text-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:focus-visible:outline-blue-400">
                  <span aria-hidden="true" className="mr-1 inline-block group-open:rotate-90 motion-safe:transition-transform">▸</span>
                  Transcription
                </summary>
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                  {player.transcript.map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
                </div>
              </details>
            )}
            <p className="text-sm">
              <a href={player.libraryHref} className={linkClass}>
                Ouvrir dans la bibliothèque<span className="sr-only"> : {player.title}</span>
              </a>
            </p>
          </>
        )}
      </div>
    </>
  )
}
