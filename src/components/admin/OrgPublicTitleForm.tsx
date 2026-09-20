"use client"

import { useId, useState } from "react"

const DEFAULT_TITLE = "Bénévoles"

/**
 * Editable headline of the organization's public events page. Empty means the
 * default, "Bénévoles". The saved value is tracked locally so the buttons
 * reflect what is actually stored.
 */
export default function OrgPublicTitleForm({ initialTitle }: { initialTitle: string }) {
  const [saved, setSaved] = useState(initialTitle)
  const [value, setValue] = useState(initialTitle)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const helpId = useId()
  const errorId = useId()

  async function save(next: string, doneMessage: string) {
    setLoading(true)
    setError(null)
    setStatus("")
    try {
      const res = await fetch("/api/admin/settings/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicTitle: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(typeof data?.error === "string" ? data.error : "Une erreur est survenue.")
        return
      }
      const data = await res.json()
      const stored: string = data.publicTitle ?? ""
      setSaved(stored)
      setValue(stored)
      setStatus(doneMessage)
    } catch {
      setError("Impossible d'enregistrer. Vérifiez votre connexion et réessayez.")
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    const trimmed = value.trim()
    if (trimmed === saved) {
      setError(null)
      setStatus("Aucune modification.")
      return
    }
    if (trimmed.length === 1) {
      setError("Le titre doit contenir au moins 2 caractères, ou rester vide pour utiliser « Bénévoles ».")
      return
    }
    void save(trimmed, trimmed ? "Titre enregistré." : "Titre rétabli.")
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">Titre de la page publique</h2>
      <div>
        <label htmlFor={inputId} className="block text-sm text-gray-800 mb-1">
          Titre affiché en haut de la page de vos événements
        </label>
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setStatus("")
            setError(null)
          }}
          maxLength={100}
          placeholder={DEFAULT_TITLE}
          aria-describedby={error ? `${helpId} ${errorId}` : helpId}
          aria-invalid={error ? true : undefined}
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p id={helpId} className="mt-1 text-xs text-gray-600">
          Il remplace « {DEFAULT_TITLE} » sur la page publique de l&apos;organisation. Laissez vide pour utiliser « {DEFAULT_TITLE} ».
          Ce n&apos;est pas le nom de l&apos;organisation, qui reste affiché au-dessus.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={loading}
          className="bg-gray-900 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
        >
          {loading ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={() => void save("", "Titre rétabli.")}
          disabled={loading || (saved === "" && value.trim() === "")}
          className="rounded-xl px-4 py-2 text-sm font-medium border border-gray-300 text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
        >
          Rétablir « {DEFAULT_TITLE} »
        </button>
      </div>
      <p role="status" className="text-sm font-medium text-green-800 min-h-5">{status}</p>
      {error && <p id={errorId} role="alert" className="text-sm font-medium text-red-700">{error}</p>}
    </form>
  )
}
