"use client"

import { useState } from "react"
import { buildVolunteerCharter } from "@/lib/volunteer-charter"

export default function OrgCharterForm({
  initialCharter,
  initialHasOrgInsurance,
}: {
  initialCharter: string | null
  initialHasOrgInsurance: boolean
}) {
  const [hasOrgInsurance, setHasOrgInsurance] = useState(initialHasOrgInsurance)
  const [text, setText] = useState(initialCharter ?? buildVolunteerCharter({ hasOrgInsurance }))
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleToggle(value: boolean) {
    setHasOrgInsurance(value)
    setText(buildVolunteerCharter({ hasOrgInsurance: value }))
    setSuccess(false)
  }

  async function handleSave() {
    setSaving(true)
    setSuccess(false)
    setError(null)
    const res = await fetch("/api/admin/settings/organization", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ volunteerCharter: text, hasOrgInsurance }),
    })
    setSaving(false)
    if (res.ok) setSuccess(true)
    else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? "Une erreur est survenue.")
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-800">Convention des Bénévoles</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Ce texte est présenté aux bénévoles lors de l'inscription.
        </p>
      </div>

      <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-800">Assurance RC fournie par l'organisation</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {hasOrgInsurance
              ? "La charte indique que les bénévoles sont couverts par votre RC."
              : "La charte indique que chaque bénévole doit avoir sa propre couverture."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={hasOrgInsurance}
          onClick={() => handleToggle(!hasOrgInsurance)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            hasOrgInsurance ? "bg-blue-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
              hasOrgInsurance ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
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
          onClick={() => { setText(buildVolunteerCharter({ hasOrgInsurance })); setSuccess(false) }}
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Réinitialiser la convention par défaut
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
