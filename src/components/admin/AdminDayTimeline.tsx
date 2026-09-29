"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { getBarClasses } from "@/lib/roles"
import { toMin, toMinEnd, fromMin, fmt, hourLabel, type GanttShow } from "@/lib/gantt-utils"
import {
  AXIS_H, GAP, HANDLE_W, LABEL_W, LANE_GAP, MIN_DUR, PX_PER_MIN, ROW_H, SHOW_H,
  dayRange, draftEnd, draftStart, hourTicks, layoutRoles, offsetToMin, resizedTimes,
} from "@/lib/day-timeline"
import ShiftPopover from "./day-timeline/ShiftPopover"
import Toast from "./day-timeline/Toast"

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
  waitlistEnabled?: boolean
  minAge?: number | null
  colorKey?: string | null
}

type Show = GanttShow
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
  const { dayStart, dayEnd } = dayRange([...visible, ...shows])
  const span     = dayEnd - dayStart
  const totalW   = LABEL_W + span * PX_PER_MIN

  // ── Coordinate conversion ──────────────────────────────────────────────────
  const xToMin = useCallback((clientX: number) => {
    const el = containerRef.current
    if (!el) return dayStart
    const rect       = el.getBoundingClientRect()
    const scrollLeft = el.scrollLeft
    const localX     = clientX - rect.left + scrollLeft - LABEL_W
    return offsetToMin(localX, dayStart, dayEnd)
  }, [dayStart, dayEnd])

  const px = (min: number) => (min - dayStart) * PX_PER_MIN

  // ── Role rows ─────────────────────────────────────────────────────────────
  const { roles, byRole, roleLane, roleHeight, roleTop, rowsH } = layoutRoles(visible, roleOrder)

  // ── Create drag ─────────────────────────────────────────────────────────────
  function startCreate(roleName: string, e: React.MouseEvent) {
    e.preventDefault()
    setSelected(null)
    const startMin = draftStart(xToMin(e.clientX))
    setDraft({ roleName, startMin, endMin: draftEnd(startMin, startMin) })
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
      setDraft(d => d ? { ...d, endMin: draftEnd(d.startMin, cur) } : null)
    }
    if (resize) {
      setResizeOverlay(prev => {
        const orig = shifts.find(s => s.id === resize.shiftId)
        if (!orig) return prev
        return { ...prev, [resize.shiftId]: resizedTimes(orig, resize.side, cur, { dayStart, dayEnd }) }
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
  const hours = hourTicks(dayStart, dayEnd)

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
                  style={{ height: roleHeight[role], marginBottom: GAP }}
                >
                  <span
                    className="text-[10px] text-gray-500 line-clamp-2 text-right leading-tight max-w-full"
                    title={role}
                  >
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
            {roles.map(role => {
              const rowTop = roleTop[role]
              return (
                <div
                  key={role}
                  className="absolute cursor-crosshair"
                  style={{ left: LABEL_W, top: rowTop, width: span * PX_PER_MIN, height: roleHeight[role] }}
                  onMouseDown={e => {
                    const target = e.target as HTMLElement
                    if (target.closest("[data-shift-bar]")) return
                    startCreate(role, e)
                  }}
                >
                  {/* Shifts */}
                  {(byRole[role] ?? []).map(shift => {
                    const startMin   = toMin(shift.startTime)
                    const endMin     = toMinEnd(shift.endTime, shift.startTime)
                    const barLeft    = px(startMin)
                    const barWidth   = Math.max((endMin - startMin) * PX_PER_MIN, 4)
                    const laneTop    = roleLane[role][shift.id] * (ROW_H + LANE_GAP)
                    const isSelected = selected === shift.id
                    const isFull     = shift.status === "full" || shift.registrationCount >= shift.capacity
                    const barCls     = getBarClasses(shift.roleName, isSelected ? "selected" : "default", shift.colorKey)
                    const hasLabel   = shift.label && shift.label !== shift.roleName

                    return (
                      <div
                        key={shift.id}
                        id={`shift-bar-${shift.id}`}
                        data-shift-bar="1"
                        className={`absolute rounded-lg cursor-pointer overflow-hidden
                          flex items-center transition-shadow
                          ${isSelected ? "shadow-md" : "hover:shadow-sm"} ${barCls}`}
                        style={{
                          left: barLeft,
                          width: barWidth,
                          top: laneTop + 6,
                          height: ROW_H - 12,
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
                      className="absolute rounded-lg border-2 border-blue-400 border-dashed pointer-events-none flex items-center justify-center"
                      style={{
                        left:  px(draft.startMin),
                        width: Math.max((draft.endMin - draft.startMin) * PX_PER_MIN, 2),
                        top:   6,
                        height: ROW_H - 12,
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
                  className="absolute top-1 text-[10px] text-gray-500 leading-none"
                  style={{
                    left: LABEL_W + (h * 60 - dayStart) * PX_PER_MIN,
                    transform: "translateX(-50%)",
                  }}
                >
                  {hourLabel(h)}
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
