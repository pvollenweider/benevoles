"use client"

import { useState } from "react"

type Volunteer = { id: string; firstName: string; lastName: string; email: string; phone: string | null }
type ShiftRef = { id: string; roleName: string; label: string; date: string; startTime: string; endTime: string }

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
}
function fmtTime(t: string) {
  const [h, m] = t.split(":")
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`
}
function shiftLabel(s: ShiftRef) {
  const base = `${fmtDate(s.date)} · ${fmtTime(s.startTime)}–${fmtTime(s.endTime)} · ${s.roleName}`
  return s.label !== s.roleName ? `${base} · ${s.label}` : base
}
type Registration = {
  id: string; status: string; source: string; comment: string | null
  createdAt: string; volunteer: Volunteer; shift: ShiftRef
}

type Props = {
  eventId: string
  initialRegistrations: Registration[]
  shifts: ShiftRef[]
}

const sourceLabels: Record<string, string> = {
  public_form: "Formulaire",
  admin_manual: "Manuel",
  import: "Import",
}

export default function RegistrationsManager({ eventId, initialRegistrations, shifts }: Props) {
  const [registrations, setRegistrations] = useState<Registration[]>(initialRegistrations)
  const [search, setSearch] = useState("")
  const [shiftFilter, setShiftFilter] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ firstName: "", lastName: "", email: "", phone: "", shiftId: "", comment: "" })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const filtered = registrations.filter((r) => {
    const q = search.toLowerCase()
    const matchSearch = !q || `${r.volunteer.firstName} ${r.volunteer.lastName} ${r.volunteer.email}`.toLowerCase().includes(q)
    const matchShift = !shiftFilter || r.shift.id === shiftFilter
    return matchSearch && matchShift
  })

  async function handleCancel(id: string) {
    if (!confirm("Annuler cette inscription ?")) return
    await fetch(`/api/admin/registrations/${id}`, { method: "DELETE" })
    setRegistrations((prev) => prev.filter((r) => r.id !== id))
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

    const newReg: Registration = {
      id: data.id,
      status: data.status,
      source: data.source,
      comment: data.comment,
      createdAt: data.createdAt,
      volunteer: data.volunteer,
      shift: { id: data.shift.id, roleName: data.shift.roleName, label: data.shift.label, date: data.shift.date.split("T")[0], startTime: data.shift.startTime, endTime: data.shift.endTime },
    }
    setRegistrations((prev) => [newReg, ...prev])
    setAddForm({ firstName: "", lastName: "", email: "", phone: "", shiftId: "", comment: "" })
    setShowAddForm(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Rechercher (nom, email…)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-48 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={shiftFilter}
          onChange={(e) => setShiftFilter(e.target.value)}
          className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tous les créneaux</option>
          {shifts.map((s) => (
            <option key={s.id} value={s.id}>{shiftLabel(s)}</option>
          ))}
        </select>
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
            <select value={addForm.shiftId} onChange={(e) => setAddForm((f) => ({ ...f, shiftId: e.target.value }))} className="input">
              <option value="">Sélectionner…</option>
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>{shiftLabel(s)}</option>
              ))}
            </select>
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

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>{registrations.length === 0 ? "Aucune inscription." : "Aucun résultat."}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Bénévole</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 hidden sm:table-cell">Créneau</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 hidden md:table-cell">Source</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((reg) => (
                <tr key={reg.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{reg.volunteer.firstName} {reg.volunteer.lastName}</p>
                    <p className="text-xs text-gray-400">{reg.volunteer.email}</p>
                    {reg.volunteer.phone && <p className="text-xs text-gray-400">{reg.volunteer.phone}</p>}
                    {reg.comment && <p className="text-xs text-gray-400 italic mt-0.5">"{reg.comment}"</p>}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <p className="text-gray-700">
                      {reg.shift.label !== reg.shift.roleName
                        ? <>{reg.shift.roleName} <span className="text-gray-400 font-normal">·</span> {reg.shift.label}</>
                        : reg.shift.label}
                    </p>
                    <p className="text-xs text-gray-400">{fmtDate(reg.shift.date)} · {fmtTime(reg.shift.startTime)}–{fmtTime(reg.shift.endTime)}</p>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className="text-xs text-gray-400">{sourceLabels[reg.source] ?? reg.source}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleCancel(reg.id)}
                      className="text-xs text-red-400 hover:text-red-600 transition-colors"
                    >
                      Annuler
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
