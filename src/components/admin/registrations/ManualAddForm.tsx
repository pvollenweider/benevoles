"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useMemo, useState, type Dispatch, type SetStateAction } from "react"
import ShiftSelect from "./ShiftSelect"
import { workloadMessage, workloadWarnings } from "@/lib/workload"
import { availabilityLabel, hasAvailability } from "@/lib/availability"
import { addConflictMessage, shiftsOfEmail, type ShiftRef } from "@/lib/registrations-list"
import type { AddFormValues, Registration } from "./types"

type Props = {
  eventId: string
  shifts: ShiftRef[]
  /** The registrations on the list, for the conflict, availability and workload hints. */
  registrations: Registration[]
  /** Organisation time zone, for the workload warnings (#465). */
  timeZone: string
  /** The values typed so far: kept by the parent so they survive closing and reopening the form. */
  form: AddFormValues
  onFormChange: Dispatch<SetStateAction<AddFormValues>>
  /** The registration the server created. */
  onAdded: (reg: Registration) => void
  onCancel: () => void
}

// ── Manual registration by the organizer ─────────────────────────────────────
export default function ManualAddForm({ eventId, shifts, registrations, timeZone, form: addForm, onFormChange: setAddForm, onAdded, onCancel }: Props) {
  // The request the role-limit warning is about: the override only applies to that exact form.
  const [overLimitFor, setOverLimitFor] = useState<string | null>(null)
  // Manual addition: what this shift would add to the workload of a volunteer already registered.
  const addWarnings = useMemo(() => {
    const email = addForm.email.trim().toLowerCase()
    const shift = shifts.find((s) => s.id === addForm.shiftId)
    if (!email || !shift) return []
    const held = registrations.filter((r) => r.status === "active" && r.volunteer.email?.toLowerCase() === email && r.shift.id !== shift.id)
    if (held.length === 0) return []
    const before = new Set(workloadWarnings(held.map((r) => r.shift), timeZone).map(workloadMessage))
    return workloadWarnings([...held.map((r) => r.shift), shift], timeZone).map(workloadMessage).filter((m) => !before.has(m))
  }, [addForm.email, addForm.shiftId, shifts, registrations, timeZone])
  const overLimit = overLimitFor === JSON.stringify(addForm)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Shifts already held by the volunteer identified by the email in the add form
  const volunteerShifts = useMemo<ShiftRef[] | undefined>(
    () => shiftsOfEmail(registrations, addForm.email),
    [addForm.email, registrations]
  )

  // Availability of the person being added by hand, when their email matches someone already on
  // the event (#402): the organizer sees it before picking the shift.
  const knownVolunteer = useMemo(() => {
    const email = addForm.email.trim().toLowerCase()
    return email ? registrations.find((r) => r.volunteer.email?.toLowerCase() === email)?.volunteer : undefined
  }, [addForm.email, registrations])

  const selectedShiftObj = useMemo(
    () => (addForm.shiftId ? shifts.find(s => s.id === addForm.shiftId) ?? null : null),
    [addForm.shiftId, shifts]
  )

  const conflictMessage = useMemo(
    () => addConflictMessage(selectedShiftObj, volunteerShifts),
    [selectedShiftObj, volunteerShifts]
  )

  async function handleAdd(e: React.FormEvent | null, allowOverLimit = false) {
    e?.preventDefault()
    if (adding) return
    if (!addForm.shiftId) { setAddError("Sélectionnez un créneau."); return }
    setAdding(true)
    // Forcing past the role limit: the alert and its button stay until the answer, so focus stays put.
    if (!allowOverLimit) { setAddError(null); setOverLimitFor(null) }

    const res = await fetch("/api/admin/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, ...addForm, ...(allowOverLimit ? { allowOverLimit: true } : {}) }),
    })

    const data = await res.json()
    setAdding(false)

    // The role's limit per person (#466): the organiser may go over it, after reading why.
    if (res.status === 409 && data.code === "role_limit") { setAddError(data.error); setOverLimitFor(JSON.stringify(addForm)); return }
    setOverLimitFor(null)
    if (!res.ok) { setAddError(data.error ?? "Erreur."); return }
    setAddError(null)

    const shiftRef = shifts.find(s => s.id === addForm.shiftId)
    const newReg: Registration = {
      id: data.id,
      status: data.status,
      source: data.source,
      comment: data.comment,
      createdAt: data.createdAt,
      waitingPosition: data.waitingPosition ?? null,
      volunteer: data.volunteer,
      // A registration just created client-side can't already be flagged as a sector leader —
      // that comes from a server-side join against SectorLeader the manual-add response doesn't
      // carry, and "just registered" is never simultaneously "registered a while ago and later
      // made a leader" (see registrations/page.tsx's initial computation of this field).
      isLeader: false,
      shift: {
        id: data.shift.id,
        roleName: data.shift.roleName,
        label: data.shift.label,
        date: data.shift.date.split("T")[0],
        startTime: data.shift.startTime,
        endTime: data.shift.endTime,
        capacity: shiftRef?.capacity ?? data.shift.capacity ?? 0,
        registrationCount: (shiftRef?.registrationCount ?? 0) + 1,
      },
    }
    onAdded(newReg)
  }

  return (
    <form onSubmit={handleAdd} className="bg-white rounded-2xl border border-blue-200 p-5 space-y-4">
      <h3 className="font-semibold text-gray-800">Inscription manuelle</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="add-firstname" className="block text-xs font-medium text-gray-600 mb-1">Prénom *</label>
          <input id="add-firstname" type="text" required value={addForm.firstName} onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))} className="input" />
        </div>
        <div>
          <label htmlFor="add-lastname" className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
          <input id="add-lastname" type="text" required value={addForm.lastName} onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))} className="input" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="add-email" className="block text-xs font-medium text-gray-600 mb-1">Email</label>
          <input id="add-email" type="email" value={addForm.email} aria-describedby={knownVolunteer && hasAvailability(knownVolunteer) ? "add-email-availability" : undefined} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} className="input" />
          {/* Always mounted, so the polite region announces the text when it appears. */}
          <p id="add-email-availability" aria-live="polite" className={knownVolunteer && hasAvailability(knownVolunteer) ? "text-xs text-gray-700 mt-1" : "sr-only"}>
            {knownVolunteer && hasAvailability(knownVolunteer) ? `Disponible en général : ${availabilityLabel(knownVolunteer)}` : ""}
          </p>
        </div>
        <div>
          <label htmlFor="add-phone" className="block text-xs font-medium text-gray-600 mb-1">Téléphone</label>
          <input id="add-phone" type="tel" value={addForm.phone} onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} className="input" />
        </div>
      </div>
      <div>
        <p id="add-shift-label" className="block text-xs font-medium text-gray-600 mb-1">Créneau *</p>
        <ShiftSelect
          labelledBy="add-shift-label"
          shifts={shifts}
          value={addForm.shiftId}
          onChange={(id) => setAddForm((f) => ({ ...f, shiftId: id }))}
          placeholder="Sélectionner un créneau…"
          existingShifts={volunteerShifts}
        />
        {conflictMessage && (
          <p className="text-xs text-orange-800 mt-1 ml-0.5">{conflictMessage}</p>
        )}
      </div>
      <div>
        <label htmlFor="add-comment" className="block text-xs font-medium text-gray-600 mb-1">Note</label>
        <input id="add-comment" type="text" value={addForm.comment} onChange={(e) => setAddForm((f) => ({ ...f, comment: e.target.value }))} className="input" placeholder="ex. Inscrit par téléphone" />
      </div>

      {/* Always mounted, so the warning is announced when the email and shift make it appear. */}
      <div id="add-workload" role="status" className={addWarnings.length > 0 ? "" : "sr-only"}>
        {addWarnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-sm text-amber-950">
            <p className="font-medium">Si vous ajoutez ce créneau, cette personne aura :</p>
            <ul role="list" className="mt-1 space-y-0.5">{addWarnings.map((m) => <li key={m}>{m}</li>)}</ul>
            <p className="mt-1">L&apos;ajout reste possible.</p>
          </div>
        )}
      </div>
      {addError && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
          <p id="add-error">{addError}</p>
          {overLimitFor !== null && !overLimit && <p className="mt-1">Le formulaire a changé : validez à nouveau.</p>}
          {overLimit && (
            <button type="button" onClick={() => { if (!adding) handleAdd(null, true) }} aria-disabled={adding || undefined} aria-describedby="add-error" className={`mt-2 text-sm font-medium text-red-800 underline underline-offset-2 hover:text-red-950 ${adding ? "opacity-60 cursor-wait" : ""}`}>
              {adding ? "Ajout en cours…" : "Ajouter quand même"}
            </button>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <button type="submit" aria-disabled={adding || undefined} aria-describedby={addWarnings.length > 0 ? "add-workload" : undefined} className={`bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 ${adding ? "opacity-60 cursor-wait" : ""}`}>
          {adding ? "…" : "Ajouter"}
        </button>
        <button type="button" onClick={onCancel} className="text-gray-500 px-3 py-2 text-sm hover:text-gray-800">Annuler</button>
      </div>
    </form>
  )
}
