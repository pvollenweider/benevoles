"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState } from "react"
import CoordinatesField from "@/components/admin/CoordinatesField"
import { requestJson } from "@/lib/use-submit"
import { KNOWN_ROLES } from "@/lib/roles"
import { resolveNewShiftDisplayOrder, isCompleteTime, addMinutes } from "@/lib/gantt-utils"
import { SHIFT_CONTACT_NAME_MAX, SHIFT_CONTACT_PHONE_MAX, SHIFT_INSTRUCTIONS_MAX } from "@/lib/shift-info"
import { fmtLongDate as fmtDate, normalizeTime } from "@/lib/shifts-admin"
import type { RawShift } from "./types"

export const emptyShift = {
  roleName: "", label: "", description: "", date: "", startTime: "", endTime: "",
  capacity: 2, locationDetails: "", latitude: null as number | null, longitude: null as number | null, displayOrder: 0, internalNotes: "", waitlistEnabled: false, requiresApproval: false,
  minAge: "" as number | string,
  contactName: "", contactPhone: "", instructions: "",
}

export type ShiftFormValues = typeof emptyShift

/**
 * Quick-add / edit form of one shift: owns the form values, sends the POST (new) or PATCH (edit).
 * The parent remounts it (key) each time it opens it, which resets the values to `initial`.
 */
export default function ShiftEditor({
  ref, eventId, dates, editingId, initial, existingShifts, onSaved, onCancel,
}: {
  ref?:           React.Ref<HTMLDivElement>
  eventId:        string
  dates:          string[]
  editingId:      string | null
  initial:        Partial<ShiftFormValues>
  existingShifts: RawShift[]
  /** The saved shift as the API returned it, with the id it was edited under (null: created). */
  onSaved:        (data: RawShift & { date?: string }, editingId: string | null) => void
  onCancel:       () => void
}) {
  const singleDay = dates.length === 1
  const [form, setForm] = useState<ShiftFormValues>({ ...emptyShift, ...initial })
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)

  function setField(k: string, v: string | number | boolean) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSave() {
    if (!form.roleName || !form.date || !form.startTime || !form.endTime) {
      setAttempted(true)
      return
    }
    setSaving(true)
    setError(null)

    const label  = form.label.trim() || form.roleName
    const url    = editingId ? `/api/admin/shifts/${editingId}` : "/api/admin/shifts"
    const method = editingId ? "PATCH" : "POST"
    const minAge = form.minAge === "" ? null : Number(form.minAge)
    const displayOrder = editingId
      ? form.displayOrder
      : resolveNewShiftDisplayOrder(existingShifts, form.roleName, form.displayOrder)
    const body   = editingId
      ? { ...form, label, capacity: Number(form.capacity), minAge, displayOrder }
      : { ...form, label, eventId, capacity: Number(form.capacity), minAge, displayOrder }

    const outcome = await requestJson<RawShift & { date?: string }>(() => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), "Erreur lors de la sauvegarde.")
    setSaving(false)

    if (!outcome.ok) {
      setError(outcome.error)
      return
    }
    setForm(emptyShift)
    onSaved(outcome.data, editingId)
  }

  return (
    <div ref={ref} className="bg-white rounded-2xl border border-blue-200 p-5 space-y-4">
      <h3 className="font-semibold text-gray-800">{editingId ? "Modifier le créneau" : "Nouveau créneau"}</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`roleName-${editingId ?? "new"}`} className={`block text-xs font-medium mb-1 ${attempted && !form.roleName ? "text-red-500" : "text-gray-600"}`}>Poste *</label>
          <input
            id={`roleName-${editingId ?? "new"}`}
            type="text" list="role-options"
            value={form.roleName}
            onChange={e => setField("roleName", e.target.value)}
            placeholder="ex. Billetterie"
            className={`input ${attempted && !form.roleName ? "!border-red-400" : ""}`}
          />
          <datalist id="role-options">
            {KNOWN_ROLES.map(r => <option key={r} value={r} />)}
          </datalist>
        </div>
        <div>
          <label htmlFor={`label-${editingId ?? "new"}`} className="block text-xs font-medium text-gray-600 mb-1">Libellé</label>
          <input
            id={`label-${editingId ?? "new"}`}
            type="text"
            value={form.label}
            onChange={e => setField("label", e.target.value)}
            placeholder={form.roleName || "ex. Entrée principale"}
            className="input"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor={`date-${editingId ?? "new"}`} className={`block text-xs font-medium mb-1 ${attempted && !form.date ? "text-red-500" : "text-gray-600"}`}>Date *</label>
          {singleDay ? (
            <input id={`date-${editingId ?? "new"}`} type="text" readOnly value={fmtDate(dates[0])} className="input bg-gray-50 text-gray-700" />
          ) : (
            <select id={`date-${editingId ?? "new"}`} value={form.date} onChange={e => setField("date", e.target.value)} className={`input ${attempted && !form.date ? "!border-red-400" : ""}`}>
              <option value="">— choisir —</option>
              {dates.map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
            </select>
          )}
        </div>
        <div>
          <label htmlFor={`startTime-${editingId ?? "new"}`} className={`block text-xs font-medium mb-1 ${attempted && !form.startTime ? "text-red-500" : "text-gray-600"}`}>Début *</label>
          <input
            id={`startTime-${editingId ?? "new"}`}
            type="text" placeholder="HH:MM" value={form.startTime}
            className={`input ${attempted && !form.startTime ? "!border-red-400" : ""}`}
            onChange={e => {
              const start = e.target.value
              setForm(f => ({
                ...f,
                startTime: start,
                endTime: isCompleteTime(start) && (!f.endTime || f.endTime <= start) ? addMinutes(start, 60) : f.endTime,
              }))
            }}
            onBlur={e => setField("startTime", normalizeTime(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor={`endTime-${editingId ?? "new"}`} className={`block text-xs font-medium mb-1 ${attempted && !form.endTime ? "text-red-500" : "text-gray-600"}`}>Fin *</label>
          <input
            id={`endTime-${editingId ?? "new"}`}
            type="text" placeholder="HH:MM" value={form.endTime}
            className={`input ${attempted && !form.endTime ? "!border-red-400" : ""}`}
            onChange={e => setField("endTime", e.target.value)}
            onBlur={e => setField("endTime", normalizeTime(e.target.value))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`capacity-${editingId ?? "new"}`} className="block text-xs font-medium text-gray-600 mb-1">Capacité *</label>
          <input id={`capacity-${editingId ?? "new"}`} type="number" min="1" value={form.capacity} onChange={e => setField("capacity", e.target.value)} className="input" />
        </div>
        <div>
          <label htmlFor={`description-${editingId ?? "new"}`} className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <input id={`description-${editingId ?? "new"}`} type="text" value={form.description} onChange={e => setField("description", e.target.value)} className="input" />
        </div>
      </div>
      <fieldset aria-describedby={`shiftinfo-hint-${editingId ?? "new"}`} className="border border-gray-200 rounded-xl p-3 space-y-3">
        <legend className="text-xs font-semibold text-gray-700 px-1">Infos pratiques pour les bénévoles</legend>
        <p id={`shiftinfo-hint-${editingId ?? "new"}`} className="text-xs text-gray-600">Lieu et consigne sont visibles sur la page publique d&apos;inscription. La personne de contact et son téléphone ne sont envoyés qu&apos;aux inscrits : email de confirmation, rappels, page personnelle.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor={`locationDetails-${editingId ?? "new"}`} className="block text-xs font-medium text-gray-600 mb-1">Lieu de rendez-vous</label>
            <input id={`locationDetails-${editingId ?? "new"}`} type="text" value={form.locationDetails} onChange={e => setField("locationDetails", e.target.value)} placeholder="ex. Entrée B, côté parking" className="input" />
          </div>
          <div className="sm:col-span-3">
            <CoordinatesField
              id={`coordinates-${editingId ?? "new"}`}
              small
              value={{ latitude: form.latitude, longitude: form.longitude }}
              onChange={(c) => setForm((f) => ({ ...f, latitude: c?.latitude ?? null, longitude: c?.longitude ?? null }))}
              hint="Vide : le lieu de l'événement est utilisé pour le lien « Voir sur la carte »."
            />
          </div>
          <div>
            <label htmlFor={`contactName-${editingId ?? "new"}`} className="block text-xs font-medium text-gray-600 mb-1">Personne de contact</label>
            <input id={`contactName-${editingId ?? "new"}`} type="text" maxLength={SHIFT_CONTACT_NAME_MAX} value={form.contactName} onChange={e => setField("contactName", e.target.value)} placeholder="ex. Léa (responsable bar)" className="input" />
          </div>
          <div>
            <label htmlFor={`contactPhone-${editingId ?? "new"}`} className="block text-xs font-medium text-gray-600 mb-1">Téléphone du contact</label>
            <input id={`contactPhone-${editingId ?? "new"}`} type="tel" maxLength={SHIFT_CONTACT_PHONE_MAX} value={form.contactPhone} onChange={e => setField("contactPhone", e.target.value)} placeholder="ex. 079 000 00 00" className="input" />
          </div>
        </div>
        <div>
          <label htmlFor={`instructions-${editingId ?? "new"}`} className="block text-xs font-medium text-gray-600 mb-1">Consigne pratique</label>
          <textarea id={`instructions-${editingId ?? "new"}`} rows={2} maxLength={SHIFT_INSTRUCTIONS_MAX} aria-describedby={`instructions-hint-${editingId ?? "new"}`} value={form.instructions} onChange={e => setField("instructions", e.target.value)} placeholder="ex. Venir 10 min avant, tenue noire, gilet fourni sur place." className="input" />
          <p id={`instructions-hint-${editingId ?? "new"}`} className="text-xs text-gray-600 mt-1">{form.instructions.length}/{SHIFT_INSTRUCTIONS_MAX} caractères</p>
        </div>
      </fieldset>
      <div>
        <label htmlFor={`internalNotes-${editingId ?? "new"}`} className="block text-xs font-medium text-gray-600 mb-1">Notes internes (jamais montrées aux bénévoles)</label>
        <input id={`internalNotes-${editingId ?? "new"}`} type="text" value={form.internalNotes} onChange={e => setField("internalNotes", e.target.value)} className="input" />
      </div>
      <div>
        <label htmlFor={`minAge-${editingId ?? "new"}`} className="block text-xs font-medium text-gray-600 mb-1">Âge minimum (optionnel)</label>
        <input
          id={`minAge-${editingId ?? "new"}`}
          type="number" min="0" max="120" placeholder="ex. 18"
          value={form.minAge}
          onChange={e => setField("minAge", e.target.value === "" ? "" : Number(e.target.value))}
          aria-describedby={`minAge-hint-${editingId ?? "new"}`}
          className="input"
        />
        <p id={`minAge-hint-${editingId ?? "new"}`} className="text-[11px] text-gray-500 mt-1">
          Affiché en info sur le créneau public ; vérifié à l&apos;inscription (date de naissance demandée si besoin).
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`waitlistEnabled-${editingId ?? "new"}`}
          checked={Boolean(form.waitlistEnabled)}
          onChange={e => setField("waitlistEnabled", e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
        />
        <label htmlFor={`waitlistEnabled-${editingId ?? "new"}`} className="text-xs font-medium text-gray-600 select-none cursor-pointer">
          Activer la liste d'attente (si complet, les bénévoles peuvent s'y inscrire)
        </label>
      </div>
      <div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`requiresApproval-${editingId ?? "new"}`}
            checked={Boolean(form.requiresApproval)}
            onChange={e => setField("requiresApproval", e.target.checked)}
            aria-describedby={`requiresApproval-hint-${editingId ?? "new"}`}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500"
          />
          <label htmlFor={`requiresApproval-${editingId ?? "new"}`} className="text-xs font-medium text-gray-600 select-none cursor-pointer">
            Sur validation (chaque inscription est une demande à accepter ou refuser)
          </label>
        </div>
        <p id={`requiresApproval-hint-${editingId ?? "new"}`} className="text-xs text-gray-600 mt-1 ml-6">
          Pour un poste sensible (conduite, caisse, sécurité). Une demande garde sa place jusqu&apos;à votre décision ; les inscriptions déjà confirmées ne changent pas.
        </p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}
      {attempted && (!form.roleName || !form.date || !form.startTime || !form.endTime) && (
        <p className="text-xs text-red-500">Veuillez remplir les champs en rouge.</p>
      )}

      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
          {saving ? "…" : editingId ? "Enregistrer" : "Ajouter"}
        </button>
        <button onClick={onCancel}
          className="text-gray-500 px-3 py-2 text-sm hover:text-gray-800">
          Annuler
        </button>
      </div>
    </div>
  )
}
