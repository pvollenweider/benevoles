"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import { useRouter } from "next/navigation"

/** Hides the first-run checklist for the whole organization (#369). */
export default function DismissOnboardingButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function dismiss() {
    if (loading) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/admin/settings/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboardingDismissed: true }),
      })
      if (!res.ok) {
        setError("Impossible de masquer la liste. Réessayez.")
        return
      }
      // The section (and this focused button) disappears: move focus to the page heading rather
      // than letting it fall to <body>.
      document.getElementById("page-heading")?.focus()
      router.refresh()
    } catch {
      setError("Impossible de masquer la liste. Vérifiez votre connexion et réessayez.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={dismiss}
        aria-disabled={loading || undefined}
        className="text-sm text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 aria-disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        {loading ? "Masquage…" : "Masquer ces étapes"}
      </button>
      <p role="alert" className="text-xs font-medium text-red-700 min-h-4">{error}</p>
    </div>
  )
}
