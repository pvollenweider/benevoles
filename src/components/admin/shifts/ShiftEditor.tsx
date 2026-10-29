"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useRef, useState } from "react"
import { flushSync } from "react-dom"
import CoordinatesField from "@/components/admin/CoordinatesField"
import { requestJson } from "@/lib/use-submit"
import { matchingPoste, posteKey } from "@/lib/poste-suggestions"
import { resolveNewShiftDisplayOrder, isCompleteTime, endAfterStartChange } from "@/lib/gantt-utils"
import { SHIFT_CONTACT_NAME_MAX, SHIFT_CONTACT_PHONE_MAX, SHIFT_INSTRUCTIONS_MAX } from "@/lib/shift-info"
import { fmtLongDate as fmtDate, normalizeTime } from "@/lib/shifts-admin"
import { SHIFT_FIELD_ERRORS, missingFieldsSummary, missingShiftFields, type ShiftField } from "@/lib/shift-editor-form"
import { minVolunteersProblem, parseMinVolunteers } from "@/lib/staffing"
import PosteHint from "./PosteHint"
import { newPosteSectorHint, posteSectorOf } from "@/lib/poste-sector"
import { usePosteSector } from "./usePosteSector"
import { MANAGE_SECTORS_POSTES_LABEL, NO_SECTOR_LABEL } from "@/lib/sectors"
import SectorSelect from "./SectorSelect"
import type { RawShift } from "./types"
import { NO_PLACE_LABEL, selectablePlaces } from "@/lib/places"

export const emptyShift = {
  roleName: "", label: "", description: "", date: "", startTime: "", endTime: "",
  capacity: 2, minVolunteers: "" as number | string, locationDetails: "", latitude: null as number | null, longitude: null as number | null, displayOrder: 0, internalNotes: "", waitlistEnabled: false, requiresApproval: false,
  mealOnTheGo: false,
  /** Place of the mission (#1171, lot 2): an EventPlace id, "" for none. */
  placeId: "",
  minAge: "" as number | string,
  contactName: "", contactPhone: "", instructions: "",
}

export type ShiftFormValues = typeof emptyShift

/**
 * Quick-add / edit form of one shift: owns the form values, sends the POST (new) or PATCH (edit).
 * The parent remounts it (key) each time it opens it, which resets the values to `initial`.
 */
export default function ShiftEditor({
  ref, eventId, dates, editingId, initial, existingShifts, onSaved, onCancel, sectors = null, presetSector = null, mealOnTheGoShown = false, places = null,
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
  /**
   * Sectors (#1147): the event's active sectors, in order, once it adopted sectors; null otherwise
   * (no sector field). A new shift then asks for the sector before the poste.
   */
  sectors?:       { id: string; name: string }[] | null
  /** « Ajouter un poste dans « S » »: the sector preset, the poste field focused first. */
  presetSector?:  { id: string; name: string } | null
  /** « Repas sur le pouce possible » (#1171, lot 2): only where the workload protection can be used. */
  mealOnTheGoShown?: boolean
  /** Places of the event (#1171, lot 2), where the workload protection can be used; null: no field. */
  places?: { id: string; name: string; displayOrder: number; archivedAt: string | null }[] | null
}) {
  const singleDay = dates.length === 1
  const [form, setForm] = useState<ShiftFormValues>({ ...emptyShift, ...initial })
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  const sfx = editingId ?? "new"
  // Derived, so filling a field clears its error at once (#554).
  const missing = attempted ? missingShiftFields(form) : []
  const invalid = new Set<ShiftField>(missing)

  /** The attributes and the message of a required field, invalid or not. */
  function fieldError(f: ShiftField) {
    const errorId = `${f}-error-${sfx}`
    return {
      invalidProps: {
        "aria-invalid": invalid.has(f) || undefined,
        "aria-describedby": invalid.has(f) ? errorId : undefined,
      },
      border: invalid.has(f) ? "!border-red-600" : "",
      message: invalid.has(f) ? <p id={errorId} className="text-xs text-red-700 mt-1">{SHIFT_FIELD_ERRORS[f]}</p> : null,
    }
  }
  const roleField = fieldError("roleName")
  const dateField = fieldError("date")
  const startField = fieldError("startTime")
  const endField = fieldError("endTime")
  const capacityField = fieldError("capacity")
  // Poste field (#1018): the event's postes, then the examples. Typing an existing one (case and
  // spaces aside) joins it: its stored spelling is sent and the hint says its settings apply. An
  // edited shift already in that poste gets no hint: nothing changes for it.
  const listId = useId()
  const hintId = `roleName-hint-${sfx}`
  const poste = matchingPoste(existingShifts, form.roleName)
  const changedPoste = !editingId || posteKey(form.roleName) !== posteKey(initial.roleName ?? "")
  const hintPoste = changedPoste ? poste : null

  // Sector first (#1147), for a new shift of an event that adopted sectors: the select comes
  // before the poste. Until the organiser chooses a sector it follows the existing poste typed;
  // once chosen, a poste typed that exists in another sector is never moved: the form says where
  // it is, offers to switch the select, and saving waits (usePosteSector). The select only when
  // there is a sector to choose; with every sector archived, the new poste still goes to
  // « Autres postes » explicitly (sendSector).
  const sector = usePosteSector({ sectors: editingId ? null : sectors, presetSector, existingShifts, roleName: form.roleName })
  const sendSector = sector.send
  const sectorFieldShown = sector.shown
  const activeIds = new Set((sectors ?? []).map((s) => s.id))
  const chosenSector = sector.sectorId
  const sectorNameOf = (id: string | null) => (id ? sectors?.find((s) => s.id === id)?.name ?? null : null)
  const mismatch = sector.mismatch
  const mismatchText = sector.message ? `${sector.message}${mismatch && attempted ? " Choisissez ce secteur, ou un autre nom de poste." : ""}` : null
  const mismatchInvalid = attempted && !!mismatch
  // The live hint stays silent right after focus moved for it (switch, blocked save); typing again speaks.
  const [hintQuiet, setHintQuiet] = useState(false)
  const sectorSelectRef = useRef<HTMLSelectElement>(null)
  const roleInputRef = useRef<HTMLInputElement>(null)
  const suggestions = sector.suggestions
  // What the save will create, said under the heading while the poste typed is new.
  const newPosteHint = sectorFieldShown && !poste && (presetSector || form.roleName.trim())
    ? newPosteSectorHint(sector.sectorName)
    : null
  // Editing: the sector belongs to the poste, shown, changed with « Déplacer… » (the shift takes
  // the sector of the poste it goes to; a new name keeps the shift's own).
  const editSectorName = sectors && editingId
    ? sectorNameOf(posteSectorOf(existingShifts, changedPoste && poste ? poste : initial.roleName ?? "", activeIds))
    : undefined
  const roleInvalidProps = mismatchInvalid && !roleField.invalidProps["aria-invalid"] ? { "aria-invalid": true as const } : roleField.invalidProps
  const editSectorId = `roleName-sector-${sfx}`
  const newPosteHintId = `new-poste-hint-${sfx}`
  const roleDescribedBy = [roleField.invalidProps["aria-describedby"], hintPoste || mismatchText ? hintId : undefined, newPosteHint ? newPosteHintId : undefined, editSectorName !== undefined ? editSectorId : undefined].filter(Boolean).join(" ") || undefined

  function switchToPosteSector() {
    if (!mismatch) return
    // The button goes with the disagreement: focus moves to the select in the same task, which
    // reads its new value and, as its description, that the poste's settings apply.
    flushSync(() => {
      sector.switchToPoste()
      setHintQuiet(true)
    })
    sectorSelectRef.current?.focus()
  }
  // Minimum of people (#949): optional, 1 to the places. Checked like the required fields, once
  // a save was attempted, and then live as it is corrected.
  const minimumProblem = minVolunteersProblem(parseMinVolunteers(form.minVolunteers), Number(form.capacity))
  const minimumInvalid = attempted && minimumProblem !== null

  function setField(k: string, v: string | number | boolean) {
    setForm(f => ({ ...f, [k]: v }))
  }

  // The start and end the end time was set against (#1024): the saved shift, the end typed, or the
  // default end once filled. Read on each change of the start, so a 22:00–02:00 shift keeps ending
  // at 02:00 the next morning whatever the starts typed on the way.
  const endAnchor = useRef({ start: form.startTime, end: form.endTime })

  function setStart(start: string) {
    if (!isCompleteTime(start)) { setField("startTime", start); return }
    const endTime = endAfterStartChange(endAnchor.current, start)
    if (!isCompleteTime(endAnchor.current.end)) endAnchor.current = { start, end: endTime }
    setForm(f => ({ ...f, startTime: start, endTime }))
  }

  function setEnd(end: string) {
    endAnchor.current = { start: form.startTime, end }
    setField("endTime", end)
  }

  async function handleSave() {
    // aria-disabled, not disabled, while saving: a disabled button would drop focus to <body>.
    if (saving) return
    const missingNow = missingShiftFields(form)
    const minimumNow = minVolunteersProblem(parseMinVolunteers(form.minVolunteers), Number(form.capacity))
    if (mismatch && missingNow.length === 0 && !minimumNow) {
      // The poste field says where the poste is and how to fix it, once focus reaches it.
      setAttempted(true)
      setError(null)
      setHintQuiet(true)
      requestAnimationFrame(() => roleInputRef.current?.focus())
      return
    }
    if (missingNow.length > 0 || minimumNow) {
      // Each message is tied to its field, not an alert: focus moves to the first invalid field
      // once it says it is invalid, so its message is read once, with the field.
      setAttempted(true)
      setError(null)
      // In form order: the required fields, then the minimum (it comes after the capacity).
      const first = missingNow[0] ?? "minVolunteers"
      requestAnimationFrame(() => document.getElementById(`${first}-${sfx}`)?.focus())
      return
    }
    setSaving(true)
    setError(null)

    // An edited shift whose poste is unchanged keeps its own spelling.
    const roleName = changedPoste ? poste ?? form.roleName : form.roleName
    const label  = form.label.trim() || roleName
    const url    = editingId ? `/api/admin/shifts/${editingId}` : "/api/admin/shifts"
    const method = editingId ? "PATCH" : "POST"
    const minAge = form.minAge === "" ? null : Number(form.minAge)
    const minVolunteers = parseMinVolunteers(form.minVolunteers)
    const displayOrder = editingId
      ? form.displayOrder
      : resolveNewShiftDisplayOrder(existingShifts, roleName, form.displayOrder)
    // The place is sent only where the field is shown, so an edit elsewhere never clears it.
    const { placeId: chosenPlace, ...values } = form
    const place = places ? { placeId: chosenPlace || null } : {}
    const body   = editingId
      ? { ...values, ...place, roleName, label, capacity: Number(form.capacity), minVolunteers, minAge, displayOrder }
      : { ...values, ...place, roleName, label, eventId, capacity: Number(form.capacity), minVolunteers, minAge, displayOrder, ...(sendSector ? { sectorId: chosenSector } : {}) }

    const outcome = await requestJson<RawShift & { date?: string }>(() => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), "Erreur lors de la sauvegarde.")
    setSaving(false)

    if (!outcome.ok) {
      setError(outcome.error)
      return
    }
    onSaved(outcome.data, editingId)
  }

  return (
    <div ref={ref} role="group" aria-labelledby={`shift-editor-title-${sfx}`} className="bg-white rounded-2xl border border-blue-200 p-5 space-y-4">
      <div>
        <h2 id={`shift-editor-title-${sfx}`} className="font-semibold text-gray-800">{editingId ? "Modifier le créneau" : presetSector ? "Nouveau poste : premier créneau" : "Nouveau créneau"}</h2>
        {newPosteHint && <p id={newPosteHintId} className="text-xs text-gray-600 mt-0.5">{newPosteHint}</p>}
      </div>
      {sectorFieldShown && (
        // First field: focused first, so the sector is heard before the poste (unless preset).
        <SectorSelect
          ref={sectorSelectRef}
          id={`sectorId-${sfx}`}
          sectors={sectors!}
          value={chosenSector ?? ""}
          autoFocus={!presetSector}
          // Choosing the sector it already follows says nothing new: the hint stays quiet.
          onChange={(v) => { setHintQuiet(sector.following && v === (sector.sectorId ?? "")); sector.choose(v) }}
          // After a switch (quiet), or while it follows the poste typed: the reason is its description.
          describedBy={hintPoste && !mismatch && (hintQuiet || sector.following) ? hintId : undefined}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`roleName-${sfx}`} className="block text-xs font-medium text-gray-600 mb-1">Poste <span aria-hidden="true">*</span></label>
          {/* The editor remounts on every open (key): focus lands here each time. */}
          <input
            ref={roleInputRef}
            id={`roleName-${sfx}`}
            type="text" list={listId}
            autoFocus={!sectorFieldShown || !!presetSector} required {...roleInvalidProps}
            aria-describedby={roleDescribedBy}
            value={form.roleName}
            onChange={e => { setField("roleName", e.target.value); sector.followPoste(e.target.value); setHintQuiet(false) }}
            placeholder="ex. Billetterie"
            className={`input ${roleField.border || (mismatchInvalid ? "!border-red-600" : "")}`}
          />
          {roleField.message}
          <PosteHint id={hintId} poste={hintPoste} message={mismatchText} invalid={mismatchInvalid} quiet={hintQuiet} />
          {mismatch && (
            <button type="button" onClick={switchToPosteSector} className="mt-1 text-xs font-medium text-blue-700 hover:text-blue-900 rounded-md min-h-6 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
              {sector.switchLabel}
            </button>
          )}
          {editSectorName !== undefined && (
            <p id={editSectorId} className="text-xs text-gray-600 mt-1">Secteur : {editSectorName ?? NO_SECTOR_LABEL}. Le secteur appartient au poste : pour le changer, utilisez « Déplacer… » dans « {MANAGE_SECTORS_POSTES_LABEL} ».</p>
          )}
          <datalist id={listId}>
            {suggestions.map(r => <option key={r} value={r} />)}
          </datalist>
        </div>
        <div>
          <label htmlFor={`label-${sfx}`} className="block text-xs font-medium text-gray-600 mb-1">Libellé</label>
          <input
            id={`label-${sfx}`}
            type="text"
            value={form.label}
            onChange={e => setField("label", e.target.value)}
            placeholder={hintPoste ?? (form.roleName || "ex. Entrée principale")}
            className="input"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          {/* No asterisk on the read-only date of a one-day event: there is nothing to fill in. */}
          <label htmlFor={`date-${sfx}`} className="block text-xs font-medium text-gray-600 mb-1">Date{singleDay ? "" : <> <span aria-hidden="true">*</span></>}</label>
          {singleDay ? (
            <input id={`date-${sfx}`} type="text" readOnly value={fmtDate(dates[0])} className="input bg-gray-50 text-gray-700" />
          ) : (
            <select id={`date-${sfx}`} required {...dateField.invalidProps} value={form.date} onChange={e => setField("date", e.target.value)} className={`input ${dateField.border}`}>
              <option value="">— choisir —</option>
              {dates.map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
            </select>
          )}
          {dateField.message}
        </div>
        <div>
          <label htmlFor={`startTime-${sfx}`} className="block text-xs font-medium text-gray-600 mb-1">Début <span aria-hidden="true">*</span></label>
          <input
            id={`startTime-${sfx}`}
            type="text" placeholder="HH:MM" value={form.startTime}
            required {...startField.invalidProps}
            className={`input ${startField.border}`}
            onChange={e => setStart(e.target.value)}
            onBlur={e => setStart(normalizeTime(e.target.value))}
          />
          {startField.message}
        </div>
        <div>
          <label htmlFor={`endTime-${sfx}`} className="block text-xs font-medium text-gray-600 mb-1">Fin <span aria-hidden="true">*</span></label>
          <input
            id={`endTime-${sfx}`}
            type="text" placeholder="HH:MM" value={form.endTime}
            required {...endField.invalidProps}
            className={`input ${endField.border}`}
            onChange={e => setEnd(e.target.value)}
            onBlur={e => setEnd(normalizeTime(e.target.value))}
          />
          {endField.message}
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor={`capacity-${sfx}`} className="block text-xs font-medium text-gray-600 mb-1">Places <span aria-hidden="true">*</span></label>
          <input id={`capacity-${sfx}`} type="number" min="1" required {...capacityField.invalidProps} {...(minimumInvalid && !capacityField.invalidProps["aria-describedby"] ? { "aria-describedby": `minVolunteers-error-${sfx}` } : {})} value={form.capacity} onChange={e => setField("capacity", e.target.value)} className={`input ${capacityField.border}`} />
          {capacityField.message}
        </div>
        <div>
          <label htmlFor={`minVolunteers-${sfx}`} className="block text-xs font-medium text-gray-600 mb-1">Minimum (optionnel)</label>
          <input
            id={`minVolunteers-${sfx}`}
            type="number" min="1" max={Number(form.capacity) || undefined} inputMode="numeric" placeholder="ex. 2"
            value={form.minVolunteers}
            onChange={e => setField("minVolunteers", e.target.value)}
            aria-invalid={minimumInvalid || undefined}
            aria-describedby={minimumInvalid ? `minVolunteers-error-${sfx} minVolunteers-hint-${sfx}` : `minVolunteers-hint-${sfx}`}
            className={`input ${minimumInvalid ? "!border-red-600" : ""}`}
          />
          {minimumInvalid && <p id={`minVolunteers-error-${sfx}`} className="text-xs text-red-700 mt-1">{minimumProblem}</p>}
          <p id={`minVolunteers-hint-${sfx}`} className="text-xs text-gray-600 mt-1">Sous ce nombre de personnes, le créneau ne peut pas tourner. Vide : toutes les places.</p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor={`description-${sfx}`} className="block text-xs font-medium text-gray-600 mb-1">Description</label>
          <input id={`description-${sfx}`} type="text" value={form.description} onChange={e => setField("description", e.target.value)} className="input" />
        </div>
      </div>
      <fieldset aria-describedby={`shiftinfo-hint-${sfx}`} className="border border-gray-200 rounded-xl p-3 space-y-3">
        <legend className="text-xs font-semibold text-gray-700 px-1">Infos pratiques pour les bénévoles</legend>
        <p id={`shiftinfo-hint-${sfx}`} className="text-xs text-gray-600">Lieu et consigne sont visibles sur la page d&apos;inscription. La personne de contact et son téléphone ne sont envoyés qu&apos;aux inscrits : email de confirmation, rappels, page « Mes inscriptions ».</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor={`locationDetails-${sfx}`} className="block text-xs font-medium text-gray-600 mb-1">Lieu de rendez-vous</label>
            <input id={`locationDetails-${sfx}`} type="text" value={form.locationDetails} onChange={e => setField("locationDetails", e.target.value)} placeholder="ex. Entrée B, côté parking" className="input" />
          </div>
          <div className="sm:col-span-3">
            <CoordinatesField
              id={`coordinates-${sfx}`}
              small
              value={{ latitude: form.latitude, longitude: form.longitude }}
              onChange={(c) => setForm((f) => ({ ...f, latitude: c?.latitude ?? null, longitude: c?.longitude ?? null }))}
              hint="Vide : le lieu de l'événement est utilisé pour le lien « Voir sur la carte »."
            />
          </div>
          <div>
            <label htmlFor={`contactName-${sfx}`} className="block text-xs font-medium text-gray-600 mb-1">Personne de contact</label>
            <input id={`contactName-${sfx}`} type="text" maxLength={SHIFT_CONTACT_NAME_MAX} value={form.contactName} onChange={e => setField("contactName", e.target.value)} placeholder="ex. Léa (responsable bar)" className="input" />
          </div>
          <div>
            <label htmlFor={`contactPhone-${sfx}`} className="block text-xs font-medium text-gray-600 mb-1">Téléphone du contact</label>
            <input id={`contactPhone-${sfx}`} type="tel" maxLength={SHIFT_CONTACT_PHONE_MAX} value={form.contactPhone} onChange={e => setField("contactPhone", e.target.value)} placeholder="ex. 079 000 00 00" className="input" />
          </div>
        </div>
        <div>
          <label htmlFor={`instructions-${sfx}`} className="block text-xs font-medium text-gray-600 mb-1">Consigne pratique</label>
          <textarea id={`instructions-${sfx}`} rows={2} maxLength={SHIFT_INSTRUCTIONS_MAX} aria-describedby={`instructions-hint-${sfx}`} value={form.instructions} onChange={e => setField("instructions", e.target.value)} placeholder="ex. Venir 10 min avant, tenue noire, gilet fourni sur place." className="input" />
          <p id={`instructions-hint-${sfx}`} className="text-xs text-gray-600 mt-1">{form.instructions.length}/{SHIFT_INSTRUCTIONS_MAX} caractères</p>
        </div>
      </fieldset>
      {places && (
        <div>
          <label htmlFor={`placeId-${sfx}`} className="block text-xs font-medium text-gray-600 mb-1">Lieu de la mission</label>
          <select
            id={`placeId-${sfx}`}
            value={form.placeId}
            onChange={e => setField("placeId", e.target.value)}
            aria-describedby={`placeId-hint-${sfx}`}
            className="input"
          >
            <option value="">{NO_PLACE_LABEL}</option>
            {selectablePlaces(places, form.placeId || null).map((p) => (
              <option key={p.id} value={p.id}>{p.archivedAt ? `${p.name} (archivé)` : p.name}</option>
            ))}
          </select>
          <p id={`placeId-hint-${sfx}`} className="text-xs text-gray-600 mt-1">
            Pour la marge de trajet de la protection des pauses et de la charge. Les bénévoles lisent toujours le champ « Lieu de rendez-vous ».
            {places.filter((p) => !p.archivedAt).length === 0 && " Créez les lieux dans « Lieux des missions », sur cette page."}
          </p>
        </div>
      )}
      <div>
        <label htmlFor={`internalNotes-${sfx}`} className="block text-xs font-medium text-gray-600 mb-1">Notes internes (jamais montrées aux bénévoles)</label>
        <input id={`internalNotes-${sfx}`} type="text" value={form.internalNotes} onChange={e => setField("internalNotes", e.target.value)} className="input" />
      </div>
      <div>
        <label htmlFor={`minAge-${sfx}`} className="block text-xs font-medium text-gray-600 mb-1">Âge minimum (optionnel)</label>
        <input
          id={`minAge-${sfx}`}
          type="number" min="0" max="120" placeholder="ex. 18"
          value={form.minAge}
          onChange={e => setField("minAge", e.target.value === "" ? "" : Number(e.target.value))}
          aria-describedby={`minAge-hint-${sfx}`}
          className="input"
        />
        <p id={`minAge-hint-${sfx}`} className="text-[11px] text-gray-500 mt-1">
          Affiché en info sur le créneau public ; vérifié à l&apos;inscription (date de naissance demandée si besoin).
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`waitlistEnabled-${sfx}`}
          checked={Boolean(form.waitlistEnabled)}
          onChange={e => setField("waitlistEnabled", e.target.checked)}
          className="h-4 w-4 rounded border-gray-500 text-blue-600 focus:ring-2 focus:ring-blue-500"
        />
        <label htmlFor={`waitlistEnabled-${sfx}`} className="text-xs font-medium text-gray-600 select-none cursor-pointer">
          Activer la liste d'attente (si complet, les bénévoles peuvent s'y inscrire)
        </label>
      </div>
      <div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`requiresApproval-${sfx}`}
            checked={Boolean(form.requiresApproval)}
            onChange={e => setField("requiresApproval", e.target.checked)}
            aria-describedby={`requiresApproval-hint-${sfx}`}
            className="h-4 w-4 rounded border-gray-500 text-blue-600 focus:ring-2 focus:ring-blue-500"
          />
          <label htmlFor={`requiresApproval-${sfx}`} className="text-xs font-medium text-gray-600 select-none cursor-pointer">
            Sur validation (chaque inscription est une demande à accepter ou refuser)
          </label>
        </div>
        <p id={`requiresApproval-hint-${sfx}`} className="text-xs text-gray-600 mt-1 ml-6">
          Pour un poste sensible (conduite, caisse, sécurité). Une demande garde sa place jusqu&apos;à votre décision ; les inscriptions déjà confirmées ne changent pas.
        </p>
      </div>
      {mealOnTheGoShown && (
        <div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`mealOnTheGo-${sfx}`}
              checked={Boolean(form.mealOnTheGo)}
              onChange={e => setField("mealOnTheGo", e.target.checked)}
              aria-describedby={`mealOnTheGo-hint-${sfx}`}
              className="h-4 w-4 rounded border-gray-500 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <label htmlFor={`mealOnTheGo-${sfx}`} className="text-xs font-medium text-gray-600 select-none cursor-pointer">
              Repas sur le pouce possible
            </label>
          </div>
          <p id={`mealOnTheGo-hint-${sfx}`} className="text-xs text-gray-600 mt-1 ml-6">
            Le repas peut se prendre pendant cette mission. Pour la pause repas de l&apos;événement, elle ne compte pas comme du temps pris ; elle reste comptée comme du travail.
          </p>
        </div>
      )}

      {/* The server's error: focus stays on the submit button, so it is an alert. It is rendered only
          when set, so the same error after a new attempt is announced again. */}
      {error && <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}
      {/* Visible reminder, not live: each field already says its error when focus reaches it. */}
      {missing.length > 0 && (
        <p className="text-xs text-red-700">{missingFieldsSummary(missing)}</p>
      )}
      {minimumInvalid && <p className="text-xs text-red-700">À corriger : le minimum.</p>}
      {mismatchInvalid && <p className="text-xs text-red-700">À corriger : le secteur du poste.</p>}

      <div className="flex gap-3">
        <button type="button" onClick={handleSave} aria-disabled={saving || undefined}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 aria-disabled:opacity-50">
          {saving ? (editingId ? "Enregistrement en cours…" : "Ajout en cours…") : editingId ? "Enregistrer" : "Ajouter"}
        </button>
        <button type="button" onClick={onCancel}
          className="text-gray-500 px-3 py-2 text-sm hover:text-gray-800">
          Annuler
        </button>
      </div>
    </div>
  )
}
