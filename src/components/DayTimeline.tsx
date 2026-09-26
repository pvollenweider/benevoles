"use client"

import { getBarClasses } from "@/lib/roles"
import { toMin, toMinEnd, fmt, assignLanes, crossesMidnight, hourLabel, type GanttShow } from "@/lib/gantt-utils"

export { fmt }

export type TimelineShift = {
  id: string
  roleName: string
  label: string
  startTime: string
  endTime: string
  status: string
  capacity: number
  registered: number
  spotsLeft: number
  displayOrder?: number
  waitlistEnabled?: boolean
  minAge?: number | null
  colorKey?: string | null
}

type Show = GanttShow

const ROW_H   = 44
const LANE_GAP = 4
const GAP     = 4
// 92, not 72: long role names ("Chauffeurs artistes", "Techniciens de scène"…) were truncated
// to near-illegibility, especially on mobile where the card is already narrow (#217).
const LABEL_W = 92
const SHOW_H  = 22
const AXIS_H  = 18
// The chart is fluid: it takes the whole width of its card and positions everything
// in percent of the day. Below MIN_PX_PER_MIN (36 px per hour) it stops shrinking and
// the card scrolls horizontally, as on phones; MAX_PX_PER_MIN stops a short day from
// being stretched. Bars are at least MIN_BAR_W wide (24 px, the AA target size).
const MIN_PX_PER_MIN = 0.6
const MAX_PX_PER_MIN = 2
const MIN_BAR_W = 24

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

  // Position and size as a share of the chart width.
  const pct  = (min: number) => ((min - dayStart) / span) * 100
  const pctW = (s: number, e: number) => Math.max(((e - s) / span) * 100, 0.3)

  const byRole: Record<string, TimelineShift[]> = {}
  const roleMinOrder: Record<string, number> = {}
  for (const s of visible) {
    if (!byRole[s.roleName]) { byRole[s.roleName] = []; roleMinOrder[s.roleName] = s.displayOrder ?? 0 }
    byRole[s.roleName].push(s)
    if ((s.displayOrder ?? 0) < roleMinOrder[s.roleName]) roleMinOrder[s.roleName] = s.displayOrder ?? 0
  }
  const roleOrder = Object.keys(byRole).sort((a, b) => roleMinOrder[a] - roleMinOrder[b])

  // Lane-pack overlapping shifts within each role (same post, same time, different
  // label) onto separate sub-rows instead of letting them stack invisibly.
  const roleLane: Record<string, Record<string, number>> = {}
  const roleHeight: Record<string, number> = {}
  for (const role of roleOrder) {
    const { lane, count } = assignLanes(byRole[role])
    roleLane[role] = lane
    roleHeight[role] = count * ROW_H + (count - 1) * LANE_GAP
    // Render in visual scan order (start time, then lane) so DOM/tab order matches layout.
    byRole[role] = [...byRole[role]].sort((a, b) =>
      toMin(a.startTime) - toMin(b.startTime) || lane[a.id] - lane[b.id])
  }
  const roleTop: Record<string, number> = {}
  {
    let acc = 0
    for (const role of roleOrder) { roleTop[role] = acc; acc += roleHeight[role] + GAP }
  }
  const rowsTotalH = roleOrder.reduce((sum, r) => sum + roleHeight[r] + GAP, 0)

  const hours: number[] = []
  for (let h = dayStart / 60; h <= dayEnd / 60; h++) hours.push(h)
  // A long day would print overlapping hour labels: print every other hour.
  const hourStep = hours.length > 14 ? 2 : 1

  return (
    <div
      role="region"
      aria-label="Planning de la journée, à faire défiler horizontalement si besoin"
      className="mb-5 rounded-xl border border-gray-100 bg-white overflow-x-auto select-none"
    >
      {/* Fluid width; the min-width only sets the point where the card starts to scroll. */}
      <div className="p-3" style={{ minWidth: LABEL_W + span * MIN_PX_PER_MIN + 24 }}>
        <div className="relative">

          {/* Label column */}
          <div className="absolute top-0 left-0 flex flex-col z-10" style={{ width: LABEL_W }}>
            {roleOrder.map((role) => (
              <div
                key={role}
                className="flex items-center justify-end pr-2 bg-white"
                style={{ height: roleHeight[role], marginBottom: GAP }}
              >
                <span
                  className="text-[10px] text-gray-600 line-clamp-2 leading-tight text-right"
                  title={role}
                >
                  {role.split(" &")[0].split(" —")[0].trim()}
                </span>
              </div>
            ))}
            <div style={{ height: SHOW_H + AXIS_H }} />
          </div>

          {/* Plot area: everything below is positioned in percent of its width */}
          <div className="relative" style={{ marginLeft: LABEL_W, maxWidth: span * MAX_PX_PER_MIN }}>

            {/* Full-height show bands */}
            {shows.map((show, i) => (
              <div
                key={i}
                className="absolute inset-y-0 bg-indigo-50 border-x border-indigo-100 pointer-events-none z-0"
                style={{
                  left:  `${pct(toMin(show.startTime))}%`,
                  width: `${pctW(toMin(show.startTime), toMin(show.endTime))}%`,
                }}
              />
            ))}

            {/* Shift rows */}
            {roleOrder.map((role) => (
              <div
                key={role}
                className="absolute inset-x-0"
                style={{ top: roleTop[role], height: roleHeight[role] }}
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
                  const barCls          = getBarClasses(shift.roleName, state, shift.colorKey)
                  const clickable       = !isRegistered && !isConflict && !unavail
                  const hasLabel        = shift.label !== shift.roleName
                  const startMin        = toMin(shift.startTime)
                  const endMin          = toMinEnd(shift.endTime, shift.startTime)
                  const laneTop         = roleLane[role][shift.id] * (ROW_H + LANE_GAP)
                  const LABEL_H         = 14
                  const overnight       = crossesMidnight(shift.startTime, shift.endTime)
                  const timeRange       = `${fmt(shift.startTime)}–${fmt(shift.endTime)}`
                  const timeLabel       = overnight ? `${timeRange} +1` : timeRange
                  // The +1 mark is visual; the accessible name spells it out.
                  const timeSpoken      = overnight ? `${timeRange}, jusqu'au lendemain` : timeRange
                  // Longer texts ("22h–02h +1", "En attente") need a wider bar to be shown whole.
                  const longText        = overnight || (isSelected && isWaitlistable)
                  const roleLabel       = hasLabel ? `${shift.roleName} (${shift.label})` : shift.roleName
                  // Informational only: we don't know a first-time visitor's age until the form,
                  // so this never blocks selection here — real enforcement is server-side at
                  // submit (see #192). Announced in the accessible name since the visual sub-label
                  // below is aria-hidden.
                  const hasMinAge       = shift.minAge != null
                  const minAgeSuffix    = hasMinAge ? ` (${shift.minAge} ans minimum)` : ""
                  // Same "N/capacity" indicator as the admin timeline (#243), so small groups
                  // can see at a glance whether a shift has enough room for everyone. Skipped
                  // once full (the "Complet" / waitlist wording already says all that matters).
                  const spotsText       = unavail ? null : `${shift.registered}/${shift.capacity}`
                  const spotsSuffix     = spotsText ? ` (${shift.spotsLeft} place${shift.spotsLeft > 1 ? "s" : ""} libre${shift.spotsLeft > 1 ? "s" : ""} sur ${shift.capacity})` : ""
                  const ariaLabel       = (isWaitlistable
                    ? (isSelected
                      ? `Retirer de la file d'attente — ${roleLabel} ${timeSpoken}`
                      : `Rejoindre la file d'attente — ${roleLabel} ${timeSpoken}`)
                    : (isSelected
                      ? `Désélectionner — ${roleLabel} ${timeSpoken}`
                      : `Sélectionner — ${roleLabel} ${timeSpoken}`)) + minAgeSuffix + spotsSuffix
                  const subLabelText    = isWaitlistable && !isSelected
                    ? ["Complet · file d'attente", hasMinAge ? `${shift.minAge}+` : null].filter(Boolean).join(" · ")
                    : [spotsText, hasLabel ? shift.label : null, hasMinAge ? `${shift.minAge}+` : null].filter(Boolean).join(" · ")
                  const showSubLabel    = hasLabel || (isWaitlistable && !isSelected) || hasMinAge || !!spotsText

                  return (
                    // @container: the text inside hides itself when the bar is too narrow for it
                    // (the button keeps its full accessible name).
                    <div
                      key={shift.id}
                      className="absolute @container"
                      style={{
                        left: `${pct(startMin)}%`,
                        width: `${pctW(startMin, endMin)}%`,
                        minWidth: MIN_BAR_W,
                        top: laneTop,
                        height: ROW_H,
                      }}
                    >
                      <button
                        disabled={!clickable}
                        aria-pressed={clickable ? isSelected : undefined}
                        aria-label={ariaLabel}
                        onClick={() => onToggle(shift.id, shift.status)}
                        className={`absolute inset-x-0 rounded flex items-center justify-center overflow-hidden transition-colors ${clickable ? "cursor-pointer" : "cursor-default"} ${barCls}`}
                        style={{
                          top: 0,
                          bottom: showSubLabel ? LABEL_H : 0,
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
                          <span className="hidden @min-[64px]:inline text-[10px] px-1 truncate leading-none text-gray-600">
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
                              className={`${longText ? "hidden @min-[92px]:inline" : "hidden @min-[68px]:inline"} text-white text-xs font-bold truncate leading-none`}
                              style={{ textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}
                            >
                              {isSelected && isWaitlistable ? "En attente" : timeLabel}
                            </span>
                          </div>
                        )}
                      </button>
                      {showSubLabel && (
                        <span
                          className="absolute inset-x-0 bottom-0 text-[10px] text-gray-600 truncate text-center pointer-events-none"
                          style={{ height: LABEL_H, lineHeight: `${LABEL_H}px` }}
                          aria-hidden="true"
                        >
                          {subLabelText}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}

            {/* Spacer for label rows */}
            <div style={{ height: rowsTotalH }} />

            {/* Show label row */}
            <div className="relative" style={{ height: SHOW_H }}>
              {shows.map((show, i) => (
                <div
                  key={i}
                  className="absolute inset-y-0 bg-indigo-100 rounded-sm flex items-center overflow-hidden px-1"
                  style={{
                    left:  `${pct(toMin(show.startTime))}%`,
                    width: `${pctW(toMin(show.startTime), toMin(show.endTime))}%`,
                  }}
                >
                  <span className="text-xs text-indigo-700 font-medium truncate whitespace-nowrap">
                    🎪 {show.name}
                  </span>
                </div>
              ))}
            </div>

            {/* Time axis. Purely visual: every shift button carries its own full label. */}
            <div className="relative border-t border-gray-100" style={{ height: AXIS_H }} aria-hidden="true">
              {hours.map((h, i) => (
                (i % hourStep === 0) && (
                  <div
                    key={h}
                    className="absolute top-1 text-xs text-gray-600 leading-none"
                    style={{ left: `${pct(h * 60)}%`, transform: "translateX(-50%)" }}
                  >
                    {hourLabel(h)}
                  </div>
                )
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
