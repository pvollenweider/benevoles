"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useRef, useState, useSyncExternalStore } from "react"
import { announce } from "@/lib/announce"

const noSubscription = () => () => {}
const hasNativeShare = () => typeof navigator !== "undefined" && typeof navigator.share === "function"

const buttonClass =
  "text-sm font-medium border border-blue-600 text-blue-700 px-3 py-1.5 rounded-xl hover:bg-blue-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"

export const COPIED = "Lien copié."
export const COPY_FAILED = "Copie impossible : le lien est sélectionné, copiez-le."
export const SHARED = "Lien partagé."
export const SHARE_FAILED = "Partage impossible : utilisez « Copier le lien »."

/**
 * The public link of a published event, as plain selectable text (the admin header already links
 * to the public page), with « Copier le lien » and, where the browser has a
 * native share sheet (mostly phones), « Partager » (#564). `url` is the event's public URL, never
 * a personal one: nothing else is copied or shared. The share button is decided on the client
 * only (server snapshot false), so the server HTML and the hydration agree. The result is shown
 * and voiced through one status region, always mounted. When the clipboard refuses, the link is
 * selected so that it can be copied by hand, whatever the device.
 */
export default function EventShareLink({ url }: { url: string }) {
  const canShare = useSyncExternalStore(noSubscription, hasNativeShare, () => false)
  const [message, setMessage] = useState("")
  const [failed, setFailed] = useState(false)
  const urlRef = useRef<HTMLSpanElement>(null)

  function show(text: string, isFailure = false) {
    setFailed(isFailure)
    announce(setMessage, text)
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      show(COPIED)
    } catch {
      if (urlRef.current) window.getSelection()?.selectAllChildren(urlRef.current)
      show(COPY_FAILED, true)
    }
  }

  async function share() {
    try {
      await navigator.share({ url })
      show(SHARED)
    } catch (err) {
      // Closing the share sheet is not a failure: nothing to say.
      if (err instanceof DOMException && err.name === "AbortError") { setFailed(false); setMessage(""); return }
      show(SHARE_FAILED, true)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-700">
        Lien à partager :{" "}
        <span ref={urlRef} className="font-medium text-gray-900 break-all select-all">{url}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void copy()} className={buttonClass}>
          Copier le lien
        </button>
        {canShare && (
          <button type="button" onClick={() => void share()} className={buttonClass}>
            Partager
          </button>
        )}
      </div>
      <p role="status" className={message ? `text-sm ${failed ? "text-red-800" : "text-green-800"}` : "sr-only"}>
        {message}
      </p>
    </div>
  )
}
