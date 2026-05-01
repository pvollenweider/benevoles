"use client"

import { useState } from "react"
import { DEFAULT_VOLUNTEER_CHARTER } from "@/lib/volunteer-charter"

export default function OrgCharterForm({ initialCharter }: { initialCharter: string | null }) {
  const [text, setText] = useState(initialCharter ?? DEFAULT_VOLUNTEER_CHARTER)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setSuccess(false)
    setError(null)
    const res = await fetch("/api/admin/settings/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volunteerCharter: text }),
    })
    setSaving(false)
    if (res.ok) setSuccess(true)
    else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? "Une erreur est survenue.")
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">Charte du bénévole</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Ce texte est présenté aux bénévoles lors de l'inscription. Laissez le texte par défaut ou personnalisez-le.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setSuccess(false) }}
        rows={14}
        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
      />

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => { setText(DEFAULT_VOLUNTEER_CHARTER); setSuccess(false) }}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Réinitialiser le texte par défaut
        </button>
        <div className="flex items-center gap-3">
          {success && <span className="text-xs text-green-600">Enregistré ✓</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  )
}
