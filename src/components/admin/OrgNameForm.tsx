"use client"

import { useId, useState } from "react"

export default function OrgNameForm({ initialName }: { initialName: string }) {
  const [saved, setSaved] = useState(initialName)
  const [name, setName] = useState(initialName)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState<string | null>(null)
  const inputId = useId()
  const helpId = useId()
  const errorId = useId()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    const trimmed = name.trim()
    if (trimmed === saved) {
      setError(null)
      setStatus("Aucune modification.")
      return
    }
    if (trimmed.length < 2) {
      setError("Le nom doit contenir au moins 2 caractères.")
      return
    }

    setLoading(true)
    setError(null)
    setStatus("")
    try {
      const res = await fetch("/api/admin/settings/organization", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(typeof data?.error === "string" ? data.error : "Une erreur est survenue.")
        return
      }
      setSaved(trimmed)
      setName(trimmed)
      setStatus("Nom mis à jour.")
    } catch {
      setError("Impossible d'enregistrer. Vérifiez votre connexion et réessayez.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">Nom de l&apos;organisation</h2>
      <div>
        <label htmlFor={inputId} className="block text-sm text-gray-800 mb-1">
          Nom
        </label>
        <input
          id={inputId}
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setStatus("")
            setError(null)
          }}
          maxLength={100}
          aria-describedby={error ? `${helpId} ${errorId}` : helpId}
          aria-invalid={error ? true : undefined}
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p id={helpId} className="mt-1 text-xs text-gray-600">
          2 à 100 caractères. Affiché dans l&apos;administration, dans les emails et au-dessus du titre de la page publique.
        </p>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="bg-gray-900 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-800"
      >
        {loading ? "Enregistrement…" : "Enregistrer"}
      </button>
      <p role="status" className="text-sm font-medium text-green-800 min-h-5">{status}</p>
      {error && <p id={errorId} role="alert" className="text-sm font-medium text-red-700">{error}</p>}
    </form>
  )
}
