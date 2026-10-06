"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react"
import { announce } from "@/lib/announce"
import { focusFirstAvailableNextFrame } from "@/lib/focus-return"
import { useHydrated } from "@/lib/use-hydrated"
import type { Audience } from "@/lib/video-catalog"
import { feedbackStorageKey, feedbackWording, type FeedbackContext } from "@/lib/video-feedback"

type State = "idle" | "sending" | "thanks"

const noSubscription = () => () => {}

function readAnswered(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

function rememberAnswered(key: string, useful: boolean) {
  try {
    window.localStorage.setItem(key, useful ? "yes" : "no")
  } catch {
    // Private mode or storage blocked: the answer is still recorded server-side, only the
    // « already answered » memory is lost (best effort, #646).
  }
}

/**
 * « Cette vidéo vous a-t-elle été utile ? » (#646), under the player on /videos/[id]. Always shown,
 * not only when the video ends: someone who reads the transcript, uses a keyboard or a screen
 * reader, or stops halfway can answer too.
 *
 * A group (not a landmark) named by its question, with two plain buttons. Once the answer is
 * recorded they're replaced by a thank-you that takes focus, so focus isn't dropped on <body>
 * when the button it was on disappears (DESIGN.md, « Retour du focus »); focus alone voices it. While the request runs
 * the buttons take `aria-disabled`, not `disabled`, so the pressed one keeps focus. On an error
 * the buttons stay, the message is announced (src/lib/announce.ts) and describes both buttons;
 * focus doesn't move. The group is `aria-busy` while the request runs.
 *
 * One answer per video and revision per browser, remembered in localStorage (best effort; no
 * cookie, nothing tied to the person). Read after hydration, so the server HTML is the same for
 * everyone; until then the buttons are `aria-disabled` (a click before hydration would be lost).
 */
export default function VideoFeedback({
  videoId,
  revision,
  audience,
  context,
}: {
  videoId: string
  revision: number
  audience: readonly Audience[]
  context: FeedbackContext
}) {
  const wording = feedbackWording(audience)
  const hydrated = useHydrated()
  const storageKey = feedbackStorageKey(videoId, revision)
  // Server snapshot `false`: the server HTML is the same for everyone, the stored answer is read
  // on the client only (src/lib/use-hydrated.ts pattern, no effect).
  const alreadyAnswered = useSyncExternalStore(noSubscription, () => readAnswered(storageKey), () => false)
  const [state, setState] = useState<State>("idle")
  const [error, setError] = useState("")
  const [statusText, setStatusText] = useState("")
  const thanksRef = useRef<HTMLParagraphElement>(null)
  const headingId = useId()

  const errorId = useId()

  // Once the thank-you is committed (not from the async handler: React may not have rendered it
  // by the next frame), focus it. Focus alone voices it; announcing it too would read it twice
  // (#646 accessibility review). Errors, which don't move focus, are announced.
  useEffect(() => {
    if (state !== "thanks") return
    focusFirstAvailableNextFrame([() => thanksRef.current])
  }, [state])

  async function answer(useful: boolean) {
    if (!hydrated || state === "sending") return
    setState("sending")
    setError("")
    let message = wording.error
    try {
      const res = await fetch("/api/public/video-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, revision, useful, context }),
      })
      if (res.ok) {
        rememberAnswered(storageKey, useful)
        setState("thanks")
        return
      }
      if (res.status === 409) message = wording.stale
      else if (res.status === 429) message = wording.tooMany
    } catch {
      // Network error: the generic message below.
    }
    setState("idle")
    setError(message)
    announce(setStatusText, message)
  }

  const busy = !hydrated || state === "sending"
  const buttonClass =
    "rounded-xl border border-blue-600 bg-white px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors aria-disabled:opacity-50 aria-disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

  return (
    <div role="group" aria-labelledby={headingId} aria-busy={state === "sending" || undefined} className="bg-white border border-gray-200 rounded-2xl px-5 py-4">
      <div role="status" aria-live="polite" className="sr-only">{statusText}</div>
      <h2 id={headingId} className="text-sm font-semibold text-gray-900">{wording.question}</h2>
      {state === "thanks" ? (
        <p ref={thanksRef} tabIndex={-1} className="mt-2 text-sm text-gray-700 focus:outline-none">{wording.thanks}</p>
      ) : alreadyAnswered ? (
        <p className="mt-2 text-sm text-gray-700">{wording.alreadyAnswered}</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className={buttonClass} aria-disabled={busy || undefined} aria-describedby={error ? errorId : undefined} onClick={() => answer(true)}>
              Oui
            </button>
            <button type="button" className={buttonClass} aria-disabled={busy || undefined} aria-describedby={error ? errorId : undefined} onClick={() => answer(false)}>
              Non
            </button>
          </div>
          {error && <p id={errorId} className="mt-2 text-sm text-red-700">{error}</p>}
        </>
      )}
    </div>
  )
}
