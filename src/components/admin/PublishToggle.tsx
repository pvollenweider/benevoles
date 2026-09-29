"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function PublishToggle({ eventId, currentStatus }: { eventId: string; currentStatus: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  const isPublished = currentStatus === "published"

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
      if (!res.ok) throw new Error()
      router.refresh()
      // The page changes under the user (and this button may unmount): land on the heading.
      document.getElementById("page-heading")?.focus()
    } catch {
      setError("Impossible de modifier le statut. Réessayez.")
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
