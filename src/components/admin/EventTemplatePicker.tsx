"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { EVENT_TEMPLATES, findTemplate, templateSummary } from "@/lib/event-templates"

/**
 * « Partir d'un modèle » on the new-event page (#395): a blank form (children) or one of the
 * starter templates, which only needs a title and a start date. The template is a pre-filled
 * draft: everything is editable afterwards.
 */
export default function EventTemplatePicker({ children }: { children: React.ReactNode }) {
  const id = useId()
  const router = useRouter()
  const [templateId, setTemplateId] = useState("")
  // The template's title until the organizer types one.
  const [typedTitle, setTypedTitle] = useState<string | null>(null)
  const [startDate, setStartDate] = useState("")
  const [attempted, setAttempted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const template = templateId ? findTemplate(templateId) : undefined
  const title = typedTitle ?? template?.defaultTitle ?? ""
  const shiftCount = template?.shifts.length ?? 0
  const dateMissing = !/^\d{4}-\d{2}-\d{2}$/.test(startDate)

  async function create() {
    if (saving) return
    setAttempted(true)
    if (!template || dateMissing) {
      document.getElementById(`${id}-date`)?.focus()
      return
    }
    setSaving(true)
    setError(null)
    const res = await fetch("/api/admin/events/from-template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ templateId: template.id, title, startDate }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { setError(typeof data?.error === "string" ? data.error : "Erreur lors de la création."); return }
    router.push(`/admin/events/${data.id}/shifts`)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-gray-800 mb-1">Comment commencer ?</legend>
        <p className="text-xs text-gray-600">Un modèle crée un brouillon déjà rempli (postes, créneaux, horaires) que vous ajustez ensuite.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[{ id: "", name: "Page blanche", description: "Vous créez l'événement puis ses créneaux vous-même." }, ...EVENT_TEMPLATES].map((t) => (
            <label key={t.id || "blank"} className={`relative block rounded-xl border p-3 pl-9 cursor-pointer ${templateId === t.id ? "border-blue-600 bg-blue-50" : "border-gray-300 bg-white hover:bg-gray-50"}`}>
              <input
                type="radio"
                name={`${id}-template`}
                value={t.id}
                checked={templateId === t.id}
                onChange={() => setTemplateId(t.id)}
                className="absolute top-3.5 left-3 h-4 w-4 text-blue-600 focus:ring-2 focus:ring-blue-500"
              />
              <span className="block text-sm font-medium text-gray-900">{t.name}</span>
              <span className="block text-xs text-gray-600 mt-0.5">{t.description}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {/* Arrow keys browse the radios: focus stays in the group, the choice is announced. */}
      <p className="sr-only" aria-live="polite">{template ? `Modèle ${template.name} sélectionné.` : ""}</p>

      {template ? (
        <section aria-labelledby={`${id}-details`} className="bg-white rounded-2xl border border-blue-200 p-5 space-y-4">
          <h2 id={`${id}-details`} className="font-semibold text-gray-900">{template.name}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${id}-title`} className="block text-xs font-medium text-gray-600 mb-1">Titre</label>
              <input id={`${id}-title`} type="text" value={title} maxLength={200} onChange={(e) => setTypedTitle(e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor={`${id}-date`} className={`block text-xs font-medium mb-1 ${attempted && dateMissing ? "text-red-700" : "text-gray-600"}`}>
                {template.days > 1 ? "Premier jour" : "Date"} <span className="font-normal">(obligatoire)</span>
              </label>
              <input
                id={`${id}-date`} type="date" value={startDate} required
                aria-invalid={attempted && dateMissing ? true : undefined}
                aria-describedby={`${id}-date-hint${attempted && dateMissing ? ` ${id}-date-error` : ""}`}
                onChange={(e) => setStartDate(e.target.value)}
                className={`input ${attempted && dateMissing ? "!border-red-600" : ""}`}
              />
              <p id={`${id}-date-hint`} className="text-xs text-gray-600 mt-1">
                {template.days > 1 ? `${template.days} jours à partir de cette date.` : "Un seul jour."}
              </p>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-800">Ce qui sera créé</h3>
            <ul className="mt-1 text-sm text-gray-700 space-y-0.5">
              {templateSummary(template).map((r) => (
                <li key={r.roleName}>
                  <span className="font-medium">{r.roleName}</span> : {r.shiftCount} créneau{r.shiftCount > 1 ? "x" : ""}, {r.capacity} place{r.capacity > 1 ? "s" : ""}
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-600 mt-2">Brouillon, non publié. Chaque créneau se modifie ou se supprime ensuite ; les horaires et effectifs sont des points de départ.</p>
          </div>

          {attempted && dateMissing && <p id={`${id}-date-error`} role="alert" className="text-sm text-red-700">Champ obligatoire manquant : {template.days > 1 ? "premier jour" : "date"}.</p>}
          {error && <p role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</p>}

          <button
            type="button"
            onClick={create}
            aria-disabled={saving}
            className={`bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${saving ? "opacity-50" : ""}`}
          >
            {saving ? "Création…" : `Créer le brouillon (${shiftCount} créneaux)`}
          </button>
        </section>
      ) : (
        children
      )}
    </div>
  )
}
