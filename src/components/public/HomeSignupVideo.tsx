"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { flushSync } from "react-dom"
import { useHydrated } from "@/lib/use-hydrated"
import { HOME_SIGNUP_VIDEO_LABEL, type HomeSignupVideo as HomeSignupVideoData } from "@/lib/home-signup-video"
import VideoPlayer from "@/components/videos/VideoPlayer"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"

// The trigger is the pill at the bottom of the screen; its ::after covers the whole screen, so the
// phone is one big target while the accessible name stays the pill's own text.
const triggerClass =
  `absolute bottom-4 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-gray-950/90 px-4 py-2.5 text-sm font-semibold text-white shadow-lg hover:bg-gray-950 cursor-pointer after:absolute after:content-[''] after:-inset-[999px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 focus-visible:ring-2 focus-visible:ring-white`

const textLinkClass =
  "inline-flex min-h-11 items-center text-white underline underline-offset-2 hover:decoration-2 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 fill-current">
      <path d="M4 2.5v11l9-5.5z" />
    </svg>
  )
}

/**
 * The homepage's phone (#765): the still of the sign-up page (`children`, the hero's priority
 * image, unchanged) with « Voir l'inscription en vidéo » over it, which plays the volunteer sign-up
 * tutorial in place, in the phone. Before hydration (or without JavaScript) the trigger is a plain
 * link to the video's page; the button replaces it once hydrated, at the same place, and takes the
 * focus if the link had it (DESIGN.md, « Retour du focus »).
 *
 * Nothing video-related is downloaded before the press: the player is mounted on the first opening
 * only (preload="metadata"), synchronously (`flushSync`) so `play()` runs inside the click and is
 * allowed with sound; a refusal leaves it paused. No `autoplay` attribute. Opening moves the focus
 * to the player (the trigger is gone); « Fermer la vidéo », below the phone, pauses it, brings the
 * still back and returns the focus to the trigger. The player stays mounted, hidden: reopening
 * resumes where it was.
 *
 * The screen keeps the still's 390:700 box until the press; opened, it takes the video's ratio (a
 * shift caused by the visitor's own input, outside CLS).
 */
export default function HomeSignupVideo({ video, children }: { video: HomeSignupVideoData; children: ReactNode }) {
  const hydrated = useHydrated()
  const [expanded, setExpanded] = useState(false)
  const [opened, setOpened] = useState(false)
  const playerRef = useRef<HTMLDivElement>(null)
  const linkRef = useRef<HTMLAnchorElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const linkHadFocusRef = useRef(false)
  const label = `${HOME_SIGNUP_VIDEO_LABEL} (${video.duration})`

  useLayoutEffect(() => {
    if (!hydrated) {
      linkHadFocusRef.current = document.activeElement === linkRef.current
    } else if (linkHadFocusRef.current) {
      linkHadFocusRef.current = false
      buttonRef.current?.focus()
    }
  }, [hydrated])

  function open() {
    flushSync(() => {
      setOpened(true)
      setExpanded(true)
    })
    const player = playerRef.current?.querySelector<HTMLElement>("video") ?? playerRef.current?.querySelector<HTMLElement>("[tabindex]")
    player?.focus()
    const element = playerRef.current?.querySelector("video")
    // One soundtrack at a time.
    document.querySelectorAll("video").forEach((other) => { if (other !== element) other.pause() })
    // Promise.resolve: older engines return undefined from play() instead of a promise.
    Promise.resolve(element?.play()).catch(() => {
      // Refused (no media, browser policy): the player stays paused, Play still works.
    })
  }

  function close() {
    playerRef.current?.querySelector("video")?.pause()
    flushSync(() => setExpanded(false))
    buttonRef.current?.focus()
  }

  const ratio = expanded ? `${video.frame.width} / ${video.frame.height}` : "390 / 700"

  return (
    <>
      {/* The screen's overflow clips the player's own focus ring: the screen draws it instead, on the bezel. */}
      <div
        className="relative overflow-hidden rounded-t-[1.6rem] bg-white has-[video:focus-visible,[tabindex='-1']:focus-visible]:outline has-[video:focus-visible,[tabindex='-1']:focus-visible]:outline-2 has-[video:focus-visible,[tabindex='-1']:focus-visible]:outline-offset-2 has-[video:focus-visible,[tabindex='-1']:focus-visible]:outline-white"
        style={{ aspectRatio: ratio }}
      >
        <div hidden={expanded}>
          {children}
          {hydrated ? (
            <button ref={buttonRef} type="button" className={triggerClass} onClick={open}>
              <PlayIcon />
              {label}
            </button>
          ) : (
            <a ref={linkRef} href={video.href} className={triggerClass}>
              <PlayIcon />
              {label}
            </a>
          )}
        </div>
        <div ref={playerRef} hidden={!expanded} className="absolute inset-0 flex items-center bg-black">
          {opened && <VideoPlayer title={video.title} mediaUrls={video.media} galleryAutoplay={false} frame={video.frame} />}
        </div>
      </div>
      {expanded && (
        <p className="mt-3 pb-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
          <button type="button" onClick={close} className={`rounded-full border border-white/70 px-4 py-2 font-semibold text-white hover:bg-white/10 cursor-pointer ${focusRing}`}>
            Fermer la vidéo
          </button>
          <a href={video.href} className={textLinkClass}>
            Transcription et page de la vidéo
          </a>
        </p>
      )}
    </>
  )
}
