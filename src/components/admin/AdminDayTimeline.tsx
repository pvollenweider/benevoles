"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Link from "next/link"
import { getRoleAccent, getBarClasses } from "@/lib/roles"

// ── Constants ─────────────────────────────────────────────────────────────────
const PX_PER_MIN = 2.5
const SNAP       = 15
const ROW_H      = 48
const GAP        = 8
const LABEL_W    = 92
const HANDLE_W   = 8
const MIN_DUR    = 15
const AXIS_H     = 20
const SHOW_H     = 22

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
  displayOrder: number
  internalNotes?: string | null
  description?: string | null
}

type Show   = { name: string; date: string; startTime: string; endTime: string }
type Draft  = { roleName: string; startMin: number; endMin: number }
type Resize = { shiftId: string; side: "left" | "right"; origStart: number; origEnd: number }

interface Props {
  eventId:   string
  date:      string
  shifts:    AdminShift[]
  shows?:    Show[]
  roleOrder?: string[]   // global stable order from parent
  onCreated: (s: AdminShift) => void
  onUpdated: (s: AdminShift) => void
  onDeleted: (id: string)    => void
}

// ── Popover ───────────────────────────────────────────────────────────────────
function ShiftPopover({
  shift, anchor, eventId, onClose, onPatch, onDelete,
}: {
  shift:    AdminShift
  anchor:   { x: number; y: number; w: number }
  eventId:  string
  onClose:  () => void
  onPatch:  (id: string, data: Partial<AdminShift>) => void
  onDelete: (id: string) => void
}) {
  const [label, setLabel]       = useState(shift.label === shift.roleName ? "" : shift.label)
  const [capacity, setCapacity] = useState(shift.capacity)
  const [status, setStatus]     = useState(shift.status)
  const ref = useRef<HTMLDivElement>(null)

  // Sync latest values into refs so closeAndSave closure stays stable
  const labelRef    = useRef(label)
  const capacityRef = useRef(capacity)
  useEffect(() => { labelRef.current = label },    [label])
  useEffect(() => { capacityRef.current = capacity }, [capacity])

  const closeAndSave = useCallback(() => {
    onPatch(shift.id, {
      label:    labelRef.current.trim() || shift.roleName,
      capacity: capacityRef.current,
    })
    onClose()
  }, [shift.id, shift.roleName, onPatch, onClose])

  useEffect(() => {
    function onMD(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) closeAndSave()
    }
    document.addEventListener("mousedown", onMD)
    return () => document.removeEventListener("mousedown", onMD)
  }, [closeAndSave])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") closeAndSave() }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [closeAndSave])

  const POPW = 244
  const left = clamp(anchor.x + anchor.w / 2 - POPW / 2, 8, window.innerWidth - POPW - 8)
  const top  = anchor.y + ROW_H + 6

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-3 space-y-2.5"
      style={{ left, top, width: POPW }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getRoleAccent(shift.roleName)}`} />
          <span className="text-xs font-semibold text-gray-700 truncate">{shift.roleName}</span>
          <span className="text-[10px] text-gray-400 flex-shrink-0">
            {fmt(shift.startTime)}–{fmt(shift.endTime)}
          </span>
        </div>
        <button onClick={closeAndSave} className="text-gray-400 hover:text-gray-700 flex-shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div>
        <input
          type="text"
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder={shift.roleName}
          className="w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 placeholder-gray-300"
        />
        <p className="text-[9px] text-gray-400 mt-0.5 ml-0.5">
          Libellé — laisser vide si identique au poste
        </p>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-[10px] text-gray-500 flex-shrink-0">Places</label>
        <input
          type="number"
          min={Math.max(shift.registrationCount, 1)}
          value={capacity}
          onChange={e => setCapacity(Number(e.target.value))}
          className="w-14 text-xs border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 text-center"
        />
        <select
          value={status}
          onChange={e => { setStatus(e.target.value); onPatch(shift.id, { status: e.target.value }) }}
          className="flex-1 text-[10px] border border-gray-200 rounded-lg px-1.5 py-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="open">Ouvert</option>
          <option value="full">Complet</option>
          <option value="closed">Fermé</option>
          <option value="cancelled">Annulé</option>
        </select>
      </div>

      {shift.registrationCount > 0 && (
        <p className="text-[9px] text-orange-600">
          {shift.registrationCount} inscription{shift.registrationCount > 1 ? "s" : ""} existante{shift.registrationCount > 1 ? "s" : ""}
        </p>
      )}

      <Link
        href={`/admin/events/${eventId}/registrations?shift=${shift.id}`}
        className="block w-full text-center text-[10px] text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg py-1 transition-colors"
        onClick={onClose}
      >
        Voir les inscriptions →
      </Link>

      <button
        onClick={() => { if (confirm("Supprimer ce créneau ?")) onDelete(shift.id) }}
        className="w-full text-[10px] text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg py-1 transition-colors"
      >
        Supprimer le créneau
      </button>
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 bg-green-600 text-white text-xs font-medium px-3.5 py-2 rounded-xl shadow-lg pointer-events-none">
      ✓ {message}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminDayTimeline({ eventId, date, shifts, shows = [], roleOrder, onCreated, onUpdated, onDeleted }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  const [resizeOverlay, setResizeOverlay] = useState<Record<string, { startTime: string; endTime: string }>>({})
  const [draft,    setDraft]    = useState<Draft | null>(null)
  const [resize,   setResize]   = useState<Resize | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [anchor,   setAnchor]   = useState<{ x: number; y: number; w: number } | null>(null)
  const [toast,    setToast]    = useState<string | null>(null)

  const visible = shifts
    .filter(s => s.status !== "cancelled")
    .map(s => resizeOverlay[s.id] ? { ...s, ...resizeOverlay[s.id] } : s)

  // ── Time range (include show times) ────────────────────────────────────────
  const allMins = [
    ...visible.flatMap(s => [toMin(s.startTime), toMin(s.endTime)]),
    ...shows.flatMap(s => [toMin(s.startTime), toMin(s.endTime)]),
  ]
  const rawStart = allMins.length ? Math.min(...allMins) : 8 * 60
  const rawEnd   = allMins.length ? Math.max(...allMins) : 20 * 60
  const dayStart = Math.floor(rawStart / 60) * 60 - 60
  const dayEnd   = Math.ceil(rawEnd   / 60) * 60 + 60
  const span     = dayEnd - dayStart
  const totalW   = LABEL_W + span * PX_PER_MIN

  // ── Coordinate conversion ──────────────────────────────────────────────────
  const xToMin = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el) return dayStart
    const rect       = el.getBoundingClientRect()
    const scrollLeft = el.scrollLeft
    const localX     = clientX - rect.left + scrollLeft - LABEL_W
    return snapTo(clamp(dayStart + localX / PX_PER_MIN, dayStart, dayEnd))
  }, [dayStart, dayEnd])

  const px = (min: number) => (min - dayStart) * PX_PER_MIN

  // ── Role rows ─────────────────────────────────────────────────────────────
  const byRole: Record<string, AdminShift[]> = {}
  const roleMinOrder: Record<string, number> = {}
  for (const s of visible) {
    if (!byRole[s.roleName]) { byRole[s.roleName] = []; roleMinOrder[s.roleName] = s.displayOrder }
    byRole[s.roleName].push(s)
    if (s.displayOrder < roleMinOrder[s.roleName]) roleMinOrder[s.roleName] = s.displayOrder
  }
  // Use the global stable order from the parent when provided (avoids per-day inconsistency
  // when multiple roles share the same displayOrder value).
  const roles = roleOrder
    ? roleOrder.filter(r => !!byRole[r])
    : Object.keys(byRole).sort((a, b) => roleMinOrder[a] - roleMinOrder[b])

  const rowsH = roles.length * (ROW_H + GAP)

  // ── Create drag ─────────────────────────────────────────────────────────────
  function startCreate(roleName: string, e: React.MouseEvent) {
    e.preventDefault()
    setSelected(null)
    setDraft({ roleName, startMin: xToMin(e.clientX), endMin: xToMin(e.clientX) + SNAP })
  }

  // ── Resize drag ─────────────────────────────────────────────────────────────
  function startResize(shift: AdminShift, side: "left" | "right", e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setSelected(null)
    setResize({
      shiftId:   shift.id,
      side,
      origStart: toMin(shift.startTime),
      origEnd:   toMin(shift.endTime),
    })
  }

  // ── Global mouse move / up ──────────────────────────────────────────────────
  const onMouseMove = useCallback((e: MouseEvent) => {
    const cur = xToMin(e.clientX)
    if (draft) {
      setDraft(d => d ? { ...d, endMin: Math.max(d.startMin + SNAP, cur) } : null)
    }
    if (resize) {
      setResizeOverlay(prev => {
        const orig = shifts.find(s => s.id === resize.shiftId)
        if (!orig) return prev
        const startMin = toMin(orig.startTime)
        const endMin   = toMin(orig.endTime)
        if (resize.side === "right") {
          const newEnd = snapTo(clamp(cur, startMin + MIN_DUR, dayEnd))
          return { ...prev, [resize.shiftId]: { startTime: orig.startTime, endTime: fromMin(newEnd) } }
        } else {
          const newStart = snapTo(clamp(cur, dayStart, endMin - MIN_DUR))
          return { ...prev, [resize.shiftId]: { startTime: fromMin(newStart), endTime: orig.endTime } }
        }
      })
    }
  }, [draft, resize, xToMin, shifts, dayStart, dayEnd])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2000)
  }, [])

  const onMouseUp = useCallback(async () => {
    if (resize) {
      const overlay = resizeOverlay[resize.shiftId]
      const orig    = shifts.find(s => s.id === resize.shiftId)
      if (orig && overlay) {
        const res = await fetch(`/api/admin/shifts/${resize.shiftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startTime: overlay.startTime, endTime: overlay.endTime }),
        })
        if (res.ok) { onUpdated({ ...orig, ...overlay }); showToast("Horaires mis à jour") }
      }
      setResizeOverlay({})
      setResize(null)
      return
    }
    if (draft && draft.endMin - draft.startMin >= MIN_DUR) {
      const res = await fetch("/api/admin/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          roleName:  draft.roleName,
          label:     draft.roleName,
          date,
          startTime: fromMin(draft.startMin),
          endTime:   fromMin(draft.endMin),
          capacity:  2,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const created: AdminShift = {
          ...data,
          date: (data.date as string).split("T")[0],
          registrationCount: 0,
        }
        onCreated(created)
        setTimeout(() => openPopover(created.id), 60)
      }
    }
    setDraft(null)
  }, [draft, resize, resizeOverlay, shifts, eventId, date, onCreated, onUpdated, showToast])

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
    const orig = shifts.find(s => s.id === id)
    if (!orig) return
    const patch = { ...data, label: data.label?.trim() || orig.roleName }
    const res = await fetch(`/api/admin/shifts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (res.ok) { onUpdated({ ...orig, ...patch }); showToast("Enregistré") }
  }

  async function handleDelete(id: string) {
    setSelected(null)
    const res = await fetch(`/api/admin/shifts/${id}`, { method: "DELETE" })
    if (res.ok) onDeleted(id)
  }

  // ── Hour ticks ──────────────────────────────────────────────────────────────
  const hours: number[] = []
  for (let h = Math.ceil(dayStart / 60); h <= Math.floor(dayEnd / 60); h++) hours.push(h)

  const selectedShift = selected ? visible.find(s => s.id === selected) : null
  const hasShows      = shows.length > 0

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <div
        ref={containerRef}
        className="overflow-x-auto select-none rounded-xl border border-gray-100 bg-white"
      >
        <div style={{ width: totalW + 24, paddingTop: 10, paddingBottom: 0, paddingLeft: 12, paddingRight: 12 }}>
          <div className="relative" style={{ width: totalW }}>

            {/* Hour grid */}
            {hours.map(h => (
              <div
                key={h}
                className="absolute top-0 bottom-0 border-l border-gray-100 pointer-events-none"
                style={{ left: LABEL_W + (h * 60 - dayStart) * PX_PER_MIN }}
              />
            ))}

            {/* Show bands — full-height indigo strips behind rows */}
            {shows.map((show, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 bg-indigo-50 border-x border-indigo-100 pointer-events-none z-0"
                style={{
                  left:  LABEL_W + px(toMin(show.startTime)),
                  width: Math.max((toMin(show.endTime) - toMin(show.startTime)) * PX_PER_MIN, 2),
                }}
              />
            ))}

            {/* Sticky label column */}
            <div
              className="absolute top-0 left-0 flex flex-col z-10"
              style={{ width: LABEL_W, background: "white" }}
            >
              {roles.map(role => (
                <div
                  key={role}
                  className="flex items-center justify-end pr-2 shrink-0"
                  style={{ height: ROW_H, marginBottom: GAP }}
                >
                  <span className="text-[10px] text-gray-500 truncate text-right leading-tight max-w-full">
                    {role.split(" &")[0].trim()}
                  </span>
                </div>
              ))}
              <div style={{ height: AXIS_H }} />
              {hasShows && (
                <div className="flex items-center justify-end pr-2" style={{ height: SHOW_H }}>
                  <span className="text-[9px] text-indigo-400">Spectacles</span>
                </div>
              )}
            </div>

            {/* Role rows */}
            {roles.map((role, rowIdx) => {
              const rowTop = rowIdx * (ROW_H + GAP)
              return (
                <div
                  key={role}
                  className="absolute cursor-crosshair"
                  style={{ left: LABEL_W, top: rowTop, width: span * PX_PER_MIN, height: ROW_H }}
                  onMouseDown={e => {
                    const target = e.target as HTMLElement
                    if (target.closest("[data-shift-bar]")) return
                    startCreate(role, e)
                  }}
                >
                  {/* Shifts */}
                  {(byRole[role] ?? []).map(shift => {
                    const startMin   = toMin(shift.startTime)
                    const endMin     = toMin(shift.endTime)
                    const barLeft    = px(startMin)
                    const barWidth   = Math.max((endMin - startMin) * PX_PER_MIN, 4)
                    const isSelected = selected === shift.id
                    const isFull     = shift.status === "full" || shift.registrationCount >= shift.capacity
                    const barCls     = getBarClasses(shift.roleName, isSelected ? "selected" : "default")
                    const hasLabel   = shift.label && shift.label !== shift.roleName

                    return (
                      <div
                        key={shift.id}
                        id={`shift-bar-${shift.id}`}
                        data-shift-bar="1"
                        className={`absolute inset-y-1.5 rounded-lg cursor-pointer overflow-hidden
                          flex items-center transition-shadow
                          ${isSelected ? "shadow-md" : "hover:shadow-sm"} ${barCls}`}
                        style={{
                          left: barLeft,
                          width: barWidth,
                          ...(isFull ? {
                            backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.3) 5px, rgba(255,255,255,0.3) 7px)",
                          } : {}),
                        }}
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); openPopover(shift.id) }}
                      >
                        <div className="flex flex-col justify-center px-2 overflow-hidden w-full">
                          <span
                            className="text-white text-[9px] font-bold leading-none truncate"
                            style={{ textShadow: "0 1px 2px rgba(0,0,0,.3)" }}
                          >
                            {fmt(shift.startTime)}–{fmt(shift.endTime)}
                          </span>
                          {hasLabel && (
                            <span className="text-white/80 text-[8px] leading-none truncate mt-0.5">
                              {shift.label}
                            </span>
                          )}
                          <span className="text-white/70 text-[8px] leading-none mt-0.5">
                            {shift.registrationCount}/{shift.capacity}
                            {shift.capacity - shift.registrationCount > 0
                              ? ` · ${shift.capacity - shift.registrationCount} libre`
                              : " · Complet"}
                          </span>
                        </div>

                        {/* Left resize handle */}
                        <div
                          className="absolute left-0 inset-y-0 cursor-ew-resize z-10 flex items-center"
                          style={{ width: HANDLE_W }}
                          onMouseDown={e => startResize(shift, "left", e)}
                        >
                          <div className="w-px h-4 bg-white/40 rounded-full mx-auto" />
                        </div>

                        {/* Right resize handle */}
                        <div
                          className="absolute right-0 inset-y-0 cursor-ew-resize z-10 flex items-center"
                          style={{ width: HANDLE_W }}
                          onMouseDown={e => startResize(shift, "right", e)}
                        >
                          <div className="w-px h-4 bg-white/40 rounded-full mx-auto" />
                        </div>
                      </div>
                    )
                  })}

                  {/* Ghost bar during create */}
                  {draft?.roleName === role && (
                    <div
                      className="absolute inset-y-1.5 rounded-lg border-2 border-blue-400 border-dashed pointer-events-none flex items-center justify-center"
                      style={{
                        left:  px(draft.startMin),
                        width: Math.max((draft.endMin - draft.startMin) * PX_PER_MIN, 2),
                        background: "rgba(96,165,250,0.25)",
                      }}
                    >
                      <span className="text-[9px] text-blue-700 font-medium px-1 truncate">
                        {fmt(fromMin(draft.startMin))}–{fmt(fromMin(draft.endMin))}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Spacer */}
            <div style={{ height: rowsH }} />

            {/* Time axis */}
            <div className="relative border-t border-gray-100" style={{ height: AXIS_H }}>
              {hours.map(h => (
                <div
                  key={h}
                  className="absolute top-1 text-[10px] text-gray-400 leading-none"
                  style={{
                    left: LABEL_W + (h * 60 - dayStart) * PX_PER_MIN,
                    transform: "translateX(-50%)",
                  }}
                >
                  {h}h
                </div>
              ))}
            </div>

            {/* Show labels row */}
            {hasShows && (
              <div className="relative border-t border-indigo-50" style={{ height: SHOW_H }}>
                {shows.map((show, i) => (
                  <div
                    key={i}
                    className="absolute inset-y-1 flex items-center px-1.5 rounded-md bg-indigo-50 text-[9px] text-indigo-700 truncate pointer-events-none"
                    style={{
                      left:  LABEL_W + px(toMin(show.startTime)),
                      width: Math.max((toMin(show.endTime) - toMin(show.startTime)) * PX_PER_MIN, 48),
                    }}
                  >
                    🎪 {show.name} · {fmt(show.startTime)}–{fmt(show.endTime)}
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      </div>

      {selectedShift && anchor && (
        <ShiftPopover
          shift={selectedShift}
          anchor={anchor}
          eventId={eventId}
          onClose={() => setSelected(null)}
          onPatch={handlePatch}
          onDelete={handleDelete}
        />
      )}

      {toast && <Toast message={toast} />}
    </>
  )
}
