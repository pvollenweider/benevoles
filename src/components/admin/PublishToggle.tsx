"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import { useRouter } from "next/navigation"

/**
 * Publish / unpublish an event. In a space awaiting validation (#810) the button becomes
 * « Demander la publication »: it tells the operator and shows when publishing becomes possible.
 */
export default function PublishToggle({ eventId, currentStatus, awaitingValidation = false }: { eventId: string; currentStatus: string; awaitingValidation?: boolean }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [requested, setRequested] = useState<string | null>(null)

  const isPublished = currentStatus === "published"

  async function requestPublication() {
    // Once sent, the button says so and does nothing more: the operator already has it.
    if (loading || requested) return
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/admin/events/${eventId}/publication-request`, { method: "POST" }).catch(() => null)
    setLoading(false)
    const data = res ? await res.json().catch(() => ({})) : null
    if (!res?.ok) {
      setError(typeof data?.error === "string" ? data.error : "La demande n'a pas pu être envoyée. Réessayez.")
      return
    }
    setRequested(typeof data?.message === "string" ? data.message : "Demande envoyée.")
  }

  if (awaitingValidation && !isPublished) {
    return (
      <div className={`flex flex-col items-end gap-1 max-w-md ${requested ? "basis-full" : ""}`}>
        <button
          type="button"
          onClick={() => void requestPublication()}
          aria-disabled={loading || !!requested || undefined}
          aria-describedby={requested ? `publish-request-${eventId}` : undefined}
          className={`text-sm px-3 py-1.5 rounded-full font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${requested ? "bg-gray-100 text-gray-800 cursor-default" : "bg-green-700 text-white hover:bg-green-800"} ${loading ? "cursor-wait" : ""}`}
        >
          {requested ? "Demande envoyée" : "Demander la publication"}{loading && <span className="sr-only"> (en cours)</span>}
        </button>
        <p id={`publish-request-${eventId}`} role="status" className={requested ? "text-sm text-gray-800 bg-green-50 border border-green-200 rounded-xl px-3 py-2" : "sr-only"}>{requested ?? ""}</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    )
  }

  async function doToggle() {
    const newStatus = isPublished ? "draft" : "published"
    setLoading(true)
    setError(null)
    setConfirming(false)
    try {
      const res = await fetch(`/api/admin/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicStatus: newStatus }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data?.error === "string" ? data.error : "")
      }
      router.refresh()
      // The page changes under the user (and this button may unmount): land on the heading.
      document.getElementById("page-heading")?.focus()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Impossible de modifier le statut. Réessayez.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {confirming ? (
        <div
          role="alertdialog"
          aria-labelledby="publish-confirm-label"
          className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-1.5"
        >
          <span id="publish-confirm-label" className="text-xs text-yellow-800 font-medium">Dépublier ?</span>
          <button
            onClick={doToggle}
            disabled={loading}
            className="text-xs bg-yellow-600 text-white px-2.5 py-1 rounded-full font-medium hover:bg-yellow-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "…" : "Confirmer"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-xs text-yellow-700 hover:text-yellow-900 transition-colors"
          >
            Annuler
          </button>
        </div>
      ) : (
        <button
          onClick={() => isPublished ? setConfirming(true) : doToggle()}
          disabled={loading}
          aria-busy={loading}
          className={`text-sm px-3 py-1.5 rounded-full font-medium transition-colors disabled:opacity-50 ${
            isPublished
              ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
              : "bg-green-600 text-white hover:bg-green-700"
          }`}
        >
          {isPublished ? "Dépublier" : "Publier"}{loading && <span className="sr-only"> (en cours)</span>}
        </button>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
