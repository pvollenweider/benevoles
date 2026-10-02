"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useId, useState, useRef } from "react"
import { announce } from "@/lib/announce"
import { deleteShiftRecap, shiftWhen, type ActionRecap } from "@/lib/action-recap"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { requestJson } from "@/lib/use-submit"
import { flushSync } from "react-dom"
import { fmtRange } from "@/lib/gantt-utils"
import { focusFirstAvailableNextFrame, type FocusCandidate } from "@/lib/focus-return"
import { shiftSavedMessage } from "@/lib/shift-editor-form"
import AdminDayTimeline, { type AdminShift } from "./AdminDayTimeline"
import ShiftSeriesForm from "./ShiftSeriesForm"
import ShiftEditor, { type ShiftFormValues } from "./shifts/ShiftEditor"
import RoleManagerPanel from "./shifts/RoleManagerPanel"
import type { RawShift } from "./shifts/types"
import {
  activeShiftsByDay,
  eventDates,
  fmtLongDate as fmtDate,
  roleOrder,
  sortShifts,
} from "@/lib/shifts-admin"

const UNPUBLISHED_NOTICE = "C'était le dernier créneau : l'événement est repassé en brouillon, sa page publique n'est plus accessible."

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
  // What the shift form opens with; a new key remounts ShiftEditor, which resets its values.
  const [formInitial, setFormInitial] = useState<Partial<ShiftFormValues>>({})
  const [formKey, setFormKey]         = useState(0)
  const [view, setView]             = useState<"timeline" | "list">("timeline")
  const [showReorder, setShowReorder]     = useState(false)
  const [reorderRoles, setReorderRoles]   = useState<string[]>([])
  const [roleAnnouncement, setRoleAnnouncement] = useState("")
  // « Gérer les postes » is a disclosure for the roles panel; focus comes back to it when the panel closes (#554).
  const manageRolesBtnRef = useRef<HTMLButtonElement>(null)
  const rolesPanelId = useId()
  // A deletion waits for its confirmation (#379): the recap of what it does, then run.
  const [pendingDelete, setPendingDelete] = useState<{ recap: ActionRecap; run: () => Promise<void> } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // The row whose « Supprimer » opened the modal is gone once the deletion is done: park the focus on the outcome.
  const outcomeRef = useRef<HTMLDivElement>(null)
  // Focus return of the shift editor (#554): back to what opened it (« + Ajouter un créneau » or the
  // row's « Modifier »), else to the add button, else to the outcome status. Never to <body>.
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const editBtnRefs = useRef(new Map<string, HTMLButtonElement>())
  const formOpenerRef = useRef<FocusCandidate>(null)

  function openForm(patch: Partial<ShiftFormValues>, editId: string | null) {
    // A getter: the row's « Modifier » may be gone by the time the editor closes (view switched).
    formOpenerRef.current = editId ? () => editBtnRefs.current.get(editId) : () => addBtnRef.current
    flushSync(() => {
      setShowSeries(false)
      setFormInitial(patch)
      setFormKey(k => k + 1)
      setEditingId(editId)
      setShowForm(true)
    })
    const smooth = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: no-preference)").matches
    formRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" })
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    focusFirstAvailableNextFrame([formOpenerRef.current, () => addBtnRef.current, () => outcomeRef.current])
  }

  function handleShiftSaved(data: RawShift & { date?: string }, editingId: string | null) {
    const before = editingId ? shifts.find(s => s.id === editingId) : undefined
    const saved = { ...before, ...data, date: (data.date ?? before?.date ?? "").split("T")[0] }
    if (editingId) {
      setShifts(prev => prev.map(s =>
        s.id === editingId
          ? { ...s, ...data, date: data.date?.split("T")[0] ?? s.date, registrationCount: s.registrationCount }
          : s
      ))
    } else {
      setShifts(prev => [...prev, { ...data, date: data.date.split("T")[0], registrationCount: 0 }])
    }
    closeForm()
    announce(setRoleAnnouncement, shiftSavedMessage(editingId ? "edited" : "added", saved))
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

  // ── Roles panel (RoleManagerPanel) ────────────────────────────────────────
  const uniqueRoles = roleOrder(shifts)

  function openReorder() {
    setReorderRoles([...uniqueRoles])
    setShowReorder(true)
  }

  function closeReorder() {
    setShowReorder(false)
    focusFirstAvailableNextFrame([() => manageRolesBtnRef.current, () => addBtnRef.current, () => outcomeRef.current])
  }

  function requestRoleDelete(pending: { recap: ActionRecap; run: () => Promise<void> }) {
    setDeleteError(null)
    setPendingDelete(pending)
  }

  function handleRoleDeleted(role: string, unpublished: boolean | undefined) {
    flushSync(() => {
      setPendingDelete(null)
      setShifts(prev => prev.filter(s => s.roleName !== role))
      setReorderRoles(prev => prev.filter(r => r !== role))
    })
    announce(setRoleAnnouncement, unpublished ? `Poste « ${role} » supprimé. ${UNPUBLISHED_NOTICE}` : `Poste « ${role} » supprimé.`)
    outcomeRef.current?.focus()
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
          {/* View toggle (#554): toggle buttons, no overflow-hidden (it clipped the focus outline);
              the 11px inner radius (12px minus the border) keeps the dark fill inside the rounded border.
              Forced colours: the pressed button is filled with Highlight. Its text keeps the forced
              CanvasText, because Chromium paints a Canvas plate behind text there, and HighlightText
              (often the same as, or close to, Canvas) would make the label invisible. */}
          <div role="group" aria-label="Affichage des créneaux" className="flex rounded-xl border border-gray-200 text-sm">
            <button
              type="button"
              aria-pressed={view === "timeline"}
              onClick={() => setView("timeline")}
              className={`px-3 py-1.5 font-medium transition-colors first:rounded-l-[11px] last:rounded-r-[11px] forced-colors:aria-pressed:bg-[Highlight] ${view === "timeline" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"}`}
            >
              Timeline
            </button>
            <button
              type="button"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              className={`px-3 py-1.5 font-medium transition-colors first:rounded-l-[11px] last:rounded-r-[11px] forced-colors:aria-pressed:bg-[Highlight] ${view === "list" ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-50"}`}
            >
              Liste
            </button>
          </div>
          {uniqueRoles.length > 0 && (
            <button
              ref={manageRolesBtnRef}
              type="button"
              onClick={showReorder ? closeReorder : openReorder}
              aria-expanded={showReorder}
              aria-controls={showReorder ? rolesPanelId : undefined}
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
            aria-controls={showSeries ? seriesPanelId : undefined}
            className="border border-blue-600 text-blue-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-50 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Créer une série
          </button>
          <button
            ref={addBtnRef}
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
      {/* Announces shift saves, role actions and series creation, whether or not the roles panel is open. */}
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
      <RoleManagerPanel
        open={showReorder}
        panelId={rolesPanelId}
        eventId={eventId}
        shifts={shifts}
        setShifts={setShifts}
        roles={reorderRoles}
        setRoles={setReorderRoles}
        onClose={closeReorder}
        onAnnounce={(text) => announce(setRoleAnnouncement, text)}
        onRequestDelete={requestRoleDelete}
        onDeletingChange={setDeleting}
        onDeleteError={setDeleteError}
        onRoleDeleted={handleRoleDeleted}
      />

      {/* Quick-add / edit form */}
      {showForm && (
        <ShiftEditor
          key={formKey}
          ref={formRef}
          eventId={eventId}
          dates={dates}
          editingId={editingId}
          initial={formInitial}
          existingShifts={shifts}
          onSaved={handleShiftSaved}
          onCancel={closeForm}
        />
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
                      type="button"
                      ref={(el) => { if (el) editBtnRefs.current.set(s.id, el); else editBtnRefs.current.delete(s.id) }}
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
