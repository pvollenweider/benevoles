"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type EventFormData = {
  title: string
  description: string
  location: string
  startDate: string
  endDate: string
  publicInstructions: string
  confirmationMessage: string
  publicStatus: "draft" | "published" | "archived"
}

type Props = {
  initialData?: Partial<EventFormData> & { id?: string }
}

const defaultData: EventFormData = {
  title: "",
  description: "",
  location: "",
  startDate: "",
  endDate: "",
  publicInstructions: "",
  confirmationMessage: "Merci pour votre inscription ! À bientôt.",
  publicStatus: "draft",
}

export default function EventForm({ initialData }: Props) {
  const router = useRouter()
  const isEdit = !!initialData?.id
  const [form, setForm] = useState<EventFormData>({ ...defaultData, ...initialData })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: keyof EventFormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const url = isEdit ? `/api/admin/events/${initialData!.id}` : "/api/admin/events"
    const method = isEdit ? "PATCH" : "POST"

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError("Erreur lors de la sauvegarde.")
      return
    }

    router.push(`/admin/events/${data.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
        <input
          type="text"
          required
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Lieu</label>
        <input
          type="text"
          value={form.location}
          onChange={(e) => set("location", e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date début *</label>
          <input
            type="date"
            required
            value={form.startDate}
            onChange={(e) => set("startDate", e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date fin *</label>
          <input
            type="date"
            required
            value={form.endDate}
            onChange={(e) => set("endDate", e.target.value)}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Instructions publiques</label>
        <textarea
          rows={2}
          value={form.publicInstructions}
          onChange={(e) => set("publicInstructions", e.target.value)}
          placeholder="Texte affiché aux bénévoles en haut de la page"
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Message de confirmation</label>
        <textarea
          rows={2}
          value={form.confirmationMessage}
          onChange={(e) => set("confirmationMessage", e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
        <select
          value={form.publicStatus}
          onChange={(e) => set("publicStatus", e.target.value)}
          className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="draft">Brouillon (non visible)</option>
          <option value="published">Publié (visible)</option>
          <option value="archived">Archivé</option>
        </select>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {saving ? "Sauvegarde…" : isEdit ? "Enregistrer" : "Créer l'événement"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="text-gray-500 px-4 py-2.5 text-sm hover:text-gray-800"
        >
          Annuler
        </button>
      </div>
    </form>
  )
}
