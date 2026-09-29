"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import Link from "next/link"
import { useState, useMemo, useRef } from "react"
import StatusBadge from "./StatusBadge"
import ShiftSelect from "./registrations/ShiftSelect"
import MakeLeaderModal from "./registrations/MakeLeaderModal"
import { contactPhone } from "@/lib/contact-phone"
import {
  addConflictMessage,
  cancelAnnouncement,
  filterRegistrations,
  fmtHour,
  fmtShortDate,
  leaderAnnouncement as leaderAddedAnnouncement,
  leaderRoleOptions,
  resendAnnouncement,
  shiftsOfEmail,
  type ShiftRef,
} from "@/lib/registrations-list"

type Volunteer = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null }
type Registration = {
  id: string; status: string; source: string; comment: string | null
  // Phone given on the public form for this registration; shown before the profile's.
  phone?: string | null
  createdAt: string; waitingPosition: number | null; volunteer: Volunteer; shift: ShiftRef
  // True when this volunteer is already the (or a) sector leader of this shift's own role —
  // computed server-side from SectorLeader (role + email), see registrations/page.tsx.
  isLeader: boolean
  /** Lightweight check-in (#399): when the organizer marked this person present. */
  checkedInAt?: string | null
}

type Props = {
  eventId: string
  initialRegistrations: Registration[]
  shifts: ShiftRef[]
  initialShiftFilter?: string
  /** `?q=` from the global search (#377). */
  initialSearch?: string
}

const sourceLabels: Record<string, string> = {
  public_form: "Formulaire",
  admin_manual: "Manuel",
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RegistrationsManager({ eventId, initialRegistrations, shifts, initialShiftFilter, initialSearch }: Props) {
  const [registrations, setRegistrations] = useState<Registration[]>(initialRegistrations)
  const [search, setSearch] = useState(initialSearch ?? "")
  const initialShift = initialShiftFilter ? shifts.find(s => s.id === initialShiftFilter) ?? null : null
  const [roleFilter, setRoleFilter] = useState(initialShift?.roleName ?? "")
  const [shiftFilter, setShiftFilter] = useState(initialShiftFilter ?? "")
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ firstName: "", lastName: "", email: "", phone: "", shiftId: "", comment: "" })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [leaderTarget, setLeaderTarget] = useState<{
    volunteerId: string; volunteerName: string; volunteerEmail: string | null; roleOptions: string[]; defaultRole: string
  } | null>(null)
  const [leaderAnnouncement, setLeaderAnnouncement] = useState("")
  const [bulkError, setBulkError] = useState<string | null>(null)
  // After a bulk action the toolbar unmounts with the selection: focus lands here instead of body.
  const afterBulkRef = useRef<HTMLParagraphElement>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const uniqueRoles = [...new Set(shifts.map(s => s.roleName))]
  const visibleShifts = roleFilter ? shifts.filter(s => s.roleName === roleFilter) : shifts

  // Shifts already held by the volunteer identified by the email in the add form
  const volunteerShifts = useMemo<ShiftRef[] | undefined>(
    () => shiftsOfEmail(registrations, addForm.email),
    [addForm.email, registrations]
  )

  const selectedShiftObj = useMemo(
    () => (addForm.shiftId ? shifts.find(s => s.id === addForm.shiftId) ?? null : null),
    [addForm.shiftId, shifts]
  )

  const conflictMessage = useMemo(
    () => addConflictMessage(selectedShiftObj, volunteerShifts),
    [selectedShiftObj, volunteerShifts]
  )

  const filtered = filterRegistrations(registrations, { search, role: roleFilter, shiftId: shiftFilter })

  function openLeaderModal(reg: Registration) {
    const roleOptions = leaderRoleOptions(registrations, reg.volunteer.id)
    setLeaderTarget({
      volunteerId: reg.volunteer.id,
      volunteerName: `${reg.volunteer.firstName} ${reg.volunteer.lastName}`,
      volunteerEmail: reg.volunteer.email,
      roleOptions,
      defaultRole: reg.shift.roleName, // the row the admin clicked from — sensible default among several
    })
  }


  // ── Bulk actions on the current selection ───────────────────────────────────
  // Uses the full registrations list, not `filtered`: a row selected before a search/filter
  // change hides it must still be included in the bulk action, matching what the toolbar's own
  // "N sélectionnée(s)" count already promises.
  const selectedRegs = registrations.filter((r) => selectedIds.has(r.id))
  const selectedActiveRegs = selectedRegs.filter((r) => r.status === "active")

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const visibleIds = filtered.map((r) => r.id)
      const allSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id))
      if (allSelected) return new Set()
      return new Set(visibleIds)
    })
  }

  // One request for the whole selection (#292): ownership checked for every row up front on the
  // server, all or nothing. Returns null on a request-level failure.
  async function runBulk(action: "cancel" | "make_leader" | "resend_link" | "check_in" | "undo_check_in", ids: string[]) {
    const res = await fetch(`/api/admin/events/${eventId}/registrations/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, registrationIds: ids }),
    }).catch(() => null)
    if (!res?.ok) return null
    return res.json() as Promise<{ done: number; failed?: number; skipped?: number; alreadyLeader?: number; cancelledIds?: string[]; changedIds?: string[] }>
  }

  // Lightweight check-in (#399): mark the selected confirmed people present, or undo it.
  const selectedToCheckIn = selectedActiveRegs.filter((r) => !r.checkedInAt)
  const selectedToUndo = selectedActiveRegs.filter((r) => r.checkedInAt)
  const presentCount = registrations.filter((r) => r.status === "active" && r.checkedInAt).length
  const activeCount = registrations.filter((r) => r.status === "active").length

  async function handlePresence(present: boolean) {
    const targets = present ? selectedToCheckIn : selectedToUndo
    if (targets.length === 0) return
    setBulkBusy(true)
    const result = await runBulk(present ? "check_in" : "undo_check_in", targets.map((r) => r.id))
    setBulkBusy(false)
    if (!result) { setBulkError("Erreur : présence non enregistrée. Réessayez."); return }
    setBulkError(null)
    const changed = new Set(result.changedIds ?? [])
    const at = new Date().toISOString()
    setRegistrations((prev) => prev.map((r) => (changed.has(r.id) ? { ...r, checkedInAt: present ? at : null } : r)))
    setSelectedIds(new Set())
    // Cleared first so the same sentence twice in a row is announced again.
    setLeaderAnnouncement("")
    requestAnimationFrame(() => {
      setLeaderAnnouncement(present
        ? `${changed.size} personne${changed.size > 1 ? "s" : ""} marquée${changed.size > 1 ? "s" : ""} présente${changed.size > 1 ? "s" : ""}.`
        : `Présence annulée pour ${changed.size} personne${changed.size > 1 ? "s" : ""}.`)
      afterBulkRef.current?.focus()
    })
  }

  async function handleBulkCancel() {
    if (selectedActiveRegs.length === 0) return
    if (!confirm(`Retirer ${selectedActiveRegs.length} bénévole${selectedActiveRegs.length > 1 ? "s" : ""} de leur créneau ?`)) return
    setBulkBusy(true)
    const result = await runBulk("cancel", selectedActiveRegs.map((r) => r.id))
    const cancelledIds = new Set(result?.cancelledIds ?? [])
    setRegistrations((prev) => prev.filter((r) => !cancelledIds.has(r.id)))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      cancelledIds.forEach((id) => next.delete(id))
      return next
    })
    setBulkBusy(false)
    const failed = selectedActiveRegs.length - cancelledIds.size
    setLeaderAnnouncement(cancelAnnouncement(cancelledIds.size, failed))
  }

  async function handleBulkMakeLeader() {
    if (selectedRegs.length === 0) return
    const withEmail = selectedRegs.filter((r) => r.volunteer.email)
    const withoutEmail = selectedRegs.length - withEmail.length
    if (withEmail.length === 0) return
    if (!confirm(`Rendre ${withEmail.length} bénévole${withEmail.length > 1 ? "s" : ""} responsable de leur poste respectif ?${withoutEmail > 0 ? ` (${withoutEmail} ignoré${withoutEmail > 1 ? "s" : ""}, pas d'email)` : ""}`)) return
    setBulkBusy(true)
    const result = await runBulk("make_leader", withEmail.map((r) => r.id))
    setBulkBusy(false)
    // Already leader of that role counts as done from the admin's point of view.
    const succeeded = result ? result.done + (result.alreadyLeader ?? 0) : 0
    const failed = result ? 0 : withEmail.length
    setSelectedIds(new Set())
    setLeaderAnnouncement(leaderAddedAnnouncement(succeeded, failed, withoutEmail))
  }

  // A single selected row opens the modal (lets the admin pick among several roles if the
  // volunteer has more than one registration, and edit name/email before sending) — the same
  // experience the old per-row button gave. Several rows fall back to the bulk flow below, which
  // auto-assigns each person to their own row's shift role with no per-person confirmation step.
  function handleMakeResponsibleClick() {
    if (selectedRegs.length === 1) { openLeaderModal(selectedRegs[0]); return }
    handleBulkMakeLeader()
  }

  async function handleBulkResendLink() {
    const resendable = selectedRegs.filter((r) => r.status === "active" && r.volunteer.email)
    if (resendable.length === 0) return
    if (!confirm(`Renvoyer le lien de gestion à ${resendable.length} bénévole${resendable.length > 1 ? "s" : ""} ?`)) return
    setBulkBusy(true)
    const result = await runBulk("resend_link", resendable.map((r) => r.id))
    setBulkBusy(false)
    // One email per volunteer, even with several of their rows selected.
    const succeeded = result?.done ?? 0
    const failed = result ? (result.failed ?? 0) : resendable.length
    setSelectedIds(new Set())
    setLeaderAnnouncement(resendAnnouncement(succeeded, failed))
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.shiftId) { setAddError("Sélectionnez un créneau."); return }
    setAdding(true)
    setAddError(null)

    const res = await fetch("/api/admin/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, ...addForm }),
    })

    const data = await res.json()
    setAdding(false)

    if (!res.ok) { setAddError(data.error ?? "Erreur."); return }

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
    setRegistrations((prev) => [newReg, ...prev])
    setAddForm({ firstName: "", lastName: "", email: "", phone: "", shiftId: "", comment: "" })
    setShowAddForm(false)
  }

  return (
    <div className="space-y-4">
      <div role="status" aria-live="polite" className="sr-only">{leaderAnnouncement}</div>
      {bulkError && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{bulkError}</p>}
      <p ref={afterBulkRef} tabIndex={-1} className={`text-sm text-gray-700 focus:outline-none ${presentCount > 0 ? "" : "sr-only"}`}>
        {presentCount > 0
          ? <><span className="font-medium text-green-800">{presentCount} présent{presentCount > 1 ? "s" : ""}</span> sur {activeCount} inscrit{activeCount > 1 ? "s" : ""}.</>
          : `${activeCount} inscrit${activeCount > 1 ? "s" : ""}, personne encore marqué présent.`}
      </p>

      <div className="flex gap-3 flex-wrap">
        <label htmlFor="reg-search" className="sr-only">Rechercher un bénévole</label>
        <input
          id="reg-search"
          type="text"
          placeholder="Rechercher (nom, email…)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <label htmlFor="role-filter" className="sr-only">Filtrer par poste</label>
        <select
          id="role-filter"
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value)
            if (shiftFilter) {
              const s = shifts.find(x => x.id === shiftFilter)
              if (s && e.target.value && s.roleName !== e.target.value) setShiftFilter("")
            }
          }}
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tous les postes</option>
          {uniqueRoles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <div className="min-w-64">
          <ShiftSelect
            shifts={visibleShifts}
            value={shiftFilter}
            onChange={setShiftFilter}
            placeholder="Tous les créneaux"
            nullable
          />
        </div>
        <Link
          href={`/admin/events/${eventId}/message${shiftFilter ? `?shift=${encodeURIComponent(shiftFilter)}` : roleFilter ? `?role=${encodeURIComponent(roleFilter)}` : ""}`}
          className="border border-gray-300 text-gray-800 px-4 py-2 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          {shiftFilter ? "Écrire à ce créneau" : roleFilter ? "Écrire à ce poste" : "Écrire aux bénévoles"}
        </Link>
        <button
          onClick={() => { setShowAddForm(true); setAddError(null); setAddForm((f) => ({ ...f, shiftId: shiftFilter || f.shiftId })) }}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Ajouter manuellement
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAdd} className="bg-white rounded-2xl border border-blue-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">Inscription manuelle</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Prénom *</label>
              <input type="text" required value={addForm.firstName} onChange={(e) => setAddForm((f) => ({ ...f, firstName: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
              <input type="text" required value={addForm.lastName} onChange={(e) => setAddForm((f) => ({ ...f, lastName: e.target.value }))} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={addForm.email} onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))} className="input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone</label>
              <input type="tel" value={addForm.phone} onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} className="input" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Créneau *</label>
            <ShiftSelect
              shifts={shifts}
              value={addForm.shiftId}
              onChange={(id) => setAddForm((f) => ({ ...f, shiftId: id }))}
              placeholder="Sélectionner un créneau…"
              existingShifts={volunteerShifts}
            />
            {conflictMessage && (
              <p className="text-[10px] text-orange-600 mt-1 ml-0.5">{conflictMessage}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Note</label>
            <input type="text" value={addForm.comment} onChange={(e) => setAddForm((f) => ({ ...f, comment: e.target.value }))} className="input" placeholder="ex. Inscrit par téléphone" />
          </div>

          {addError && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{addError}</div>}

          <div className="flex gap-3">
            <button type="submit" disabled={adding} className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {adding ? "…" : "Ajouter"}
            </button>
            <button type="button" onClick={() => setShowAddForm(false)} className="text-gray-500 px-3 py-2 text-sm hover:text-gray-800">Annuler</button>
          </div>
        </form>
      )}

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex-wrap">
          <span className="text-sm text-blue-900 font-medium">
            {selectedIds.size} sélectionnée{selectedIds.size > 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={() => { if (!bulkBusy && selectedToCheckIn.length > 0) handlePresence(true) }}
            aria-disabled={bulkBusy || selectedToCheckIn.length === 0}
            className={`text-xs text-green-800 border border-green-300 bg-white px-3 py-1.5 rounded-full hover:bg-green-50 transition-colors ${bulkBusy || selectedToCheckIn.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {`Marquer présent${selectedToCheckIn.length > 1 ? "s" : ""} (${selectedToCheckIn.length})`}
          </button>
          {selectedToUndo.length > 0 && (
            <button
              type="button"
              onClick={() => handlePresence(false)}
              disabled={bulkBusy}
              className="text-xs text-gray-700 border border-gray-300 bg-white px-3 py-1.5 rounded-full hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {`Annuler la présence (${selectedToUndo.length})`}
            </button>
          )}
          <button
            type="button"
            onClick={handleMakeResponsibleClick}
            disabled={bulkBusy || selectedRegs.every((r) => !r.volunteer.email)}
            className="text-xs text-blue-700 border border-blue-300 bg-white px-3 py-1.5 rounded-full hover:bg-blue-50 disabled:opacity-50 transition-colors"
          >
            Rendre responsable
          </button>
          <button
            type="button"
            onClick={handleBulkResendLink}
            disabled={bulkBusy || selectedActiveRegs.every((r) => !r.volunteer.email)}
            className="text-xs text-blue-700 border border-blue-300 bg-white px-3 py-1.5 rounded-full hover:bg-blue-50 disabled:opacity-50 transition-colors"
          >
            {bulkBusy ? "…" : "Renvoyer le lien"}
          </button>
          <button
            type="button"
            onClick={handleBulkCancel}
            disabled={bulkBusy || selectedActiveRegs.length === 0}
            className="text-xs text-red-600 border border-red-300 bg-white px-3 py-1.5 rounded-full hover:bg-red-50 disabled:opacity-50 transition-colors"
          >
            {bulkBusy ? "…" : `Retirer de leur créneau (${selectedActiveRegs.length})`}
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-blue-600 hover:text-blue-800 ml-auto"
          >
            Désélectionner
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p>{registrations.length === 0 ? "Aucune inscription." : "Aucun résultat."}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th scope="col" className="px-4 py-2.5 w-8">
                  <label className="sr-only" htmlFor="reg-select-all">Sélectionner toutes les inscriptions visibles</label>
                  <input
                    id="reg-select-all"
                    type="checkbox"
                    checked={filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id))}
                    ref={(el) => {
                      if (el) el.indeterminate = selectedIds.size > 0 && !filtered.every((r) => selectedIds.has(r.id))
                    }}
                    onChange={toggleSelectAllVisible}
                    className="rounded border-gray-300"
                  />
                </th>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Bénévole</th>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 hidden sm:table-cell">Créneau</th>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 hidden md:table-cell">Source</th>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 hidden md:table-cell">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((reg) => (
                <tr key={reg.id} className={`hover:bg-gray-50 ${selectedIds.has(reg.id) ? "bg-blue-50/60" : ""}`}>
                  <td className="px-4 py-3">
                    <label className="sr-only" htmlFor={`reg-select-${reg.id}`}>
                      Sélectionner l&apos;inscription de {reg.volunteer.firstName} {reg.volunteer.lastName}
                    </label>
                    <input
                      id={`reg-select-${reg.id}`}
                      type="checkbox"
                      checked={selectedIds.has(reg.id)}
                      onChange={() => toggleSelected(reg.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 flex items-center gap-1.5">
                      {reg.volunteer.firstName} {reg.volunteer.lastName}
                      {reg.isLeader && (
                        <span
                          className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                          title={`Responsable de ${reg.shift.roleName}`}
                        >
                          Responsable
                        </span>
                      )}
                      {reg.checkedInAt && reg.status === "active" && (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-1.5 py-0.5 text-xs font-semibold text-green-800">
                          <span aria-hidden="true">✓ </span>Présent<span className="sr-only"> depuis {new Date(reg.checkedInAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">{reg.volunteer.email}</p>
                    {contactPhone(reg) && <p className="text-xs text-gray-500">{contactPhone(reg)}</p>}
                    {reg.comment && <p className="text-xs text-gray-500 italic mt-0.5">"{reg.comment}"</p>}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <p className="text-gray-700">
                      {reg.shift.label !== reg.shift.roleName
                        ? <>{reg.shift.roleName} <span className="text-gray-500 font-normal">·</span> {reg.shift.label}</>
                        : reg.shift.label}
                    </p>
                    <p className="text-xs text-gray-500">{fmtShortDate(reg.shift.date)} · {fmtHour(reg.shift.startTime)}–{fmtHour(reg.shift.endTime)}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-gray-500">{sourceLabels[reg.source] ?? reg.source}</span>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {reg.status !== "active" && <StatusBadge status={reg.status} />}
                    {reg.status === "waiting" && reg.waitingPosition != null && (
                      <span className="ml-1 text-xs text-gray-500">#{reg.waitingPosition}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {leaderTarget && (
        <MakeLeaderModal
          eventId={eventId}
          volunteerName={leaderTarget.volunteerName}
          volunteerEmail={leaderTarget.volunteerEmail}
          roleOptions={leaderTarget.roleOptions}
          defaultRole={leaderTarget.defaultRole}
          onClose={() => setLeaderTarget(null)}
          onDone={(roleName) => {
            setLeaderAnnouncement(`${leaderTarget.volunteerName} ajouté·e comme responsable de « ${roleName} », invitation envoyée par email.`)
            setLeaderTarget(null)
          }}
        />
      )}
    </div>
  )
}
