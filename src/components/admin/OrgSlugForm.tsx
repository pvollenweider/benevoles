"use client"

import { useEffect, useId, useRef, useState } from "react"

type HistoryEntry = { slug: string; createdAt: string }

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"

export default function OrgSlugForm({
  initialSlug,
  initialHistory,
  initialHasPublishedEvents,
  baseDomain,
}: {
  initialSlug: string
  initialHistory: HistoryEntry[]
  initialHasPublishedEvents: boolean
  /** Domain the slug is a subdomain of, computed on the server so the server and client render the same text. */
  baseDomain: string
}) {
  const [slug, setSlug] = useState(initialSlug)
  const [history, setHistory] = useState(initialHistory)
  const [hasPublishedEvents] = useState(initialHasPublishedEvents)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [deleteErrors, setDeleteErrors] = useState<Record<string, string>>({})
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const historyHeadingRef = useRef<HTMLParagraphElement>(null)
  const restoreFocus = useRef(false)

  const inputId = useId()
  const helpId = useId()
  const errorId = useId()
  const confirmId = useId()
  const warningId = useId()

  const trimmed = slug.trim().toLowerCase()
  const changed = trimmed !== initialSlug && trimmed.length >= 2

  useEffect(() => {
    if (showConfirm) confirmRef.current?.focus()
    else if (restoreFocus.current) {
      submitRef.current?.focus()
      restoreFocus.current = false
    }
  }, [showConfirm])

  function cancelConfirm() {
    restoreFocus.current = true
    setShowConfirm(false)
  }

  async function doSave() {
    setShowConfirm(false)
    setSaving(true)
    setError(null)
    setStatus("")
    try {
      const res = await fetch("/api/admin/settings/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(typeof data.error === "string" ? data.error : "Une erreur est survenue.")
        inputRef.current?.focus()
        return
      }
      const data = await res.json()
      setStatus("Identifiant modifié. Redirection vers la nouvelle adresse…")
      if (data.adminUrl) window.location.href = data.adminUrl
    } catch {
      setError("Impossible d'enregistrer. Vérifiez votre connexion et réessayez.")
      inputRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    if (!changed) {
      setStatus("Aucune modification.")
      return
    }
    if (hasPublishedEvents && !showConfirm) {
      setShowConfirm(true)
      return
    }
    void doSave()
  }

  async function handleDelete(oldSlug: string) {
    setDeletingSlug(oldSlug)
    setStatus("")
    setDeleteErrors((prev) => {
      const n = { ...prev }
      delete n[oldSlug]
      return n
    })
    try {
      const res = await fetch("/api/admin/settings/organization/slugs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: oldSlug }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setDeleteErrors((prev) => ({ ...prev, [oldSlug]: typeof data.error === "string" ? data.error : "Erreur." }))
        return
      }
      setHistory((h) => h.filter((e) => e.slug !== oldSlug))
      setStatus(`Ancien identifiant « ${oldSlug} » supprimé.`)
      // The button that had focus is gone: keep focus inside the section.
      historyHeadingRef.current?.focus()
    } catch {
      setDeleteErrors((prev) => ({ ...prev, [oldSlug]: "Impossible de supprimer. Vérifiez votre connexion." }))
    } finally {
      setDeletingSlug(null)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">Identifiant public (slug)</h2>

      <form onSubmit={handleSubmit} className="space-y-2">
        <label htmlFor={inputId} className="block text-sm text-gray-800">
          Identifiant
        </label>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value)
              setError(null)
              setStatus("")
              setShowConfirm(false)
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && showConfirm) cancelConfirm()
            }}
            placeholder="votre-identifiant"
            minLength={2}
            maxLength={40}
            pattern="^[a-z0-9]([a-z0-9\-]*[a-z0-9])?$"
            required
            aria-describedby={error ? `${helpId} ${errorId}` : helpId}
            aria-invalid={error ? true : undefined}
            className="flex-1 min-w-0 border border-gray-300 rounded-xl px-3 py-2 text-sm font-mono placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            ref={submitRef}
            type="submit"
            disabled={saving}
            className={`bg-gray-900 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-60 ${focusRing}`}
          >
            {saving ? "Enregistrement…" : "Modifier"}
          </button>
        </div>
        <p id={helpId} className="text-xs text-gray-600">
          Adresse de votre espace : <span className="font-mono break-all">{trimmed || "votre-identifiant"}.{baseDomain}</span>
          <span className="block">2 à 40 caractères : lettres minuscules, chiffres et tirets, sans tiret au début ni à la fin.</span>
        </p>
      </form>

      {showConfirm && (
        <div
          role="group"
          aria-labelledby={confirmId}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancelConfirm()
          }}
          className="bg-orange-50 border border-orange-300 rounded-xl p-3 space-y-2"
        >
          <p id={confirmId} className="text-sm text-orange-900">
            Des événements publiés existent. L&apos;ancien identifiant continuera de rediriger, mais les liens partagés
            afficheront la nouvelle adresse. Confirmer ?
          </p>
          <div className="flex gap-2">
            <button
              ref={confirmRef}
              type="button"
              onClick={() => void doSave()}
              className={`bg-orange-800 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-orange-900 ${focusRing}`}
            >
              Confirmer
            </button>
            <button
              type="button"
              onClick={cancelConfirm}
              className={`border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50 ${focusRing}`}
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      <p role="status" className="text-sm font-medium text-green-800 min-h-5">{status}</p>
      {error && <p id={errorId} role="alert" className="text-sm font-medium text-red-700">{error}</p>}

      {history.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-gray-100">
          <p ref={historyHeadingRef} tabIndex={-1} className="text-xs font-medium text-gray-700 outline-none">
            Anciens identifiants (redirigent vers l&apos;actuel)
          </p>
          {hasPublishedEvents && (
            <p id={warningId} className="text-sm text-orange-900">
              Attention : supprimer un ancien identifiant cassera les liens existants vers vos événements publiés.
            </p>
          )}
          <ul className="space-y-2">
            {history.map((entry) => (
              <li key={entry.slug} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
                <span className="text-sm font-mono text-gray-800 break-all">{entry.slug}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(entry.slug)}
                  disabled={deletingSlug === entry.slug}
                  aria-label={`Supprimer l'ancien identifiant ${entry.slug}`}
                  aria-describedby={hasPublishedEvents ? warningId : undefined}
                  className={`text-sm px-2 py-1 rounded text-red-700 hover:text-red-900 hover:bg-red-50 disabled:opacity-60 ${focusRing}`}
                >
                  {deletingSlug === entry.slug ? "Suppression…" : "Supprimer"}
                </button>
              </li>
            ))}
          </ul>
          {Object.entries(deleteErrors).map(([s, msg]) => (
            <p key={s} role="alert" className="text-sm font-medium text-red-700">
              Impossible de supprimer « {s} » : {msg}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
