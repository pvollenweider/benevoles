"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useState, useRef } from "react"
import CoordinatesField from "@/components/admin/CoordinatesField"
import { announce } from "@/lib/announce"
import { deleteRoleRecap, deleteShiftRecap, shiftWhen, type ActionRecap } from "@/lib/action-recap"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { requestJson } from "@/lib/use-submit"
import { flushSync } from "react-dom"
import { KNOWN_ROLES, COLOR_OPTIONS, getRoleAccent } from "@/lib/roles"
import { fmtRange, resolveNewShiftDisplayOrder, isCompleteTime, addMinutes } from "@/lib/gantt-utils"
import AdminDayTimeline, { type AdminShift } from "./AdminDayTimeline"
import { roleLimits } from "@/lib/role-limit"
import { parseTagList, reservedRoles } from "@/lib/role-reservation"
import ShiftSeriesForm from "./ShiftSeriesForm"
import { SHIFT_CONTACT_NAME_MAX, SHIFT_CONTACT_PHONE_MAX, SHIFT_INSTRUCTIONS_MAX } from "@/lib/shift-info"
import {
  activeShiftsByDay,
  applyRoleOrder,
  eventDates,
  fmtLongDate as fmtDate,
  moveItem,
  normalizeTime,
  renameRole,
  roleOrder,
  sortShifts,
} from "@/lib/shifts-admin"

const UNPUBLISHED_NOTICE = "C'était le dernier créneau : l'événement est repassé en brouillon, sa page publique n'est plus accessible."

const emptyShift = {
  roleName: "", label: "", description: "", date: "", startTime: "", endTime: "",
  capacity: 2, locationDetails: "", latitude: null as number | null, longitude: null as number | null, displayOrder: 0, internalNotes: "", waitlistEnabled: false, requiresApproval: false,
  minAge: "" as number | string,
  contactName: "", contactPhone: "", instructions: "",
}

// ── Helper: convert Prisma shift to AdminShift ────────────────────────────────
type RawShift = AdminShift & {
  description?: string | null; internalNotes?: string | null; locationDetails?: string | null
  contactName?: string | null; contactPhone?: string | null; instructions?: string | null
  latitude?: number | null; longitude?: number | null
  /** Shifts per volunteer for the role (#466), shared by the role's shifts. */
  maxPerVolunteer?: number | null
  /** Tags reserving the role (#470), shared by the role's shifts. */
  reservedTags?: string[]
}
type Show = { name: string; date: string; startTime: string; endTime: string }

export default function ShiftsManager({
  eventId, eventStartDate, eventEndDate, initialShifts, showSchedule = [],
}: {
  eventId:        string
  eventStartDate: string
  eventEndDate:   string
  initialShifts:  RawShift[]
  showSchedule?:  Show[]
}) {
  const formRef   = useRef<HTMLDivElement>(null)
  const dates     = eventDates(eventStartDate, eventEndDate)
  const singleDay = dates.length === 1

  const [shifts, setShifts] = useState<RawShift[]>(initialShifts)
  const [showForm, setShowForm] = useState(false)
  const [showSeries, setShowSeries] = useState(false)
  const seriesButtonRef = useRef<HTMLButtonElement>(null)
  const seriesPanelId = useId()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyShift)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [attempted, setAttempted]   = useState(false)
  const [view, setView]             = useState<"timeline" | "list">("timeline")
  const [showReorder, setShowReorder]     = useState(false)
  const [reorderRoles, setReorderRoles]   = useState<string[]>([])
  const [dragRoleIdx, setDragRoleIdx]     = useState<number | null>(null)
  const [savingOrder, setSavingOrder]     = useState(false)
  const [renamingRole, setRenamingRole]   = useState<string | null>(null)
  const [renameValue, setRenameValue]     = useState("")
  const [roleActionError, setRoleActionError] = useState<string | null>(null)
  const [roleActionBusy, setRoleActionBusy]   = useState<string | null>(null)
  const [roleAnnouncement, setRoleAnnouncement] = useState("")
  const [colorPickerRole, setColorPickerRole] = useState<string | null>(null)
  const [limitRole, setLimitRole] = useState<string | null>(null)
  const [limitValue, setLimitValue] = useState("")
  const [limitError, setLimitError] = useState<string | null>(null)
  // Reserved roles (#470): the inline editor, like the limit's.
  const [reserveRole, setReserveRole] = useState<string | null>(null)
  const [reserveValue, setReserveValue] = useState("")
  const reserveBtnRefs = useRef(new Map<string, HTMLButtonElement>())
  // « Limite » buttons per role: focus returns there when the inline form closes (#466).
  const limitBtnRefs = useRef(new Map<string, HTMLButtonElement>())
  const limitInputRef = useRef<HTMLInputElement>(null)
  // A deletion waits for its confirmation (#379): the recap of what it does, then run.
  const [pendingDelete, setPendingDelete] = useState<{ recap: ActionRecap; run: () => Promise<void> } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // The row whose « Supprimer » opened the modal is gone once the deletion is done: park the focus on the outcome.
  const outcomeRef = useRef<HTMLDivElement>(null)

  function setField(k: string, v: string | number | boolean) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function openForm(patch: Partial<typeof emptyShift>, editId: string | null) {
    flushSync(() => {
      setShowSeries(false)
      setForm({ ...emptyShift, ...patch })
      setEditingId(editId)
      setShowForm(true)
      setError(null)
      setAttempted(false)
    })
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
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
      : resolveNewShiftDisplayOrder(shifts, form.roleName, form.displayOrder)
    const body   = editingId
      ? { ...form, label, capacity: Number(form.capacity), minAge, displayOrder }
      : { ...form, label, eventId, capacity: Number(form.capacity), minAge, displayOrder }

    const outcome = await requestJson<RawShift & { date?: string }>(() => fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), "Erreur lors de la sauvegarde.")
    setSaving(false)

    if (!outcome.ok) {
      setError(outcome.error)
      return
    }
    const data = outcome.data

    if (editingId) {
      setShifts(prev => prev.map(s =>
        s.id === editingId
          ? { ...s, ...data, date: data.date?.split("T")[0] ?? s.date, registrationCount: s.registrationCount }
          : s
      ))
    } else {
      setShifts(prev => [...prev, { ...data, date: data.date.split("T")[0], registrationCount: 0 }])
    }
    setForm(emptyShift)
    setShowForm(false)
    setEditingId(null)
  }

  // ── Series of shifts (#393) ───────────────────────────────────────────────
  function openSeries() {
    setShowForm(false)
    setEditingId(null)
    setShowSeries(true)
  }

  function closeSeries() {
    setShowSeries(false)
    seriesButtonRef.current?.focus()
  }

  function handleSeriesCreated(created: AdminShift[]) {
    setShifts(prev => [...prev, ...created.map(s => ({ ...s, description: s.description ?? null, internalNotes: s.internalNotes ?? null }))])
    announce(setRoleAnnouncement, `${created.length} créneau${created.length > 1 ? "x" : ""} créé${created.length > 1 ? "s" : ""}.`)
    closeSeries()
  }

  // ── Callbacks for AdminDayTimeline ────────────────────────────────────────
  function handleCreated(s: AdminShift) {
    setShifts(prev => {
      if (prev.find(x => x.id === s.id)) return prev
      return [...prev, { ...s, description: null, internalNotes: null, locationDetails: null, contactName: null, contactPhone: null, instructions: null }]
    })
  }

  function handleUpdated(s: AdminShift) {
    setShifts(prev => prev.map(x => x.id === s.id
      ? { ...x, ...s, date: (s as RawShift).date ?? x.date }
      : x
    ))
  }

  function handleDeleted(id: string) {
    setShifts(prev => prev.filter(s => s.id !== id))
  }

  function handleDeleteShift(id: string) {
    const shift = shifts.find((s) => s.id === id)
    if (!shift) return
    const name = shift.label && shift.label !== shift.roleName ? `${shift.roleName} · ${shift.label}` : shift.roleName
    setDeleteError(null)
    setPendingDelete({
      recap: deleteShiftRecap({ name, when: shiftWhen(shift.date, shift.startTime, shift.endTime), registered: shift.registrationCount }),
      run: () => runDeleteShift(id),
    })
  }

  async function runDeleteShift(id: string) {
    setDeleting(true)
    setDeleteError(null)
    const outcome = await requestJson<{ unpublished?: boolean }>(() => fetch(`/api/admin/shifts/${id}`, { method: "DELETE" }), "Erreur lors de la suppression.")
    setDeleting(false)
    if (!outcome.ok) { setDeleteError(outcome.error); return }
    flushSync(() => { setPendingDelete(null); handleDeleted(id) })
    announce(setRoleAnnouncement, outcome.data?.unpublished ? UNPUBLISHED_NOTICE : "Créneau supprimé.")
    outcomeRef.current?.focus()
  }

  // ── Role ordering ─────────────────────────────────────────────────────────
  const uniqueRoles = roleOrder(shifts)

  function openReorder() {
    setReorderRoles([...uniqueRoles])
    setShowReorder(true)
  }

  function handleRoleDragOver(e: React.DragEvent, toIdx: number) {
    e.preventDefault()
    if (dragRoleIdx === null || dragRoleIdx === toIdx) return
    setReorderRoles(prev => moveItem(prev, dragRoleIdx, toIdx))
    setDragRoleIdx(toIdx)
  }

  async function saveRoleOrder() {
    if (savingOrder) return
    setSavingOrder(true)
    setRoleActionError(null)
    const outcome = await requestJson(() => fetch(`/api/admin/events/${eventId}/reorder-roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleOrder: reorderRoles }),
    }), "L'ordre n'a pas pu être enregistré.")
    setSavingOrder(false)
    if (!outcome.ok) { setRoleActionError(outcome.error); return }
    setShifts(prev => applyRoleOrder(prev, reorderRoles))
    setShowReorder(false)
    announce(setRoleAnnouncement, "Ordre des postes enregistré.")
  }

  function startRenameRole(role: string) {
    setRoleActionError(null)
    setLimitRole(null)
    setReserveRole(null)
    setRenamingRole(role)
    setRenameValue(role)
  }

  async function submitRenameRole(oldName: string) {
    const newName = renameValue.trim()
    if (!newName || newName === oldName) { setRenamingRole(null); return }
    setRoleActionError(null)
    setRoleActionBusy(oldName)
    const outcome = await requestJson(() => fetch(`/api/admin/events/${eventId}/roles/${encodeURIComponent(oldName)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    }), "Erreur lors du renommage.")
    setRoleActionBusy(null)
    if (!outcome.ok) {
      setRoleActionError(outcome.error)
      return
    }
    setShifts(prev => renameRole(prev, oldName, newName))
    setReorderRoles(prev => prev.map(r => r === oldName ? newName : r))
    setRenamingRole(null)
    announce(setRoleAnnouncement, `Poste renommé « ${oldName} » → « ${newName} ».`)
  }

  function handleDeleteRole(role: string) {
    const own = shifts.filter((s) => s.roleName === role && s.status !== "cancelled")
    setDeleteError(null)
    setPendingDelete({
      recap: deleteRoleRecap({ role, shifts: own.length, registered: own.reduce((sum, s) => sum + s.registrationCount, 0) }),
      run: () => runDeleteRole(role),
    })
  }

  async function runDeleteRole(role: string) {
    setDeleting(true)
    setRoleActionError(null)
    setRoleActionBusy(role)
    const outcome = await requestJson<{ unpublished?: boolean }>(() => fetch(`/api/admin/events/${eventId}/roles/${encodeURIComponent(role)}`, { method: "DELETE" }), "Erreur lors de la suppression.")
    setRoleActionBusy(null)
    setDeleting(false)
    if (!outcome.ok) {
      setDeleteError(outcome.error)
      return
    }
    flushSync(() => {
      setPendingDelete(null)
      setShifts(prev => prev.filter(s => s.roleName !== role))
      setReorderRoles(prev => prev.filter(r => r !== role))
    })
    announce(setRoleAnnouncement, outcome.data?.unpublished ? `Poste « ${role} » supprimé. ${UNPUBLISHED_NOTICE}` : `Poste « ${role} » supprimé.`)
    outcomeRef.current?.focus()
  }

  function roleColorOf(role: string): string | null {
    return shifts.find(s => s.roleName === role)?.colorKey ?? null
  }

  async function setRoleColor(role: string, colorKey: string | null) {
    setColorPickerRole(null)
    setRoleActionError(null)
    setRoleActionBusy(role)
    const outcome = await requestJson(() => fetch(`/api/admin/events/${eventId}/roles/${encodeURIComponent(role)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colorKey }),
    }), "Erreur lors du changement de couleur.")
    setRoleActionBusy(null)
    if (!outcome.ok) {
      setRoleActionError(outcome.error)
      return
    }
    setShifts(prev => prev.map(s => s.roleName === role ? { ...s, colorKey } : s))
    const label = COLOR_OPTIONS.find(c => c.key === colorKey)?.label ?? "automatique"
    announce(setRoleAnnouncement, `Couleur du poste « ${role} » : ${label}.`)
  }

  function roleLimitOf(role: string): number | null {
    return roleLimits(shifts.filter((s) => s.roleName === role)).get(role) ?? null
  }

  function startRoleLimit(role: string) {
    setRoleActionError(null)
    setLimitError(null)
    setColorPickerRole(null)
    setRenamingRole(null)
    setReserveRole(null)
    setLimitRole(limitRole === role ? null : role)
    setLimitValue(String(roleLimitOf(role) ?? ""))
  }

  function reservedTagsOf(role: string): string[] {
    return reservedRoles(shifts.filter((s) => s.roleName === role)).get(role) ?? []
  }

  function startReserve(role: string) {
    setRoleActionError(null)
    setColorPickerRole(null)
    setRenamingRole(null)
    setLimitRole(null)
    setReserveRole(reserveRole === role ? null : role)
    setReserveValue(reservedTagsOf(role).join(", "))
  }

  function closeReserve(role: string) {
    setReserveRole(null)
    setRoleActionError(null)
    requestAnimationFrame(() => reserveBtnRefs.current.get(role)?.focus())
  }

  async function saveReserve(role: string, tags: string[]) {
    if (roleActionBusy) return
    setRoleActionError(null)
    setRoleActionBusy(role)
    const outcome = await requestJson(() => fetch(`/api/admin/events/${eventId}/roles/${encodeURIComponent(role)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reservedTags: tags }),
    }), "Erreur lors de l'enregistrement.")
    setRoleActionBusy(null)
    if (!outcome.ok) {
      setRoleActionError(outcome.error)
      return
    }
    setShifts(prev => prev.map(s => s.roleName === role ? { ...s, reservedTags: tags } : s))
    closeReserve(role)
    const typed = reserveValue.split(/[,;]/).map((t) => t.trim()).filter(Boolean).length
    const dropped = Math.max(0, typed - tags.length)
    announce(setRoleAnnouncement, (tags.length === 0 ? `Poste « ${role} » : ouvert à tous.` : `Poste « ${role} » : réservé aux membres avec l'étiquette ${tags.join(" ou ")}.`) + (dropped > 0 && tags.length > 0 ? ` ${dropped} étiquette${dropped > 1 ? "s" : ""} ignorée${dropped > 1 ? "s" : ""} (doublons, ou 10 au maximum).` : ""))
  }

  function closeRoleLimit(role: string) {
    setLimitRole(null)
    setLimitError(null)
    setRoleActionError(null)
    requestAnimationFrame(() => limitBtnRefs.current.get(role)?.focus())
  }

  async function saveRoleLimit(role: string, value: number | null) {
    if (roleActionBusy) return
    if (value !== null && (!Number.isInteger(value) || value < 1 || value > 100)) {
      flushSync(() => setLimitError(null))
      setLimitError("Entrez un nombre entier de 1 à 100, ou laissez vide pour ne pas limiter.")
      limitInputRef.current?.focus()
      return
    }
    setLimitError(null)
    setRoleActionError(null)
    setRoleActionBusy(role)
    const outcome = await requestJson(() => fetch(`/api/admin/events/${eventId}/roles/${encodeURIComponent(role)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ maxPerVolunteer: value }),
    }), "Erreur lors de l'enregistrement de la limite.")
    setRoleActionBusy(null)
    if (!outcome.ok) {
      setRoleActionError(outcome.error)
      return
    }
    setShifts(prev => prev.map(s => s.roleName === role ? { ...s, maxPerVolunteer: value } : s))
    closeRoleLimit(role)
    announce(setRoleAnnouncement, value === null ? `Poste « ${role} » : plus de limite par personne.` : `Poste « ${role} » : au plus ${value} créneau${value > 1 ? "x" : ""} par personne.`)
  }

  // Group by day (all dates, not just those with shifts)
  const shiftsByDay = activeShiftsByDay(shifts)

  const daysWithShifts = dates.filter(d => shiftsByDay[d]?.length > 0)

  const sortedShifts = sortShifts(shifts)

  const statusCls: Record<string, string> = {
    open:   "bg-green-100 text-green-700",
    full:   "bg-orange-100 text-orange-700",
    closed: "bg-gray-100 text-gray-500",
  }
  const statusLabel: Record<string, string> = { open: "Ouvert", full: "Complet", closed: "Fermé" }

  return (
    <div className="space-y-8">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm">
            <button
              onClick={() => setView("timeline")}
              className={`px-3 py-1.5 font-medium transition-colors ${view === "timeline" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"}`}
            >
              Timeline
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 font-medium transition-colors ${view === "list" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"}`}
            >
              Liste
            </button>
          </div>
          {uniqueRoles.length > 0 && (
            <button
              onClick={openReorder}
              className="text-xs text-gray-500 border border-gray-200 rounded-xl px-3 py-1.5 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
            >
              <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
              </svg>
              Gérer les postes
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            ref={seriesButtonRef}
            type="button"
            onClick={openSeries}
            aria-expanded={showSeries}
            aria-controls={seriesPanelId}
            className="border border-blue-600 text-blue-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Créer une série
          </button>
          <button
            type="button"
            onClick={() => openForm(singleDay ? { date: dates[0] } : {}, null)}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            + Ajouter un créneau
          </button>
        </div>
      </div>
      {pendingDelete && (
        <ConfirmActionModal recap={pendingDelete.recap} busy={deleting} error={deleteError} onConfirm={() => void pendingDelete.run()} onCancel={() => setPendingDelete(null)} />
      )}
      {/* Announces role actions and series creation, whether or not the roles panel is open. */}
      <div ref={outcomeRef} tabIndex={-1} role="status" className={roleAnnouncement.includes(UNPUBLISHED_NOTICE) ? "text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 focus:outline-none" : "sr-only"}>{roleAnnouncement}</div>

      {showSeries && (
        <ShiftSeriesForm
          panelId={seriesPanelId}
          eventId={eventId}
          dates={dates}
          existingShifts={shifts}
          onCreated={handleSeriesCreated}
          onClose={closeSeries}
        />
      )}

      {/* Role management panel: reorder, rename, delete */}
      {showReorder && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-gray-800">Gérer les postes</h3>
            <p className="text-xs text-gray-500 mt-0.5">Glissez-déposez pour réordonner, renommez, limitez le nombre de créneaux par personne, réservez un poste à certains membres ou supprimez un poste (tous ses créneaux).</p>
          </div>
          {roleActionError && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{roleActionError}</p>
          )}
          <div className="space-y-1.5">
            {reorderRoles.map((role, i) => {
              const isRenaming = renamingRole === role
              const isBusy = roleActionBusy === role
              const isPickingColor = colorPickerRole === role
              const limit = roleLimitOf(role)
              const reservedTags = reservedTagsOf(role)
              return (
              <div key={role}>
                <div
                  draggable={!isRenaming}
                  onDragStart={() => setDragRoleIdx(i)}
                  onDragOver={e => handleRoleDragOver(e, i)}
                  onDragEnd={() => setDragRoleIdx(null)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border select-none transition-colors
                    ${dragRoleIdx === i
                      ? "opacity-40 border-blue-200 bg-blue-50"
                      : `border-gray-100 bg-gray-50 hover:bg-gray-100 ${isRenaming ? "" : "cursor-grab active:cursor-grabbing"}`}`}
                >
                  <svg aria-hidden="true" className="w-4 h-4 text-gray-300 flex-shrink-0" fill="currentColor" viewBox="0 0 16 16">
                    <circle cx="5" cy="4" r="1.2"/><circle cx="5" cy="8" r="1.2"/><circle cx="5" cy="12" r="1.2"/>
                    <circle cx="11" cy="4" r="1.2"/><circle cx="11" cy="8" r="1.2"/><circle cx="11" cy="12" r="1.2"/>
                  </svg>
                  <button
                    onClick={() => { setLimitRole(null); setReserveRole(null); setColorPickerRole(isPickingColor ? null : role) }}
                    disabled={isBusy || isRenaming}
                    aria-label={`Changer la couleur du poste ${role}`}
                    aria-expanded={isPickingColor}
                    className={`w-4 h-4 rounded-full flex-shrink-0 disabled:opacity-50 ring-offset-1 ${isPickingColor ? "ring-2 ring-blue-400" : ""} ${getRoleAccent(role, roleColorOf(role))}`}
                  />
                  {isRenaming ? (
                    <>
                      <label className="sr-only" htmlFor={`rename-${i}`}>Nouveau nom du poste « {role} »</label>
                      <input
                        id={`rename-${i}`}
                        type="text"
                        value={renameValue}
                        autoFocus
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") submitRenameRole(role)
                          if (e.key === "Escape") setRenamingRole(null)
                        }}
                        className="input flex-1 py-1"
                      />
                      <button
                        onClick={() => submitRenameRole(role)}
                        disabled={isBusy}
                        className="text-xs text-blue-600 font-medium hover:text-blue-800 disabled:opacity-50 flex-shrink-0"
                      >
                        {isBusy ? "…" : "Valider"}
                      </button>
                      <button onClick={() => setRenamingRole(null)} className="text-xs text-gray-500 hover:text-gray-800 flex-shrink-0">
                        Annuler
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium text-gray-700 flex-1 truncate">{role}</span>
                      <button
                        ref={(el) => { if (el) limitBtnRefs.current.set(role, el); else limitBtnRefs.current.delete(role) }}
                        onClick={() => startRoleLimit(role)}
                        disabled={isBusy}
                        aria-expanded={limitRole === role}
                        aria-controls={`limit-form-${i}`}
                        // Starts with the visible text (2.5.3), then says what it is about.
                        aria-label={limit === null ? `Limite : aucune, poste « ${role} »` : `Limite : ${limit} créneau${limit > 1 ? "x" : ""} par personne, poste « ${role} »`}
                        className="text-xs text-gray-600 hover:text-blue-600 disabled:opacity-50 flex-shrink-0"
                      >
                        {limit === null ? "Limite" : `Limite : ${limit}`}
                      </button>
                      <button
                        ref={(el) => { if (el) reserveBtnRefs.current.set(role, el); else reserveBtnRefs.current.delete(role) }}
                        onClick={() => startReserve(role)}
                        disabled={isBusy}
                        aria-expanded={reserveRole === role}
                        aria-controls={`reserve-form-${i}`}
                        aria-label={reservedTags.length === 0 ? `Accès : tous, poste « ${role} »` : `Accès : ${reservedTags.join(", ")}, poste « ${role} » réservé`}
                        className="text-xs text-gray-600 hover:text-blue-600 disabled:opacity-50 flex-shrink-0"
                      >
                        <span className="inline-block max-w-[10rem] truncate align-bottom">{reservedTags.length === 0 ? "Accès : tous" : `Accès : ${reservedTags.join(", ")}`}</span>
                      </button>
                      <button
                        onClick={() => startRenameRole(role)}
                        disabled={isBusy}
                        aria-label={`Renommer le poste ${role}`}
                        className="text-xs text-gray-500 hover:text-blue-600 disabled:opacity-50 flex-shrink-0"
                      >
                        Renommer
                      </button>
                      <button
                        onClick={() => handleDeleteRole(role)}
                        disabled={isBusy}
                        aria-label={`Supprimer le poste ${role}`}
                        className="text-xs text-red-700 hover:text-red-900 disabled:opacity-50 flex-shrink-0"
                      >
                        {isBusy ? "…" : "Supprimer"}
                      </button>
                    </>
                  )}
                </div>
                {reserveRole === role && (
                  <form
                    id={`reserve-form-${i}`}
                    noValidate
                    onSubmit={(e) => { e.preventDefault(); saveReserve(role, parseTagList(reserveValue)) }}
                    onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closeReserve(role) } }}
                    className="flex flex-wrap items-end gap-2 px-3 py-2.5 mt-1 rounded-xl border border-blue-100 bg-blue-50/50"
                  >
                    <div className="flex-1 min-w-48">
                      <label htmlFor={`reserve-${i}`} className="block text-xs font-medium text-gray-700 mb-1">Étiquettes donnant accès au poste « {role} »</label>
                      <input
                        id={`reserve-${i}`}
                        type="text"
                        value={reserveValue}
                        autoFocus
                        onChange={(e) => setReserveValue(e.target.value)}
                        aria-describedby={`reserve-help-${i}`}
                        placeholder="ex. sécurité, secouriste"
                        className="input w-full py-1"
                      />
                    </div>
                    <button type="submit" aria-disabled={isBusy || undefined} className={`text-xs text-blue-700 font-medium hover:text-blue-900 py-1.5 ${isBusy ? "opacity-60 cursor-wait" : ""}`}>
                      {isBusy ? "Enregistrement…" : "Enregistrer"}
                    </button>
                    {reservedTags.length > 0 && (
                      <button type="button" onClick={() => saveReserve(role, [])} aria-disabled={isBusy || undefined} className={`text-xs text-gray-700 hover:text-gray-900 py-1.5 ${isBusy ? "opacity-60 cursor-wait" : ""}`}>
                        Ouvrir à tous
                      </button>
                    )}
                    <button type="button" onClick={() => closeReserve(role)} className="text-xs text-gray-600 hover:text-gray-900 py-1.5">Annuler</button>
                    <p id={`reserve-help-${i}`} className="basis-full text-xs text-gray-600">Séparées par des virgules, 10 au plus. Laissez vide pour ouvrir le poste à tous.</p>
                    <p className="basis-full text-xs text-gray-600">
                      Seuls les membres portant l&apos;une de ces étiquettes peuvent le prendre, et seulement avec le lien d&apos;invitation reçu par email : sans ce lien, la page publique affiche le poste comme « Réservé ». Les étiquettes ne sont jamais montrées aux bénévoles. Vous pouvez toujours ajouter quelqu&apos;un à la main.
                    </p>
                  </form>
                )}
                {limitRole === role && (
                  <form
                    id={`limit-form-${i}`}
                    noValidate
                    onSubmit={(e) => { e.preventDefault(); saveRoleLimit(role, limitValue.trim() === "" ? null : Number(limitValue)) }}
                    onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); closeRoleLimit(role) } }}
                    className="flex flex-wrap items-end gap-2 px-3 py-2.5 mt-1 rounded-xl border border-blue-100 bg-blue-50/50"
                  >
                    <div>
                      <label htmlFor={`limit-${i}`} className="block text-xs font-medium text-gray-700 mb-1">Nombre maximal de créneaux « {role} » par personne</label>
                      <input
                        ref={limitInputRef}
                        id={`limit-${i}`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={100}
                        value={limitValue}
                        autoFocus
                        onChange={(e) => setLimitValue(e.target.value)}
                        aria-invalid={limitError ? true : undefined}
                        aria-describedby={`limit-help-${i}${limitError ? ` limit-error-${i}` : ""}`}
                        className="input w-24 py-1"
                      />
                    </div>
                    <button type="submit" aria-disabled={isBusy || undefined} className={`text-xs text-blue-700 font-medium hover:text-blue-900 py-1.5 ${isBusy ? "opacity-60 cursor-wait" : ""}`}>
                      {isBusy ? "Enregistrement…" : "Enregistrer"}
                    </button>
                    {limit !== null && (
                      <button type="button" onClick={() => saveRoleLimit(role, null)} aria-disabled={isBusy || undefined} className={`text-xs text-gray-700 hover:text-gray-900 py-1.5 ${isBusy ? "opacity-60 cursor-wait" : ""}`}>
                        Retirer la limite
                      </button>
                    )}
                    <button type="button" onClick={() => closeRoleLimit(role)} className="text-xs text-gray-600 hover:text-gray-900 py-1.5">Annuler</button>
                    {limitError && <p id={`limit-error-${i}`} className="basis-full text-xs text-red-700">{limitError}</p>}
                    <p id={`limit-help-${i}`} className="basis-full text-xs text-gray-600">
                      Laissez vide pour ne pas limiter. Comptent les inscriptions confirmées, proposées et en liste d&apos;attente d&apos;une même personne sur ce poste. Les inscriptions existantes au-delà de la limite sont conservées ; vous pouvez dépasser la limite en ajoutant quelqu&apos;un à la main.
                    </p>
                  </form>
                )}
                {isPickingColor && (
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 mt-1 rounded-xl border border-blue-100 bg-blue-50/50">
                    <button
                      onClick={() => setRoleColor(role, null)}
                      className={`text-xs px-2 py-1 rounded-full border ${roleColorOf(role) === null ? "border-blue-400 bg-white font-medium" : "border-gray-200 text-gray-500 hover:bg-white"}`}
                    >
                      Automatique
                    </button>
                    {COLOR_OPTIONS.map(c => (
                      <button
                        key={c.key}
                        onClick={() => setRoleColor(role, c.key)}
                        aria-label={c.label}
                        aria-pressed={roleColorOf(role) === c.key}
                        title={c.label}
                        className={`w-6 h-6 rounded-full flex-shrink-0 ${c.swatch} ${roleColorOf(role) === c.key ? "ring-2 ring-offset-1 ring-blue-500" : ""}`}
                      />
                    ))}
                  </div>
                )}
              </div>
              )
            })}
          </div>
          <div className="flex gap-3">
            <button onClick={saveRoleOrder} disabled={savingOrder}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {savingOrder ? "…" : "Enregistrer l'ordre"}
            </button>
            <button onClick={() => setShowReorder(false)}
              className="text-gray-500 px-3 py-2 text-sm hover:text-gray-800">
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* Quick-add / edit form */}
      {showForm && (
        <div ref={formRef} className="bg-white rounded-2xl border border-blue-200 p-5 space-y-4">
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
            <button onClick={() => { setShowForm(false); setEditingId(null) }}
              className="text-gray-500 px-3 py-2 text-sm hover:text-gray-800">
              Annuler
            </button>
          </div>
        </div>
      )}

      {shifts.filter(s => s.status !== "cancelled").length === 0 && !showForm && !showSeries && (
        <div className="text-center py-12 text-gray-500">
          <p>Aucun créneau. Cliquez sur « + Ajouter un créneau », ou « Créer une série » pour plusieurs créneaux d&apos;un coup.</p>
        </div>
      )}

      {/* ── Timeline view ───────────────────────────────────────────────────── */}
      {view === "timeline" && daysWithShifts.map(day => (
        <div key={day} className="space-y-2">
          <h2 className="text-xs font-semibold text-gray-600">
            {fmtDate(day)}
          </h2>
          <AdminDayTimeline
            eventId={eventId}
            date={day}
            shifts={shiftsByDay[day]}
            shows={showSchedule.filter(s => s.date === day)}
            roleOrder={uniqueRoles}
            onCreated={handleCreated}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
          />
          <p className="text-[10px] text-gray-500 pl-1">
            Cliquer + glisser sur un poste pour ajouter un créneau · Glisser les bords pour redimensionner
          </p>
        </div>
      ))}

      {/* ── List view ───────────────────────────────────────────────────────── */}
      {view === "list" && sortedShifts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Date · Horaire</th>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Poste</th>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 hidden sm:table-cell">Places</th>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 hidden md:table-cell">Statut</th>
                <th scope="col" className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedShifts.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                    <p>{fmtDate(s.date)}</p>
                    <p className="font-medium text-gray-700">{fmtRange(s.startTime, s.endTime)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{s.roleName}</p>
                    {s.label !== s.roleName && <p className="text-xs text-gray-500">{s.label}</p>}
                    {s.minAge != null && <p className="text-[11px] text-gray-500">{s.minAge} ans min.</p>}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell tabular-nums">
                    <p className="text-gray-700 font-medium">{s.registrationCount}/{s.capacity}</p>
                    {s.registrationCount >= s.capacity
                      ? <p className="text-[11px] text-orange-500">Complet</p>
                      : <p className="text-[11px] text-emerald-600">{s.capacity - s.registrationCount} libre{s.capacity - s.registrationCount > 1 ? "s" : ""}</p>
                    }
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusCls[s.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {statusLabel[s.status] ?? s.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => openForm({
                        roleName: s.roleName,
                        label: s.label === s.roleName ? "" : s.label,
                        description: s.description ?? "",
                        date: s.date,
                        startTime: s.startTime,
                        endTime: s.endTime,
                        capacity: s.capacity,
                        // Carried through so saving doesn't reset it to emptyShift's 0 default,
                        // which silently dragged the whole role back to the front of the
                        // timeline on every edit (#215) — displayOrder is shared per role
                        // (see reorder-roles/route.ts) and this form has no field for it.
                        displayOrder: s.displayOrder,
                        internalNotes: s.internalNotes ?? "",
                        waitlistEnabled: s.waitlistEnabled ?? false,
                        requiresApproval: s.requiresApproval ?? false,
                        minAge: s.minAge ?? "",
                        locationDetails: s.locationDetails ?? "",
                        latitude: s.latitude ?? null,
                        longitude: s.longitude ?? null,
                        contactName: s.contactName ?? "",
                        contactPhone: s.contactPhone ?? "",
                        instructions: s.instructions ?? "",
                      }, s.id)}
                      className="text-xs text-blue-500 hover:text-blue-700 mr-3"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => handleDeleteShift(s.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
