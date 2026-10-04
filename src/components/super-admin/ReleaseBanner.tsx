"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import { useRouter } from "next/navigation"
import { MAIN_CONTENT_ID } from "@/components/admin/SkipLink"
import { focusFirstAvailable } from "@/lib/focus-return"
import { shouldShowBanner } from "@/lib/release-check"

type Props = {
  currentVersion: string
  latestVersion: string | null
  releaseUrl: string | null
  /** The version this super admin last dismissed, from the server (AdminUser.releaseBannerDismissedVersion). */
  dismissedVersion: string | null
}

/**
 * « Une nouvelle version est disponible » (#612), super admin seulement. A plain region, not a
 * live alert: it only appears on navigation/reload, never interrupts what the super admin is
 * doing. Dismissing it is per version — a later release makes it reappear, which is why the
 * visibility check (`shouldShowBanner`) runs here, against the latest props, rather than being
 * decided once by the server and baked into whether this component is even rendered.
 */
export default function ReleaseBanner({ currentVersion, latestVersion, releaseUrl, dismissedVersion }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  // Optimistic: hides immediately on a successful dismiss, before router.refresh() brings the
  // server's AdminUser.releaseBannerDismissedVersion back round-trip.
  const [optimisticDismissed, setOptimisticDismissed] = useState<string | null>(null)

  const show = shouldShowBanner({
    currentVersion,
    latestVersion,
    dismissedVersion: optimisticDismissed ?? dismissedVersion,
  })
  if (!show || !latestVersion || !releaseUrl) return null
  const version = latestVersion

  async function dismiss() {
    if (loading) return
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/super-admin/release-banner", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      })
      if (!res.ok) {
        setError("Impossible de masquer ce message. Réessayez.")
        return
      }
      setOptimisticDismissed(version)
      // The banner (and this focused button) disappears: move focus to the main landmark rather
      // than letting it fall to <body>.
      focusFirstAvailable([() => document.getElementById(MAIN_CONTENT_ID)])
      router.refresh()
    } catch {
      setError("Impossible de masquer ce message. Vérifiez votre connexion et réessayez.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <section
      aria-label="Nouvelle version disponible"
      className="bg-blue-50 border border-blue-200 px-4 py-3"
    >
      <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <p className="text-sm text-blue-900 flex-1">
          Une nouvelle version est disponible : {version} (vous utilisez {currentVersion}).{" "}
          <a
            href={releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Voir les notes de version
            <span className="sr-only"> (ouvre dans un nouvel onglet)</span>
          </a>
        </p>
        <div className="flex flex-col items-start sm:items-end gap-1">
          <button
            type="button"
            onClick={dismiss}
            aria-disabled={loading || undefined}
            className="text-sm text-blue-600 border border-blue-600 rounded-lg px-3 py-1.5 hover:bg-white aria-disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 whitespace-nowrap"
          >
            {loading ? "Masquage…" : "Masquer jusqu'à la prochaine version"}{" "}
            <span className="sr-only">({version})</span>
          </button>
          <p role="alert" className="text-xs font-medium text-red-700 min-h-4">{error}</p>
        </div>
      </div>
    </section>
  )
}
