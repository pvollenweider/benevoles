"use client"

import { useState } from "react"

type HistoryEntry = { slug: string; createdAt: string }

export default function OrgSlugForm({
  initialSlug,
  initialHistory,
  initialHasPublishedEvents,
}: {
  initialSlug: string
  initialHistory: HistoryEntry[]
  initialHasPublishedEvents: boolean
}) {
  const [slug, setSlug] = useState(initialSlug)
  const [history, setHistory] = useState(initialHistory)
  const [hasPublishedEvents] = useState(initialHasPublishedEvents)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({})
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const trimmed = slug.trim().toLowerCase()
  const changed = trimmed !== initialSlug && trimmed.length >= 2

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!changed) return
    if (hasPublishedEvents && !showConfirm) {
      setShowConfirm(true)
      return
    }
    setShowConfirm(false)
    setSaving(true)
    setError(null)

    const res = await fetch("/api/admin/settings/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: trimmed }),
    })

    setSaving(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data.error === "string" ? data.error : "Une erreur est survenue.")
      return
    }

    const data = await res.json()
    if (data.adminUrl) {
      window.location.href = data.adminUrl
    }
  }

  async function handleDelete(oldSlug: string) {
    setDeletingSlug(oldSlug)
    setDeleteErrors((prev) => { const n = { ...prev }; delete n[oldSlug]; return n })

    const res = await fetch("/api/admin/settings/organization/slugs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: oldSlug }),
    })

    setDeletingSlug(null)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setDeleteErrors((prev) => ({ ...prev, [oldSlug]: data.error ?? "Erreur." }))
      return
    }

    setHistory((h) => h.filter((e) => e.slug !== oldSlug))
  }

  const host = typeof window !== "undefined" ? window.location.host : "benevol.app"
  const hostParts = host.split(".")
  const baseDomain = hostParts.length >= 3 ? hostParts.slice(1).join(".") : host

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">Identifiant public (slug)</h2>
      <p className="text-xs text-gray-500">
        L&apos;identifiant détermine l&apos;adresse de votre espace : <span className="font-mono">{trimmed || "…"}.{baseDomain}</span>
      </p>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={slug}
          onChange={(e) => { setSlug(e.target.value); setError(null); setShowConfirm(false) }}
          placeholder="mon-organisation"
          minLength={2}
          maxLength={40}
          pattern="^[a-z0-9]([a-z0-9-]*[a-z0-9])?$"
          title="Lettres minuscules, chiffres et tirets, sans tiret en début ou fin"
          required
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={saving || !changed}
          className="bg-gray-900 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-40"
        >
          {saving ? "…" : "Modifier"}
        </button>
      </form>

      {showConfirm && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
          <p className="text-sm text-orange-800">
            Des événements publiés existent. L&apos;ancien slug continuera de rediriger, mais les liens partagés afficheront la nouvelle adresse. Confirmer ?
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit as unknown as React.MouseEventHandler}
              className="bg-orange-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-orange-700"
            >
              Confirmer
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {history.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Anciens slugs (redirigent vers l&apos;actuel)</p>
          {hasPublishedEvents && (
            <p className="text-xs text-orange-600">
              Attention : supprimer un ancien slug cassera les liens existants vers vos événements publiés.
            </p>
          )}
          {history.map((entry) => (
            <div key={entry.slug} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
              <span className="text-sm font-mono text-gray-700">{entry.slug}</span>
              <button
                onClick={() => handleDelete(entry.slug)}
                disabled={deletingSlug === entry.slug}
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
              >
                {deletingSlug === entry.slug ? "…" : "Supprimer"}
              </button>
            </div>
          ))}
          {Object.entries(deleteErrors).map(([s, msg]) => (
            <p key={s} className="text-xs text-red-600">{msg}</p>
          ))}
        </div>
      )}
    </div>
  )
}
