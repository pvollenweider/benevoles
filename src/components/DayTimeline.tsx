"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { getBarClasses } from "@/lib/roles"
import { toMin, toMinEnd, fmt, assignLanes, crossesMidnight, hourLabel, showSpan, type GanttShow } from "@/lib/gantt-utils"
import { useId, useRef, useState, type KeyboardEvent } from "react"
import { barText, shiftViewState, type HeldKind, type TimelineShift } from "@/lib/public-timeline"
import type { ShiftRosterEntry } from "@/lib/shift-roster"
import { ROSTER_FRISE_PROMPT } from "@/lib/shift-roster-text"
import { RosterSummary, rosterSpokenSummary } from "@/components/public/RosterName"
import { FRISE_KEYS_SHOWN, FRISE_KEYS_SPOKEN, friseKey, friseTabStop, friseTarget, type FriseRows } from "@/lib/frise-keyboard"

export { fmt }
export type { TimelineShift }

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
// The faint frame of a full bar, in classes and not inline: an inline outline would hide the focus
// outline, now that a full bar takes the focus (#1075); with the focus, the buttons' one (globals.css).
const FULL_OUTLINE = "not-focus-visible:outline not-focus-visible:outline-[rgba(0,0,0,0.07)]"

export default function DayTimeline({
  shifts,
  shows,
  selected,
  held,
  conflicts,
  onToggle,
  locked = false,
  describedBy,
  limitReachedRoles,
  reservedShiftIds,
  dayLabel,
  roster,
}: {
  shifts: TimelineShift[]
  shows: Show[]
  selected: Set<string>
  /** Shifts the visitor already holds, by status (#534): named and drawn as theirs, not offered. */
  held?: Map<string, HeldKind>
  conflicts?: Set<string>
  onToggle: (id: string, status: string) => void
  /** Registrations closed (#463): the schedule stays readable, nothing new can be selected. */
  locked?: boolean
  /** Id of the text explaining why, read with the schedule. */
  describedBy?: string
  /** Roles whose limit per person is reached (#466) → their limit, said on the other bars. */
  limitReachedRoles?: Map<string, number>
  /** Shifts of roles reserved to members (#470) this visitor can't take: shown, not selectable. */
  reservedShiftIds?: Set<string>
  /** The day in words (« samedi 4 juillet »): each day's schedule gets its own name. */
  dayLabel?: string
  /**
   * « Voir qui est inscrit » (#1068), by shift id. The bars stay as they are; one line under the
   * day's chart (outside its scrolling area) says who is on the bar hovered, tapped or focused
   * last, and keeps it until another one; each bar has the same sentence as its description. A
   * bar that can't be chosen lets taps through to its wrapper, which updates the line.
   */
  roster?: Map<string, ShiftRosterEntry> | null
}) {
  const [detailId, setDetailId] = useState<string | null>(null)
  // Keyboard (#1075): one tab stop per day, the bar focused or touched last; arrows between bars.
  const [stopId, setStopId] = useState<string | null>(null)
  const bars = useRef(new Map<string, HTMLButtonElement>())
  const hintId = useId()
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
  // Each bar's state, and the rows the arrows move through, in reading order (#1075). Every bar can
  // take the focus, whether it can be chosen or not; the day's tab stop starts on the first one
  // that can, and follows the focus.
  const viewOf = (shift: TimelineShift) => shiftViewState({ shift, held: held?.get(shift.id), selected: selected.has(shift.id), conflict: conflicts?.has(shift.id) ?? false, reserved: !!reservedShiftIds?.has(shift.id), locked })
  const rows: FriseRows = roleOrder.map((role) => byRole[role].map((s) => ({ id: s.id, start: toMin(s.startTime), end: toMinEnd(s.endTime, s.startTime) })))
  const order = rows.flat().map((b) => b.id)
  const clickableIds = new Set(visible.filter((s) => viewOf(s).clickable).map((s) => s.id))
  const tabStop = friseTabStop(order, clickableIds, stopId)
  const onBarKey = (id: string) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const k = friseKey({ key: e.key, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })
    if (!k) return
    // Handled even at an end: the arrows never scroll the chart or the page under the focus.
    e.preventDefault()
    const target = friseTarget(rows, id, k.key, k.ctrl)
    if (target) bars.current.get(target)?.focus()
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

  const detailShift = roster && detailId ? visible.find((s) => s.id === detailId) : undefined
  const detailEntry = detailShift ? roster?.get(detailShift.id) : undefined

  return (
    <>
    <div
      role="region"
      aria-label={dayLabel ? `Planning du ${dayLabel}` : "Planning de la journée"}
      aria-describedby={[hintId, describedBy].filter(Boolean).join(" ")}
      className="peer mb-5 rounded-xl border border-gray-100 bg-white overflow-x-auto select-none"
    >
      {/* First in the region: read on entering it; the visible form is under the chart. */}
      <p id={hintId} className="sr-only">{FRISE_KEYS_SPOKEN}</p>
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
                  left:  `${pct(showSpan(show).start)}%`,
                  width: `${pctW(showSpan(show).start, showSpan(show).end)}%`,
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
                  const heldKind        = held?.get(shift.id)
                  // Held wins over everything else: selected, full, waitlist, conflict, reserved.
                  // The same rules as the list view (#808): src/lib/public-timeline.ts.
                  const view            = viewOf(shift)
                  const isRegistered    = !!heldKind
                  const isConflict      = view.conflict
                  const isFull          = view.full
                  const isClosed        = view.closed
                  const isWaitlistable  = view.waitlistable
                  const unavail         = view.unavailable
                  const isSelected      = view.selected
                  const isReserved      = view.reserved
                  const state           = view.look
                  // A held bar does nothing: no hover darkening suggesting otherwise.
                  const barCls          = isRegistered
                    ? getBarClasses(shift.roleName, "default", shift.colorKey).replace(/\s*hover:\S+/g, "")
                    : getBarClasses(shift.roleName, state, shift.colorKey)
                  const clickable       = view.clickable
                  const fullNoWaitlist  = !isRegistered && isFull && !isWaitlistable
                  const startMin        = toMin(shift.startTime)
                  const endMin          = toMinEnd(shift.endTime, shift.startTime)
                  const laneTop         = roleLane[role][shift.id] * (ROW_H + LANE_GAP)
                  const LABEL_H         = 14
                  const overnight       = crossesMidnight(shift.startTime, shift.endTime)
                  const timeRange       = `${fmt(shift.startTime)}–${fmt(shift.endTime)}`
                  const timeLabel       = overnight ? `${timeRange} +1` : timeRange
                  // Fallback for bars too narrow for the full range (common on phones: a 45–70min
                  // shift at a natural day-wide zoom often lands just under the full-range
                  // threshold) — the start time alone, so the bar still says *something* useful
                  // instead of going blank. Never used for "En attente", which has no shorter form.
                  const timeShort       = fmt(shift.startTime)
                  // Longer texts ("22h–02h +1", "En attente") need a wider bar to be shown whole.
                  const longText        = overnight || (isSelected && isWaitlistable)
                  // Same "N/capacity" indicator as the admin timeline (#243), shown inside the bar
                  // itself the same way, so small groups can see at a glance whether a shift has
                  // enough room. Skipped once full (the "Complet" / waitlist wording already says
                  // all that matters) and on a held bar (its name and tag say what matters).
                  const spotsText       = unavail || isRegistered ? null : `${shift.registered}/${shift.capacity}`
                  const { ariaLabel, tag, tagShort, subLabel } = barText({
                    shift,
                    conflict: isConflict,
                    held: heldKind,
                    selected: isSelected,
                    reserved: isReserved,
                    locked,
                    limitReached: limitReachedRoles?.get(shift.roleName),
                  })
                  const showSubLabel    = !!tag || !!subLabel

                  return (
                    // @container: the text inside hides itself when the bar is too narrow for it
                    // (the button keeps its full accessible name).
                    <div
                      key={shift.id}
                      onPointerEnter={roster ? () => setDetailId(shift.id) : undefined}
                      // A touch moves the tab stop too: Safari does not focus a clicked button.
                      onClick={() => { setStopId(shift.id); if (roster) setDetailId(shift.id) }}
                      onFocus={() => { setStopId(shift.id); if (roster) setDetailId(shift.id) }}
                      className="absolute @container focus-within:z-20"
                      style={{
                        left: `${pct(startMin)}%`,
                        width: `${pctW(startMin, endMin)}%`,
                        minWidth: MIN_BAR_W,
                        top: laneTop,
                        height: ROW_H,
                      }}
                    >
                      <button
                        ref={(el) => { if (el) bars.current.set(shift.id, el); else bars.current.delete(shift.id) }}
                        type="button"
                        data-shift-id={shift.id}
                        tabIndex={shift.id === tabStop ? 0 : -1}
                        // Not `disabled`: a bar that can't be chosen stays reachable with the arrows,
                        // says why in its name, and its click does nothing (Enter and Space included).
                        aria-disabled={clickable ? undefined : true}
                        aria-pressed={clickable ? isSelected : undefined}
                        aria-label={ariaLabel}
                        aria-describedby={roster ? `roster-bar-${shift.id}` : undefined}
                        onClick={() => { if (clickable) onToggle(shift.id, shift.status) }}
                        onKeyDown={onBarKey(shift.id)}
                        // In forced colours, the GrayText the system gave a disabled bar; a held bar keeps its CanvasText frame.
                        className={`absolute inset-x-0 rounded border border-transparent ${roster && !clickable ? "pointer-events-none" : ""} forced-colors:aria-pressed:bg-[Highlight] ${isRegistered ? "forced-colors:border-2 forced-colors:border-[CanvasText]" : "forced-colors:aria-disabled:border-[GrayText]"} forced-colors:aria-disabled:text-[GrayText] flex items-center justify-center overflow-hidden transition-colors ${clickable ? "cursor-pointer" : "cursor-default"} ${fullNoWaitlist ? FULL_OUTLINE : ""} ${barCls}`}
                        style={{
                          top: 0,
                          bottom: showSubLabel ? LABEL_H : 0,
                          borderLeft: fullNoWaitlist ? "3px solid rgba(0,0,0,0.08)" : "4px solid rgba(255,255,255,0.7)",
                          ...(fullNoWaitlist ? {
                            backgroundColor: "white",
                            backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(0,0,0,0.06) 6px, rgba(0,0,0,0.06) 8px)",
                          } : {}),
                          ...(isWaitlistable && !isSelected && !isRegistered ? {
                            backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.35) 5px, rgba(255,255,255,0.35) 7px)",
                          } : {}),
                        }}
                      >
                        {isConflict || isReserved || (unavail && !isSelected) ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] px-1 truncate leading-none text-gray-700">
                            {/* Reserved (#470): a lock that fits the narrowest bar, the word when there is room. */}
                            {isReserved && (
                              <svg aria-hidden="true" className="w-2.5 h-2.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v2H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-1V6a4 4 0 00-4-4zm2 6V6a2 2 0 10-4 0v2h4z" clipRule="evenodd" />
                              </svg>
                            )}
                            <span className="hidden @min-[64px]:inline">{isReserved ? "Réservé" : isFull ? "Complet" : isClosed ? "Fermé" : ""}</span>
                          </span>
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-0.5 px-1.5 max-w-full overflow-hidden">
                            <div className="flex items-center gap-0.5 max-w-full overflow-hidden">
                              {isRegistered && (
                                // Held (#534): a check in a circle, unlike the plain check of a selection.
                                <svg aria-hidden="true" className="w-3 h-3 text-white flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                              )}
                              {isSelected && (
                                <svg aria-hidden="true" className="w-2.5 h-2.5 text-white flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                              {isSelected && isWaitlistable ? (
                                <span
                                  className="hidden @min-[68px]:inline text-white text-xs font-bold truncate leading-none"
                                  style={{ textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}
                                >
                                  En attente
                                </span>
                              ) : (
                                <>
                                  {/* Narrow bars (common on phones: a 45–70min shift at a natural
                                      day-wide zoom often lands here) get the start time alone
                                      instead of nothing; the full range takes over once there's
                                      room, hiding this one. */}
                                  <span
                                    className={`hidden @min-[34px]:inline ${longText ? "@min-[92px]:hidden" : "@min-[64px]:hidden"} text-white text-xs font-bold truncate leading-none`}
                                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}
                                  >
                                    {timeShort}
                                  </span>
                                  <span
                                    className={`${longText ? "hidden @min-[92px]:inline" : "hidden @min-[64px]:inline"} text-white text-xs font-bold truncate leading-none`}
                                    style={{ textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}
                                  >
                                    {timeLabel}
                                  </span>
                                </>
                              )}
                            </div>
                            {/* A space between the time and the count: their words stay apart in
                                the visible text that the bar's name must contain (WCAG 2.5.3). */}
                            {spotsText && " "}
                            {spotsText && (
                              // Much lower breakpoint than the time text above: "3/5" is short
                              // enough to fit right alongside the narrow-bar start-time fallback,
                              // and being on its own line it never competes with the selected-state
                              // checkmark for width. The old, higher threshold here left it
                              // invisible on the exact bar sizes common on phones — reported by
                              // beta testers right after #244/#248 shipped.
                              <span
                                className="hidden @min-[34px]:inline text-white text-[9px] font-medium truncate leading-none"
                                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.25)" }}
                              >
                                {spotsText}
                              </span>
                            )}
                          </div>
                        )}
                      </button>
                      {roster && <span id={`roster-bar-${shift.id}`} className="sr-only">{rosterSpokenSummary(roster.get(shift.id), roster.get(shift.id)?.own ?? false)}</span>}
                      {showSubLabel && (
                        <span
                          className="absolute inset-x-0 bottom-0 text-[10px] text-gray-600 truncate text-center pointer-events-none"
                          style={{ height: LABEL_H, lineHeight: `${LABEL_H}px` }}
                          aria-hidden="true"
                        >
                          {/* A narrow bar (most of them at 390 px) gets the short form of a long
                              tag, so the details after it stay visible; the name has it whole. */}
                          {tag && (tagShort ? (
                            <>
                              <span className="@min-[260px]:hidden font-semibold text-gray-800">{tagShort}</span>
                              <span className="hidden @min-[260px]:inline font-semibold text-gray-800">{tag}</span>
                            </>
                          ) : <span className="font-semibold text-gray-800">{tag}</span>)}
                          {tag && subLabel && " · "}
                          {subLabel}
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
                    left:  `${pct(showSpan(show).start)}%`,
                    width: `${pctW(showSpan(show).start, showSpan(show).end)}%`,
                  }}
                >
                  <span className="text-xs text-indigo-700 font-medium truncate whitespace-nowrap">
                    <span aria-hidden="true">🎪 </span>{show.name}
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
    {roster && (
      // Plain text, not live: the focused bar's description says the same. Kept until another bar.
      <p data-roster-detail className="-mt-3 mb-5 min-h-10 text-sm text-gray-700 break-words">
        {detailShift ? (
          <>
            <span className="block font-medium text-gray-900">{detailShift.label} · {fmt(detailShift.startTime)}–{fmt(detailShift.endTime)}</span>
            {" "}<RosterSummary entry={detailEntry} own={detailEntry?.own ?? false} />
          </>
        ) : ROSTER_FRISE_PROMPT}
      </p>
    )}
    {/* Only while a bar has the keyboard focus (never for a mouse or a touch): the keys, in short. */}
    <p aria-hidden="true" data-frise-keys className="hidden peer-has-[:focus-visible]:block -mt-3 mb-5 text-sm text-balance text-gray-600">{FRISE_KEYS_SHOWN}</p>
    </>
  )
}
