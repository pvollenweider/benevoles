"use client"

import { useState, useRef } from "react"
import { flushSync } from "react-dom"
import { KNOWN_ROLES, COLOR_OPTIONS, getRoleAccent } from "@/lib/roles"
import { fmtRange, resolveNewShiftDisplayOrder, isCompleteTime, addMinutes } from "@/lib/gantt-utils"
import AdminDayTimeline, { type AdminShift } from "./AdminDayTimeline"

const emptyShift = {
  roleName: "", label: "", description: "", date: "", startTime: "", endTime: "",
  capacity: 2, locationDetails: "", displayOrder: 0, internalNotes: "", waitlistEnabled: false,
  minAge: "" as number | string,
}

function localISO(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function eventDates(start: string, end: string): string[] {
  const dates: string[] = []
  const cur  = new Date(start + "T00:00:00")
  const last = new Date(end   + "T00:00:00")
  while (cur <= last) {
    dates.push(localISO(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}


function normalizeTime(val: string): string {
  const clean = val.trim()
  if (!clean) return ""
  const [h, m] = clean.split(":")
  const hours   = parseInt(h, 10)
  const minutes = m !== undefined ? parseInt(m, 10) : 0
  if (isNaN(hours)) return clean
  // Out-of-range values (24, 26, -2, 75 minutes) are kept as typed so the server
  // reports them, instead of being silently changed to a different time.
  if (hours < 0 || hours > 23 || isNaN(minutes) || minutes < 0 || minutes > 59) return clean
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  })
}

// ── Helper: convert Prisma shift to AdminShift ────────────────────────────────
type RawShift = AdminShift & { description?: string | null; internalNotes?: string | null }
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

  function setField(k: string, v: string | number | boolean) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function openForm(patch: Partial<typeof emptyShift>, editId: string | null) {
    flushSync(() => {
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

    const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "Erreur lors de la sauvegarde.")
      return
    }

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

  // ── Callbacks for AdminDayTimeline ────────────────────────────────────────
  function handleCreated(s: AdminShift) {
    setShifts(prev => {
      if (prev.find(x => x.id === s.id)) return prev
      return [...prev, { ...s, description: null, internalNotes: null }]
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

  async function handleDeleteShift(id: string) {
    if (!confirm("Supprimer ce créneau ?")) return
    const res = await fetch(`/api/admin/shifts/${id}`, { method: "DELETE" })
    if (res.ok) handleDeleted(id)
  }

  // ── Role ordering ─────────────────────────────────────────────────────────
  const uniqueRoles = [...new Set(
    [...shifts]
      .filter(s => s.status !== "cancelled")
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map(s => s.roleName)
  )]

  function openReorder() {
    setReorderRoles([...uniqueRoles])
    setShowReorder(true)
  }

  function handleRoleDragOver(e: React.DragEvent, toIdx: number) {
    e.preventDefault()
    if (dragRoleIdx === null || dragRoleIdx === toIdx) return
    setReorderRoles(prev => {
      const next = [...prev]
      const [item] = next.splice(dragRoleIdx, 1)
      next.splice(toIdx, 0, item)
      return next
    })
    setDragRoleIdx(toIdx)
  }

  async function saveRoleOrder() {
    setSavingOrder(true)
    await fetch(`/api/admin/events/${eventId}/reorder-roles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleOrder: reorderRoles }),
    })
    setShifts(prev => prev.map(s => {
      const idx = reorderRoles.indexOf(s.roleName)
      return idx >= 0 ? { ...s, displayOrder: idx * 100 } : s
    }))
    setSavingOrder(false)
    setShowReorder(false)
  }

  function startRenameRole(role: string) {
    setRoleActionError(null)
    setRenamingRole(role)
    setRenameValue(role)
  }

  async function submitRenameRole(oldName: string) {
    const newName = renameValue.trim()
    if (!newName || newName === oldName) { setRenamingRole(null); return }
    setRoleActionError(null)
    setRoleActionBusy(oldName)
    const res = await fetch(`/api/admin/events/${eventId}/roles/${encodeURIComponent(oldName)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    })
    const data = await res.json()
    setRoleActionBusy(null)
    if (!res.ok) {
      setRoleActionError(typeof data?.error === "string" ? data.error : "Erreur lors du renommage.")
      return
    }
    setShifts(prev => prev.map(s => s.roleName === oldName
      ? { ...s, roleName: newName, label: s.label === oldName ? newName : s.label }
      : s
    ))
    setReorderRoles(prev => prev.map(r => r === oldName ? newName : r))
    setRenamingRole(null)
    setRoleAnnouncement(`Poste renommé « ${oldName} » → « ${newName} ».`)
  }

  async function handleDeleteRole(role: string) {
    const roleShifts = shifts.filter(s => s.roleName === role && s.status !== "cancelled")
    const totalRegs = roleShifts.reduce((n, s) => n + s.registrationCount, 0)
    const warning = totalRegs > 0
      ? `Supprimer le poste « ${role} » (${roleShifts.length} créneau${roleShifts.length > 1 ? "x" : ""}) ? ${totalRegs} bénévole${totalRegs > 1 ? "s" : ""} inscrit${totalRegs > 1 ? "s" : ""} seront prévenu${totalRegs > 1 ? "s" : ""} par email.`
      : `Supprimer le poste « ${role} » (${roleShifts.length} créneau${roleShifts.length > 1 ? "x" : ""}) ?`
    if (!confirm(warning)) return

    setRoleActionError(null)
    setRoleActionBusy(role)
    const res = await fetch(`/api/admin/events/${eventId}/roles/${encodeURIComponent(role)}`, { method: "DELETE" })
    const data = await res.json()
    setRoleActionBusy(null)
    if (!res.ok) {
      setRoleActionError(typeof data?.error === "string" ? data.error : "Erreur lors de la suppression.")
      return
    }
    setShifts(prev => prev.filter(s => s.roleName !== role))
    setReorderRoles(prev => prev.filter(r => r !== role))
    setRoleAnnouncement(`Poste « ${role} » supprimé.`)
  }

  function roleColorOf(role: string): string | null {
    return shifts.find(s => s.roleName === role)?.colorKey ?? null
  }

  async function setRoleColor(role: string, colorKey: string | null) {
    setColorPickerRole(null)
    setRoleActionError(null)
    setRoleActionBusy(role)
    const res = await fetch(`/api/admin/events/${eventId}/roles/${encodeURIComponent(role)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colorKey }),
    })
    const data = await res.json()
    setRoleActionBusy(null)
    if (!res.ok) {
      setRoleActionError(typeof data?.error === "string" ? data.error : "Erreur lors du changement de couleur.")
      return
    }
    setShifts(prev => prev.map(s => s.roleName === role ? { ...s, colorKey } : s))
    const label = COLOR_OPTIONS.find(c => c.key === colorKey)?.label ?? "automatique"
    setRoleAnnouncement(`Couleur du poste « ${role} » : ${label}.`)
  }

  // Group by day (all dates, not just those with shifts)
  const shiftsByDay = shifts
    .filter(s => s.status !== "cancelled")
    .reduce<Record<string, RawShift[]>>((acc, s) => {
      if (!acc[s.date]) acc[s.date] = []
      acc[s.date].push(s)
      return acc
    }, {})

  const daysWithShifts = dates.filter(d => shiftsByDay[d]?.length > 0)

  const sortedShifts = [...shifts]
    .filter(s => s.status !== "cancelled")
    .sort((a, b) =>
      a.date.localeCompare(b.date) ||
      (a.displayOrder ?? 0) - (b.displayOrder ?? 0) ||
      a.startTime.localeCompare(b.startTime)
    )

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
        <button
          onClick={() => openForm(singleDay ? { date: dates[0] } : {}, null)}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Ajouter un créneau
        </button>
      </div>

      {/* Role management panel: reorder, rename, delete */}
      {showReorder && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div>
            <h3 className="font-semibold text-gray-800">Gérer les postes</h3>
            <p className="text-xs text-gray-500 mt-0.5">Glissez-déposez pour réordonner, renommez ou supprimez un poste (tous ses créneaux).</p>
          </div>
          <div role="status" aria-live="polite" className="sr-only">{roleAnnouncement}</div>
          {roleActionError && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{roleActionError}</p>
          )}
          <div className="space-y-1.5">
            {reorderRoles.map((role, i) => {
              const isRenaming = renamingRole === role
              const isBusy = roleActionBusy === role
              const isPickingColor = colorPickerRole === role
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
                    onClick={() => setColorPickerRole(isPickingColor ? null : role)}
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
                        className="text-xs text-red-400 hover:text-red-600 disabled:opacity-50 flex-shrink-0"
                      >
                        {isBusy ? "…" : "Supprimer"}
                      </button>
                    </>
                  )}
                </div>
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
              <label className={`block text-xs font-medium mb-1 ${attempted && !form.roleName ? "text-red-500" : "text-gray-600"}`}>Poste *</label>
              <input
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Libellé</label>
              <input
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
              <label className={`block text-xs font-medium mb-1 ${attempted && !form.date ? "text-red-500" : "text-gray-600"}`}>Date *</label>
              {singleDay ? (
                <div className="input bg-gray-50 text-gray-500 cursor-default">{fmtDate(dates[0])}</div>
              ) : (
                <select value={form.date} onChange={e => setField("date", e.target.value)} className={`input ${attempted && !form.date ? "!border-red-400" : ""}`}>
                  <option value="">— choisir —</option>
                  {dates.map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
                </select>
              )}
            </div>
            <div>
              <label className={`block text-xs font-medium mb-1 ${attempted && !form.startTime ? "text-red-500" : "text-gray-600"}`}>Début *</label>
              <input
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
              <label className={`block text-xs font-medium mb-1 ${attempted && !form.endTime ? "text-red-500" : "text-gray-600"}`}>Fin *</label>
              <input
                type="text" placeholder="HH:MM" value={form.endTime}
                className={`input ${attempted && !form.endTime ? "!border-red-400" : ""}`}
                onChange={e => setField("endTime", e.target.value)}
                onBlur={e => setField("endTime", normalizeTime(e.target.value))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Capacité *</label>
              <input type="number" min="1" value={form.capacity} onChange={e => setField("capacity", e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input type="text" value={form.description} onChange={e => setField("description", e.target.value)} className="input" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes internes</label>
            <input type="text" value={form.internalNotes} onChange={e => setField("internalNotes", e.target.value)} className="input" />
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

      {shifts.filter(s => s.status !== "cancelled").length === 0 && !showForm && (
        <div className="text-center py-12 text-gray-500">
          <p>Aucun créneau. Cliquez sur « + Ajouter un créneau » pour commencer.</p>
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
                        minAge: s.minAge ?? "",
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
