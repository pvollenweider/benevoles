"use client"

import { getBarClasses } from "@/lib/roles"
import { toMin, toMinEnd, fmt, type GanttShow } from "@/lib/gantt-utils"

export { fmt }

export type TimelineShift = {
  id: string
  roleName: string
  label: string
  startTime: string
  endTime: string
  status: string
  spotsLeft: number
  displayOrder?: number
  waitlistEnabled?: boolean
}

type Show = GanttShow

const ROW_H   = 44
const GAP     = 4
const LABEL_W = 72
const SHOW_H  = 22
const AXIS_H  = 18

export default function DayTimeline({
  shifts,
  shows,
  selected,
  registered,
  conflicts,
  onToggle,
}: {
  shifts: TimelineShift[]
  shows: Show[]
  selected: Set<string>
  registered?: Set<string>
  conflicts?: Set<string>
  onToggle: (id: string, status: string) => void
}) {
  const visible = shifts.filter((s) => s.status !== "cancelled")
  if (visible.length === 0) return null

  const allMins = [
    ...visible.flatMap((s) => [toMin(s.startTime), toMinEnd(s.endTime, s.startTime)]),
    ...shows.flatMap((s) => [toMin(s.startTime), toMinEnd(s.endTime, s.startTime)]),
  ]
  const dayStart = Math.floor(Math.min(...allMins) / 60) * 60
  const dayEnd   = Math.ceil(Math.max(...allMins)  / 60) * 60
  const span     = dayEnd - dayStart

  const maxShiftDuration = Math.max(...visible.map(s => toMin(s.endTime) - toMin(s.startTime)))
  const pxPerMin = 180 / (maxShiftDuration + 60)  // widest shift + 30 min de chaque côté ≈ 180 px
  const totalW   = Math.round(LABEL_W + span * pxPerMin)

  const px  = (min: number) => LABEL_W + (min - dayStart) * pxPerMin
  const pxW = (s: number, e: number) => Math.max((e - s) * pxPerMin, 2)

  const byRole: Record<string, TimelineShift[]> = {}
  const roleMinOrder: Record<string, number> = {}
  for (const s of visible) {
    if (!byRole[s.roleName]) { byRole[s.roleName] = []; roleMinOrder[s.roleName] = s.displayOrder ?? 0 }
    byRole[s.roleName].push(s)
    if ((s.displayOrder ?? 0) < roleMinOrder[s.roleName]) roleMinOrder[s.roleName] = s.displayOrder ?? 0
  }
  const roleOrder = Object.keys(byRole).sort((a, b) => roleMinOrder[a] - roleMinOrder[b])

  const hours: number[] = []
  for (let h = dayStart / 60; h <= dayEnd / 60; h++) hours.push(h)

  const pxLocal = (min: number) => (min - dayStart) * pxPerMin

  return (
    <div className="mb-5 rounded-xl border border-gray-100 bg-white overflow-x-auto select-none">
      <div style={{ width: totalW + 24 }} className="p-3">
        <div className="relative" style={{ width: totalW }}>

          {/* Full-height show bands */}
          {shows.map((show, i) => (
            <div
              key={i}
              className="absolute inset-y-0 bg-indigo-50 border-x border-indigo-100 pointer-events-none z-0"
              style={{
                left:  px(toMin(show.startTime)),
                width: pxW(toMin(show.startTime), toMin(show.endTime)),
              }}
            />
          ))}

          {/* Label column (sticky-left visual) */}
          <div className="absolute top-0 left-0 flex flex-col z-10" style={{ width: LABEL_W }}>
            {roleOrder.map((role) => (
              <div
                key={role}
                className="flex items-center justify-end pr-2 bg-white"
                style={{ height: ROW_H, marginBottom: GAP }}
              >
                <span className="text-[10px] text-gray-600 truncate leading-tight text-right">
                  {role.split(" &")[0].split(" —")[0].trim()}
                </span>
              </div>
            ))}
            <div style={{ height: SHOW_H + AXIS_H }} />
          </div>

          {/* Shift rows */}
          {roleOrder.map((role, rowIdx) => (
            <div
              key={role}
              className="absolute"
              style={{
                left: LABEL_W,
                top: rowIdx * (ROW_H + GAP),
                width: span * pxPerMin,
                height: ROW_H,
              }}
            >
              {byRole[role].map((shift) => {
                const isRegistered    = registered?.has(shift.id) ?? false
                const isConflict      = conflicts?.has(shift.id) ?? false
                const isFull          = shift.status === "full"
                const isClosed        = shift.status === "closed"
                const isWaitlistable  = isFull && (shift.waitlistEnabled ?? false)
                const unavail         = (isFull && !isWaitlistable) || isClosed
                const isSelected      = selected.has(shift.id)
                const state           = isSelected ? "selected" : (isConflict || unavail) ? "unavailable" : "default"
                const barCls          = getBarClasses(shift.roleName, state)
                const clickable       = !isRegistered && !isConflict && !unavail
                const hasLabel        = shift.label !== shift.roleName
                const startMin        = toMin(shift.startTime)
                const endMin          = toMinEnd(shift.endTime, shift.startTime)
                const LABEL_H         = 14
                const timeLabel       = `${fmt(shift.startTime)}–${fmt(shift.endTime)}`
                const ariaLabel       = isWaitlistable
                  ? (isSelected
                    ? `Retirer de la file d'attente — ${shift.roleName} ${timeLabel}`
                    : `Rejoindre la file d'attente — ${shift.roleName} ${timeLabel}`)
                  : (isSelected
                    ? `Désélectionner — ${shift.roleName} ${timeLabel}`
                    : `Sélectionner — ${shift.roleName} ${timeLabel}`)

                return (
                  <div
                    key={shift.id}
                    className="absolute inset-y-0"
                    style={{ left: pxLocal(startMin), width: pxW(startMin, endMin) }}
                  >
                    <button
                      disabled={!clickable}
                      aria-pressed={clickable ? isSelected : undefined}
                      aria-label={ariaLabel}
                      onClick={() => onToggle(shift.id, shift.status)}
                      className={`absolute inset-x-0 rounded flex items-center justify-center overflow-hidden transition-colors ${clickable ? "cursor-pointer" : "cursor-default"} ${barCls}`}
                      style={{
                        top: 0,
                        bottom: (hasLabel || (isWaitlistable && !isSelected)) ? LABEL_H : 0,
                        borderLeft: (isFull && !isWaitlistable) ? "3px solid rgba(0,0,0,0.08)" : "4px solid rgba(255,255,255,0.7)",
                        ...((isFull && !isWaitlistable) ? {
                          backgroundColor: "white",
                          backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(0,0,0,0.06) 6px, rgba(0,0,0,0.06) 8px)",
                          outline: "1px solid rgba(0,0,0,0.07)",
                        } : {}),
                        ...(isWaitlistable && !isSelected ? {
                          backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.35) 5px, rgba(255,255,255,0.35) 7px)",
                        } : {}),
                      }}
                    >
                      {isConflict || (unavail && !isSelected) ? (
                        <span className="text-[8px] px-1 truncate leading-none text-gray-600">
                          {isFull ? "Complet" : isClosed ? "Fermé" : ""}
                        </span>
                      ) : (
                        <div className="flex items-center gap-0.5 px-1.5 max-w-full overflow-hidden">
                          {isSelected && (
                            <svg aria-hidden="true" className="w-2.5 h-2.5 text-white flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          <span
                            className="text-white text-[10px] font-bold truncate leading-none"
                            style={{ textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}
                          >
                            {isSelected && isWaitlistable ? "En attente" : timeLabel}
                          </span>
                        </div>
                      )}
                    </button>
                    {(hasLabel || (isWaitlistable && !isSelected)) && (
                      <span
                        className="absolute inset-x-0 bottom-0 text-[8px] text-gray-500 truncate text-center pointer-events-none"
                        style={{ height: LABEL_H, lineHeight: `${LABEL_H}px` }}
                        aria-hidden="true"
                      >
                        {isWaitlistable && !isSelected ? "Complet · file d'attente" : shift.label}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}

          {/* Spacer for label rows */}
          <div style={{ height: roleOrder.length * (ROW_H + GAP) }} />

          {/* Show label row */}
          <div className="relative" style={{ height: SHOW_H }}>
            {shows.map((show, i) => (
              <div
                key={i}
                className="absolute inset-y-0 bg-indigo-100 rounded-sm flex items-center overflow-hidden px-1"
                style={{
                  left:  px(toMin(show.startTime)),
                  width: pxW(toMin(show.startTime), toMin(show.endTime)),
                }}
              >
                <span className="text-[9px] text-indigo-700 font-medium truncate whitespace-nowrap">
                  🎪 {show.name}
                </span>
              </div>
            ))}
          </div>

          {/* Time axis */}
          <div className="relative border-t border-gray-100" style={{ height: AXIS_H }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute top-1 text-[10px] text-gray-600 leading-none"
                style={{ left: px(h * 60), transform: "translateX(-50%)" }}
              >
                {h}h
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}
