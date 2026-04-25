"use client"

import { useState, useRef } from "react"
import { flushSync } from "react-dom"
import { useRouter } from "next/navigation"
import StatusBadge from "./StatusBadge"
import { KNOWN_ROLES, getRoleAccent, RoleIcon } from "@/lib/roles"

type Shift = {
  id: string
  roleName: string
  label: string
  description: string | null
  date: string
  startTime: string
  endTime: string
  capacity: number
  status: string
  registrationCount: number
  internalNotes: string | null
}

const emptyShift = {
  roleName: "", label: "", description: "", date: "", startTime: "", endTime: "",
  capacity: 2, locationDetails: "", displayOrder: 0, internalNotes: "",
}

function eventDates(start: string, end: string): string[] {
  const dates: string[] = []
  const cur = new Date(start + "T00:00:00")
  const last = new Date(end + "T00:00:00")
  while (cur <= last) {
    dates.push(cur.toISOString().split("T")[0])
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long" })
}

export default function ShiftsManager({
  eventId, eventStartDate, eventEndDate, initialShifts,
}: {
  eventId: string
  eventStartDate: string
  eventEndDate: string
  initialShifts: Shift[]
}) {
  const router = useRouter()
  const formRef = useRef<HTMLDivElement>(null)
  const dates = eventDates(eventStartDate, eventEndDate)
  const singleDay = dates.length === 1
  const [shifts, setShifts] = useState<Shift[]>(initialShifts)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyShift)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setField(k: string, v: string | number) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function handleSave() {
    if (!form.label || !form.date || !form.startTime || !form.endTime || !form.roleName) {
      setError("Tous les champs obligatoires doivent être remplis.")
      return
    }
    setSaving(true)
    setError(null)

    const url = editingId ? `/api/admin/shifts/${editingId}` : "/api/admin/shifts"
    const method = editingId ? "PATCH" : "POST"
    const body = editingId ? form : { ...form, eventId }

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, capacity: Number(body.capacity) }),
    })

    const data = await res.json()
    setSaving(false)

    if (!res.ok) { setError("Erreur lors de la sauvegarde."); return }

    if (editingId) {
      setShifts((prev) => prev.map((s) => s.id === editingId ? { ...s, ...data, date: data.date?.split("T")[0] ?? s.date, registrationCount: s.registrationCount } : s))
    } else {
      setShifts((prev) => [...prev, { ...data, date: data.date.split("T")[0], registrationCount: 0 }])
    }

    setForm(emptyShift)
    setShowForm(false)
    setEditingId(null)
  }

  function openForm(patch: Partial<typeof emptyShift>, editId: string | null) {
    flushSync(() => {
      setForm({ ...emptyShift, ...patch })
      setEditingId(editId)
      setShowForm(true)
      setError(null)
    })
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  function startEdit(shift: Shift) {
    openForm({
      roleName: shift.roleName, label: shift.label, description: shift.description ?? "",
      date: shift.date, startTime: shift.startTime, endTime: shift.endTime,
      capacity: shift.capacity, internalNotes: shift.internalNotes ?? "",
    }, shift.id)
  }

  function startDuplicate(shift: Shift) {
    openForm({
      roleName: shift.roleName, label: shift.label, description: shift.description ?? "",
      date: shift.date, startTime: shift.startTime, endTime: shift.endTime,
      capacity: shift.capacity, internalNotes: shift.internalNotes ?? "",
    }, null)
  }

  async function handleStatusChange(shiftId: string, status: string) {
    await fetch(`/api/admin/shifts/${shiftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    setShifts((prev) => prev.map((s) => s.id === shiftId ? { ...s, status } : s))
  }

  async function handleDelete(shiftId: string) {
    if (!confirm("Annuler ce créneau ?")) return
    await fetch(`/api/admin/shifts/${shiftId}`, { method: "DELETE" })
    setShifts((prev) => prev.filter((s) => s.id !== shiftId))
  }

  const shiftsByDay = shifts
    .filter((s) => s.status !== "cancelled")
    .reduce<Record<string, Shift[]>>((acc, s) => {
      if (!acc[s.date]) acc[s.date] = []
      acc[s.date].push(s)
      return acc
    }, {})

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={() => openForm(singleDay ? { date: dates[0] } : {}, null)}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Ajouter un créneau
        </button>
      </div>

      {showForm && (
        <div ref={formRef} className="bg-white rounded-2xl border border-blue-200 p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">{editingId ? "Modifier le créneau" : "Nouveau créneau"}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Poste *</label>
              <input
                type="text"
                list="role-options"
                value={form.roleName}
                onChange={(e) => setField("roleName", e.target.value)}
                placeholder="ex. Billetterie"
                className="input"
              />
              <datalist id="role-options">
                {KNOWN_ROLES.map((r) => <option key={r} value={r} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Libellé *</label>
              <input type="text" value={form.label} onChange={(e) => setField("label", e.target.value)}
                placeholder="ex. Billetterie avant spectacle" className="input" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
              {singleDay ? (
                <div className="input bg-gray-50 text-gray-500 cursor-default">{fmtDate(dates[0])}</div>
              ) : (
                <select value={form.date} onChange={(e) => setField("date", e.target.value)} className="input">
                  <option value="">— choisir —</option>
                  {dates.map((d) => (
                    <option key={d} value={d}>{fmtDate(d)}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Début *</label>
              <input type="time" value={form.startTime} onChange={(e) => setField("startTime", e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fin *</label>
              <input type="time" value={form.endTime} onChange={(e) => setField("endTime", e.target.value)} className="input" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Capacité *</label>
              <input type="number" min="1" value={form.capacity} onChange={(e) => setField("capacity", e.target.value)} className="input" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <input type="text" value={form.description} onChange={(e) => setField("description", e.target.value)} className="input" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes internes</label>
            <input type="text" value={form.internalNotes} onChange={(e) => setField("internalNotes", e.target.value)} className="input" />
          </div>

          {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{error}</div>}

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

      {Object.keys(shiftsByDay).length === 0 && !showForm && (
        <div className="text-center py-12 text-gray-400">
          <p>Aucun créneau. Ajoutez-en un pour commencer.</p>
        </div>
      )}

      {Object.entries(shiftsByDay).map(([day, dayShifts]) => (
        <div key={day}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
            {new Date(day).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
          </h2>
          <div className="space-y-2">
            {dayShifts.map((shift) => {
              const missing = shift.capacity - shift.registrationCount
              return (
                <div key={shift.id} className={`relative bg-white rounded-xl border border-gray-200 p-4 pl-5 overflow-hidden`}>
                  <div className={`absolute left-0 inset-y-0 w-1 ${getRoleAccent(shift.roleName)}`} />
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">{shift.label}</span>
                        <StatusBadge status={shift.status} />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                        {shift.startTime}–{shift.endTime} · <RoleIcon roleName={shift.roleName} /> {shift.roleName}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                        <span>{shift.registrationCount}/{shift.capacity} inscrits</span>
                        {missing > 0 && <span className="text-orange-600 font-medium">{missing} manquant{missing > 1 ? "s" : ""}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <select
                        value={shift.status}
                        onChange={(e) => handleStatusChange(shift.id, e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      >
                        <option value="open">Ouvert</option>
                        <option value="full">Complet</option>
                        <option value="closed">Fermé</option>
                      </select>
                      <button onClick={() => startDuplicate(shift)} className="text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg px-2 py-1">Dupliquer</button>
                      <button onClick={() => startEdit(shift)} className="text-xs text-blue-600 hover:underline px-2 py-1">Modifier</button>
                      <button onClick={() => handleDelete(shift.id)} className="text-xs text-red-400 hover:text-red-600 px-2 py-1">✕</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
