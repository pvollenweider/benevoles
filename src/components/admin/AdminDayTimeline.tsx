"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { getRoleAccent } from "@/lib/roles"

// ── Constants ─────────────────────────────────────────────────────────────────
const PX_PER_MIN = 2.5     // 150 px / h
const SNAP       = 15      // minutes
const ROW_H      = 48
const GAP        = 8
const LABEL_W    = 92
const HANDLE_W   = 8
const MIN_DUR    = 15      // minimum shift duration
const AXIS_H     = 20

// ── Helpers ───────────────────────────────────────────────────────────────────
function toMin(t: string) {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}
function fromMin(n: number) {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`
}
function snapTo(n: number) { return Math.round(n / SNAP) * SNAP }
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)) }
function fmt(t: string) {
  const [h, m] = t.split(":")
  return m === "00" ? `${h}h` : `${h}h${m}`
}

// ── Types ─────────────────────────────────────────────────────────────────────
export type AdminShift = {
  id: string
  roleName: string
  label: string
  date: string
  startTime: string
  endTime: string
  capacity: number
  status: string
  registrationCount: number
  internalNotes?: string | null
  description?: string | null
}

type Draft  = { roleName: string; startMin: number; endMin: number }
type Resize = { shiftId: string; side: "left" | "right"; origStart: number; origEnd: number; mouseX: number }

interface Props {
  eventId:  string
  date:     string
  shifts:   AdminShift[]
  onCreated: (s: AdminShift) => void
  onUpdated: (s: AdminShift) => void
  onDeleted: (id: string)    => void
}

// ── Popover form ──────────────────────────────────────────────────────────────
function ShiftPopover({
  shift, anchor, onClose, onPatch, onDelete,
}: {
  shift:    AdminShift
  anchor:   { x: number; y: number; w: number }
  onClose:  () => void
  onPatch:  (id: string, data: Partial<AdminShift>) => void
  onDelete: (id: string) => void
}) {
  const [label, setLabel]       = useState(shift.label === shift.roleName ? "" : shift.label)
  const [capacity, setCapacity] = useState(shift.capacity)
  const [status, setStatus]     = useState(shift.status)
  const ref = useRef<HTMLDivElement>(null)

  // close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  // close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [onClose])

  function save(patch: Partial<AdminShift>) { onPatch(shift.id, patch) }

  const popW = 240
  // position: below the bar, centered, clamped to viewport
  const left = clamp(anchor.x + anchor.w / 2 - popW / 2, 8, window.innerWidth - popW - 8)
  const top  = anchor.y + ROW_H + 6

  const statusOpts: { v: string; label: string }[] = [
    { v: "open",      label: "Ouvert" },
    { v: "full",      label: "Complet" },
    { v: "closed",    label: "Fermé" },
    { v: "cancelled", label: "Annulé" },
  ]

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-3 space-y-2.5"
      style={{ left, top, width: popW }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getRoleAccent(shift.roleName)}`} />
          <span className="text-xs font-semibold text-gray-700 truncate">{shift.roleName}</span>
          <span className="text-[10px] text-gray-400 flex-shrink-0">{fmt(shift.startTime)}–{fmt(shift.endTime)}</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700 flex-shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Label */}
      <div>
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onBlur={() => save({ label: label.trim() || shift.roleName })}
          placeholder={shift.roleName}
          className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-300"
        />
        <p className="text-[9px] text-gray-400 mt-0.5 ml-0.5">Libellé (laisser vide = identique au poste)</p>
      </div>

      {/* Capacity + Status */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1">
          <span className="text-[10px] text-gray-500 flex-shrink-0">Places</span>
          <input
            type="number"
            min={shift.registrationCount || 1}
            value={capacity}
            onChange={e => setCapacity(Number(e.target.value))}
            onBlur={() => save({ capacity })}
            className="w-14 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 text-center"
          />
        </div>
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); save({ status: e.target.value }) }}
          className="text-[10px] border border-gray-200 rounded-lg px-1.5 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400 flex-1"
        >
          {statusOpts.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
        </select>
      </div>

      {/* Registered count info */}
      {shift.registrationCount > 0 && (
        <p className="text-[9px] text-orange-600">
          {shift.registrationCount} inscription{shift.registrationCount > 1 ? "s" : ""} existante{shift.registrationCount > 1 ? "s" : ""}
        </p>
      )}

      {/* Delete */}
      <button
        onClick={() => { if (confirm("Supprimer ce créneau ?")) onDelete(shift.id) }}
        className="w-full text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg py-1 transition-colors"
      >
        Supprimer le créneau
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminDayTimeline({ eventId, date, shifts, onCreated, onUpdated, onDeleted }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Local copy for optimistic updates — sync when parent pushes new shifts
  const [local, setLocal] = useState<AdminShift[]>(shifts)
  const prevShiftsRef = useRef(shifts)
  useEffect(() => {
    if (prevShiftsRef.current !== shifts) {
      prevShiftsRef.current = shifts
      setTimeout(() => setLocal(shifts), 0)
    }
  }, [shifts])

  const [selected, setSelected]     = useState<string | null>(null)
  const [anchor, setAnchor]         = useState<{ x: number; y: number; w: number } | null>(null)
  const [draft, setDraft]           = useState<Draft | null>(null)
  const [resize, setResize]         = useState<Resize | null>(null)

  // ── Time range ──────────────────────────────────────────────────────────────
  const allMins = local.flatMap(s => [toMin(s.startTime), toMin(s.endTime)])
  const rawStart = allMins.length ? Math.min(...allMins) : 8 * 60
  const rawEnd   = allMins.length ? Math.max(...allMins) : 20 * 60
  const dayStart = Math.floor(rawStart / 60) * 60 - 60   // 1h buffer before
  const dayEnd   = Math.ceil(rawEnd   / 60) * 60 + 60    // 1h buffer after
  const span     = dayEnd - dayStart
  const totalW   = LABEL_W + span * PX_PER_MIN

  // ── Coordinate helpers ──────────────────────────────────────────────────────
  const xToMin = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return dayStart
    const scrollLeft = containerRef.current?.scrollLeft ?? 0
    const localX = clientX - rect.left + scrollLeft - LABEL_W
    return snapTo(clamp(dayStart + localX / PX_PER_MIN, dayStart, dayEnd))
  }, [dayStart, dayEnd])

  const px = (min: number) => (min - dayStart) * PX_PER_MIN

  // ── Role rows ───────────────────────────────────────────────────────────────
  const roles: string[] = []
  const byRole: Record<string, AdminShift[]> = {}
  for (const s of local.filter(s => s.status !== "cancelled")) {
    if (!byRole[s.roleName]) { roles.push(s.roleName); byRole[s.roleName] = [] }
    byRole[s.roleName].push(s)
  }

  // ── Mouse handlers ───────────────────────────────────────────────────────────

  // Create: drag on empty row area
  function startCreate(roleName: string, e: React.MouseEvent) {
    e.preventDefault()
    setSelected(null)
    const startMin = xToMin(e.clientX)
    setDraft({ roleName, startMin, endMin: startMin + SNAP })
  }

  // Resize: drag on handle
  function startResize(shift: AdminShift, side: "left" | "right", e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setSelected(null)
    setResize({
      shiftId:   shift.id,
      side,
      origStart: toMin(shift.startTime),
      origEnd:   toMin(shift.endTime),
      mouseX:    e.clientX,
    })
  }

  // Global mouse move
  const onMouseMove = useCallback((e: MouseEvent) => {
    if (draft) {
      const endMin = xToMin(e.clientX)
      setDraft(d => d ? { ...d, endMin: Math.max(d.startMin + SNAP, endMin) } : null)
    }
    if (resize) {
      const cur  = xToMin(e.clientX)
      setLocal(prev => prev.map(s => {
        if (s.id !== resize.shiftId) return s
        if (resize.side === "right") {
          const newEnd = clamp(cur, toMin(s.startTime) + MIN_DUR, dayEnd)
          return { ...s, endTime: fromMin(snapTo(newEnd)) }
        } else {
          const newStart = clamp(cur, dayStart, toMin(s.endTime) - MIN_DUR)
          return { ...s, startTime: fromMin(snapTo(newStart)) }
        }
      }))
    }
  }, [draft, resize, xToMin, dayStart, dayEnd])

  // Global mouse up
  const onMouseUp = useCallback(async () => {
    // Finalize resize
    if (resize) {
      const s = local.find(x => x.id === resize.shiftId)
      if (s) {
        const res = await fetch(`/api/admin/shifts/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startTime: s.startTime, endTime: s.endTime }),
        })
        if (res.ok) onUpdated({ ...s, ...await res.json() })
      }
      setResize(null)
      return
    }
    // Finalize create
    if (draft && draft.endMin - draft.startMin >= MIN_DUR) {
      const body = {
        eventId,
        roleName:  draft.roleName,
        label:     draft.roleName,
        date,
        startTime: fromMin(draft.startMin),
        endTime:   fromMin(draft.endMin),
        capacity:  2,
      }
      const res = await fetch("/api/admin/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const created: AdminShift = { ...await res.json(), registrationCount: 0 }
        onCreated(created)
        // select the new shift → open popover
        setTimeout(() => openPopover(created.id), 50)
      }
    }
    setDraft(null)
  }, [draft, resize, local, eventId, date, onCreated, onUpdated])

  useEffect(() => {
    if (!draft && !resize) return
    window.addEventListener("mousemove", onMouseMove)
    window.addEventListener("mouseup",   onMouseUp)
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      window.removeEventListener("mouseup",   onMouseUp)
    }
  }, [draft, resize, onMouseMove, onMouseUp])

  // ── Popover ──────────────────────────────────────────────────────────────────
  function openPopover(id: string) {
    const el = document.getElementById(`shift-bar-${id}`)
    if (!el) return
    const r = el.getBoundingClientRect()
    setAnchor({ x: r.left, y: r.top, w: r.width })
    setSelected(id)
  }

  async function handlePatch(id: string, data: Partial<AdminShift>) {
    const cur = local.find(s => s.id === id)
    if (!cur) return
    const patch = { ...data }
    if (!patch.label || patch.label.trim() === "") patch.label = cur.roleName
    setLocal(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
    const res = await fetch(`/api/admin/shifts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (res.ok) onUpdated({ ...cur, ...patch, ...await res.json() })
  }

  async function handleDelete(id: string) {
    setSelected(null)
    setLocal(prev => prev.filter(s => s.id !== id))
    await fetch(`/api/admin/shifts/${id}`, { method: "DELETE" })
    onDeleted(id)
  }

  // ── Hours axis ───────────────────────────────────────────────────────────────
  const hours: number[] = []
  for (let h = dayStart / 60; h <= dayEnd / 60; h++) hours.push(h)

  const selectedShift = selected ? local.find(s => s.id === selected) : null

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <div ref={containerRef} className="overflow-x-auto select-none rounded-xl border border-gray-100 bg-white">
        <div style={{ width: totalW + 24, padding: "12px 12px 0" }}>
          <div className="relative" style={{ width: totalW }}>

            {/* Label column */}
            <div className="absolute top-0 left-0 flex flex-col z-10 bg-white" style={{ width: LABEL_W }}>
              {roles.map(role => (
                <div
                  key={role}
                  className="flex items-center justify-end pr-2"
                  style={{ height: ROW_H, marginBottom: GAP }}
                >
                  <span className="text-[10px] text-gray-500 truncate text-right leading-tight">
                    {role.split(" &")[0].trim()}
                  </span>
                </div>
              ))}
              <div style={{ height: AXIS_H }} />
            </div>

            {/* Hour grid lines */}
            {hours.map(h => (
              <div
                key={h}
                className="absolute top-0 border-l border-gray-100 pointer-events-none"
                style={{ left: LABEL_W + (h * 60 - dayStart) * PX_PER_MIN, bottom: AXIS_H }}
              />
            ))}

            {/* Role rows */}
            {roles.map((role, rowIdx) => {
              const top = rowIdx * (ROW_H + GAP)
              return (
                <div
                  key={role}
                  className="absolute cursor-crosshair"
                  style={{ left: LABEL_W, top, width: span * PX_PER_MIN, height: ROW_H }}
                  onMouseDown={e => { if ((e.target as HTMLElement).dataset.handle) return; startCreate(role, e) }}
                >
                  {/* Row background */}
                  <div className="absolute inset-0 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors" />

                  {/* Existing shifts */}
                  {(byRole[role] ?? []).map(shift => {
                    const startMin = toMin(shift.startTime)
                    const endMin   = toMin(shift.endTime)
                    const left     = px(startMin)
                    const width    = Math.max((endMin - startMin) * PX_PER_MIN, 4)
                    const isSelected = selected === shift.id
                    const accentCls  = getRoleAccent(shift.roleName).replace("bg-", "bg-").replace("-400", "-500")
                    const hasCustomLabel = shift.label && shift.label !== shift.roleName

                    return (
                      <div
                        key={shift.id}
                        id={`shift-bar-${shift.id}`}
                        className={`absolute inset-y-1 rounded-lg cursor-pointer flex items-center overflow-hidden transition-shadow ${
                          isSelected
                            ? "ring-2 ring-offset-1 ring-blue-400 shadow-md"
                            : "hover:shadow-sm"
                        }`}
                        style={{ left, width }}
                        onClick={e => { e.stopPropagation(); openPopover(shift.id) }}
                      >
                        {/* Color bar */}
                        <div className={`absolute inset-0 ${accentCls} opacity-80 rounded-lg`} />

                        {/* Content */}
                        <div className="relative z-10 flex flex-col justify-center px-2 max-w-full overflow-hidden">
                          <span className="text-white text-[9px] font-bold leading-none truncate" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.3)" }}>
                            {fmt(shift.startTime)}–{fmt(shift.endTime)}
                          </span>
                          {hasCustomLabel && (
                            <span className="text-white/80 text-[8px] leading-none truncate mt-0.5">{shift.label}</span>
                          )}
                          <span className="text-white/70 text-[8px] leading-none mt-0.5">
                            {shift.capacity} pl.{shift.registrationCount > 0 ? ` · ${shift.registrationCount}✓` : ""}
                          </span>
                        </div>

                        {/* Left resize handle */}
                        <div
                          data-handle="left"
                          className="absolute left-0 inset-y-0 cursor-ew-resize z-20 flex items-center"
                          style={{ width: HANDLE_W }}
                          onMouseDown={e => startResize(shift, "left", e)}
                        >
                          <div className="w-0.5 h-3 bg-white/50 rounded-full mx-auto" />
                        </div>

                        {/* Right resize handle */}
                        <div
                          data-handle="right"
                          className="absolute right-0 inset-y-0 cursor-ew-resize z-20 flex items-center"
                          style={{ width: HANDLE_W }}
                          onMouseDown={e => startResize(shift, "right", e)}
                        >
                          <div className="w-0.5 h-3 bg-white/50 rounded-full mx-auto" />
                        </div>
                      </div>
                    )
                  })}

                  {/* Draft ghost bar */}
                  {draft?.roleName === role && (
                    <div
                      className="absolute inset-y-1 bg-blue-300/60 rounded-lg border-2 border-blue-400 border-dashed pointer-events-none"
                      style={{
                        left:  px(Math.min(draft.startMin, draft.endMin)),
                        width: Math.abs(draft.endMin - draft.startMin) * PX_PER_MIN,
                      }}
                    >
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] text-blue-700 font-medium">
                        {fmt(fromMin(Math.min(draft.startMin, draft.endMin)))}–{fmt(fromMin(Math.max(draft.startMin, draft.endMin)))}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Spacer */}
            <div style={{ height: roles.length * (ROW_H + GAP) + GAP }} />

            {/* Time axis */}
            <div className="relative border-t border-gray-100" style={{ height: AXIS_H }}>
              {hours.map(h => (
                <div
                  key={h}
                  className="absolute top-1 text-[10px] text-gray-400 leading-none"
                  style={{ left: LABEL_W + (h * 60 - dayStart) * PX_PER_MIN, transform: "translateX(-50%)" }}
                >
                  {h}h
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Popover */}
      {selectedShift && anchor && (
        <ShiftPopover
          shift={selectedShift}
          anchor={anchor}
          onClose={() => setSelected(null)}
          onPatch={handlePatch}
          onDelete={handleDelete}
        />
      )}
    </>
  )
}
