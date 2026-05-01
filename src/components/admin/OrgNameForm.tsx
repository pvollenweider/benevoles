"use client"

import { useState } from "react"

export default function OrgNameForm({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (name.trim() === initialName) return
    setLoading(true)
    setError(null)
    setSaved(false)

    const res = await fetch("/api/admin/settings/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })

    setLoading(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(typeof data?.error === "string" ? data.error : "Une erreur est survenue.")
      return
    }

    setSaved(true)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-gray-900">Nom de l&apos;organisation</h2>
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setSaved(false) }}
          minLength={2}
          maxLength={100}
          required
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading || name.trim() === initialName || name.trim().length < 2}
          className="bg-gray-900 text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-40"
        >
          {loading ? "…" : "Enregistrer"}
        </button>
      </div>
      {saved && <p className="text-xs text-green-600">Nom mis à jour.</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  )
}
