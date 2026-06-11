"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import StatusBadge from "./StatusBadge"

type Volunteer = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null }
type ShiftRef  = {
  id: string; roleName: string; label: string; date: string
  startTime: string; endTime: string; capacity: number; registrationCount: number
}
type Registration = {
  id: string; status: string; source: string; comment: string | null
  createdAt: string; waitingPosition: number | null; volunteer: Volunteer; shift: ShiftRef
}

type Props = {
  eventId: string
  initialRegistrations: Registration[]
  shifts: ShiftRef[]
  initialShiftFilter?: string
}

const sourceLabels: Record<string, string> = {
  public_form: "Formulaire",
  admin_manual: "Manuel",
  import: "Import",
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toMin(t: string) {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}
function shiftsOverlap(a: ShiftRef, b: ShiftRef) {
  if (a.date !== b.date) return false
  return toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime)
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
}
function fmtTime(t: string) {
  const [h, m] = t.split(":")
  return m === "00" ? `${Number(h)}h` : `${Number(h)}h${m}`
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ s }: { s: ShiftRef }) {
  if (s.registrationCount >= s.capacity) {
    return <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Complet</span>
  }
  if (s.registrationCount === 0) {
    return <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 font-medium">0/{s.capacity}</span>
  }
  return (
    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
      {s.registrationCount}/{s.capacity}
    </span>
  )
}

// ── Custom shift dropdown ─────────────────────────────────────────────────────
function ShiftSelect({
  shifts, value, onChange, placeholder = "Sélectionner…", nullable = false, existingShifts,
}: {
  shifts: ShiftRef[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  nullable?: boolean
  existingShifts?: ShiftRef[]
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onMD(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onMD)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onMD)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const selected      = shifts.find(s => s.id === value) ?? null
  const alreadyIds    = useMemo(() => new Set((existingShifts ?? []).map(s => s.id)), [existingShifts])
  const conflictIds   = useMemo(() => new Set(
    existingShifts
      ? shifts.filter(s => !alreadyIds.has(s.id) && existingShifts.some(e => shiftsOverlap(s, e))).map(s => s.id)
      : []
  ), [existingShifts, shifts, alreadyIds])

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-between gap-2 w-full border border-gray-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[38px]"
      >
        <span className={`truncate text-left ${selected ? "text-gray-800" : "text-gray-400"}`}>
          {selected
            ? `${fmtDate(selected.date)} · ${fmtTime(selected.startTime)}–${fmtTime(selected.endTime)} · ${selected.roleName}${selected.label !== selected.roleName ? ` · ${selected.label}` : ""}`
            : placeholder}
        </span>
        <svg
          className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown list */}
      {open && (
        <div
          className="absolute top-full mt-1 left-0 z-50 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden"
          style={{ minWidth: "100%", width: "max-content", maxWidth: "90vw" }}
        >
          {nullable && (
            <div
              onClick={() => { onChange(""); setOpen(false) }}
              className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-gray-50 border-b border-gray-100
                ${!value ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600"}`}
            >
              Tous les créneaux
            </div>
          )}
          {shifts.map(s => {
            const full       = s.registrationCount >= s.capacity
            const empty      = s.registrationCount === 0
            const alreadyReg = alreadyIds.has(s.id)
            const isConflict = conflictIds.has(s.id)
            const isSelected = value === s.id
            const rowCls = alreadyReg
              ? "border-orange-300 hover:bg-orange-50"
              : isConflict
                ? "border-amber-300 hover:bg-amber-50"
                : full
                  ? "border-red-200 hover:bg-red-50"
                  : !empty
                    ? "border-emerald-200 hover:bg-emerald-50"
                    : "border-gray-100 hover:bg-gray-50"
            return (
              <div
                key={s.id}
                onClick={() => { onChange(s.id); setOpen(false) }}
                className={`flex items-center gap-3 pl-3 pr-4 py-2 cursor-pointer border-l-2 transition-colors
                  ${rowCls} ${isSelected ? "bg-blue-50" : alreadyReg ? "bg-orange-50/50" : isConflict ? "bg-amber-50/40" : ""}`}
              >
                <span className="shrink-0 w-28 text-xs text-gray-500">{fmtDate(s.date)}</span>
                <span className="shrink-0 w-20 text-xs text-gray-600 tabular-nums">
                  {fmtTime(s.startTime)}–{fmtTime(s.endTime)}
                </span>
                <span className={`flex-1 text-sm font-medium min-w-0 ${alreadyReg ? "text-orange-800" : isConflict ? "text-amber-800" : "text-gray-800"}`}>
                  {s.roleName}
                  {s.label !== s.roleName && (
                    <span className="font-normal text-gray-400"> · {s.label}</span>
                  )}
                </span>
                {alreadyReg && (
                  <span className="shrink-0 text-[10px] text-orange-600 font-medium">Déjà inscrit</span>
                )}
                {isConflict && (
                  <span className="shrink-0 text-[10px] text-amber-600 font-medium">⚠ conflit</span>
                )}
                <StatusPill s={s} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RegistrationsManager({ eventId, initialRegistrations, shifts, initialShiftFilter }: Props) {
  const [registrations, setRegistrations] = useState<Registration[]>(initialRegistrations)
  const [search, setSearch] = useState("")
  const initialShift = initialShiftFilter ? shifts.find(s => s.id === initialShiftFilter) ?? null : null
  const [roleFilter, setRoleFilter] = useState(initialShift?.roleName ?? "")
  const [shiftFilter, setShiftFilter] = useState(initialShiftFilter ?? "")
  const [showAddForm, setShowAddForm] = useState(false)
  const [addForm, setAddForm] = useState({ firstName: "", lastName: "", email: "", phone: "", shiftId: "", comment: "" })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  const uniqueRoles = [...new Set(shifts.map(s => s.roleName))]
  const visibleShifts = roleFilter ? shifts.filter(s => s.roleName === roleFilter) : shifts

  // Shifts already held by the volunteer identified by the email in the add form
  const volunteerShifts = useMemo<ShiftRef[] | undefined>(() => {
    const email = addForm.email.trim().toLowerCase()
    if (!email) return undefined
    const found = registrations.filter(r => r.volunteer.email?.toLowerCase() === email).map(r => r.shift)
    return found.length > 0 ? found : undefined
  }, [addForm.email, registrations])

  const selectedShiftObj = useMemo(
    () => (addForm.shiftId ? shifts.find(s => s.id === addForm.shiftId) ?? null : null),
    [addForm.shiftId, shifts]
  )

  const conflictMessage = useMemo<string | null>(() => {
    if (!selectedShiftObj || !volunteerShifts) return null
    if (volunteerShifts.some(e => e.id === selectedShiftObj.id))
      return "Ce bénévole est déjà inscrit à ce créneau."
    if (volunteerShifts.some(e => shiftsOverlap(selectedShiftObj, e)))
      return "Ce bénévole est déjà inscrit à un autre créneau pour cette plage horaire."
    return null
  }, [selectedShiftObj, volunteerShifts])

  const filtered = registrations.filter((r) => {
    const q = search.toLowerCase()
    const matchSearch = !q || `${r.volunteer.firstName} ${r.volunteer.lastName} ${r.volunteer.email ?? ""}`.toLowerCase().includes(q)
    const matchRole  = !roleFilter  || r.shift.roleName === roleFilter
    const matchShift = !shiftFilter || r.shift.id === shiftFilter
    return matchSearch && matchRole && matchShift
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

    const shiftRef = shifts.find(s => s.id === addForm.shiftId)
    const newReg: Registration = {
      id: data.id,
      status: data.status,
      source: data.source,
      comment: data.comment,
      createdAt: data.createdAt,
      waitingPosition: data.waitingPosition ?? null,
      volunteer: data.volunteer,
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

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>{registrations.length === 0 ? "Aucune inscription." : "Aucun résultat."}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Bénévole</th>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 hidden sm:table-cell">Créneau</th>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 hidden md:table-cell">Source</th>
                <th scope="col" className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 hidden md:table-cell">Statut</th>
                <th scope="col" className="px-4 py-2.5"></th>
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
                  <td className="px-4 py-3 hidden md:table-cell">
                    {reg.status !== "active" && <StatusBadge status={reg.status} />}
                    {reg.status === "waiting" && reg.waitingPosition != null && (
                      <span className="ml-1 text-xs text-gray-400">#{reg.waitingPosition}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {reg.status === "active" && (
                      <button
                        onClick={() => handleCancel(reg.id)}
                        aria-label={`Annuler l'inscription de ${reg.volunteer.firstName} ${reg.volunteer.lastName}`}
                        className="text-xs text-red-400 hover:text-red-600 transition-colors"
                      >
                        Annuler
                      </button>
                    )}
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
