"use client"

// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { useState, useRef, useCallback, useEffect, useId } from "react"
import { announce } from "@/lib/announce"
import { flushSync } from "react-dom"
import { dayLabel, spokenTimeRange } from "@/lib/spoken-time"
import { deleteShiftRecapFor, timelineBarDescription, timelineBarName, timelineBarPlaces, timelineBarTime } from "@/lib/shifts-admin"
import ConfirmActionModal from "@/components/admin/ConfirmActionModal"
import { requestJson } from "@/lib/use-submit"
import { getBarClasses } from "@/lib/roles"
import { shiftStaffingState } from "@/lib/staffing"
import { toMin, toMinEnd, fromMin, fmt, hourLabel, showSpan, type GanttShow } from "@/lib/gantt-utils"
import {
  AXIS_H, GAP, HANDLE_W, LABEL_W, LANE_GAP, MIN_DUR, PX_PER_MIN, ROW_H, SECTOR_H, SHOW_H,
  dayRange, draftEnd, draftStart, hourTicks, layoutRoles, layoutSectorGroups, offsetToMin, resizedTimes,
} from "@/lib/day-timeline"
import { groupRolesBySector, postesCount, sectorGroupKey, type SectorLike } from "@/lib/sectors"
import { applyResultMessage, posteApplyCount, posteApplyTargets, posteSpansOtherDays, type ApplyResult, type ApplyScope, type ApplyValues } from "@/lib/poste-apply"
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
  /** Minimum of people the shift can run with (#949); null = the same as capacity. */
  minVolunteers?: number | null
  status: string
  registrationCount: number
  displayOrder: number
  internalNotes?: string | null
  description?: string | null
  waitlistEnabled?: boolean
  requiresApproval?: boolean
  minAge?: number | null
  colorKey?: string | null
  /** Sector of the poste (#1147), shared by its shifts; null = « Sans secteur ». */
  sectorId?: string | null
}

/**
 * Grouping by sector (#1147), for an event that adopted sectors. The parent holds one collapsed
 * set for every day, so a sector collapsed once is collapsed on each day.
 */
export type TimelineSectors = {
  sectors: SectorLike[]
  /** Each poste's sector, read over the whole event (roleSectorOf). */
  sectorOf: Record<string, string | null>
  collapsed: ReadonlySet<string>
  onToggle: (key: string) => void
}

type Show = GanttShow
type Draft  = { roleName: string; startMin: number; endMin: number }
type Resize = { shiftId: string; side: "left" | "right"; origStart: number; origEnd: number }

interface Props {
  eventId:   string
  date:      string
  shifts:    AdminShift[]
  /** Every shift of the event (#1017): « Appliquer au poste » over the whole event counts and refreshes them. Defaults to `shifts`. */
  eventShifts?: AdminShift[]
  shows?:    Show[]
  roleOrder?: string[]   // global stable order from parent
  /** Rows grouped by sector (#1147); absent: one row per poste, as before. */
  sectorGrouping?: TimelineSectors
  onCreated: (s: AdminShift) => void
  onUpdated: (s: AdminShift) => void
  onDeleted: (id: string)    => void
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AdminDayTimeline({ eventId, date, shifts, eventShifts = shifts, shows = [], roleOrder, sectorGrouping, onCreated, onUpdated, onDeleted }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const groupIdBase = useId()

  const [resizeOverlay, setResizeOverlay] = useState<Record<string, { startTime: string; endTime: string }>>({})
  const [draft,    setDraft]    = useState<Draft | null>(null)
  const [resize,   setResize]   = useState<Resize | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [anchor,   setAnchor]   = useState<{ x: number; y: number; w: number } | null>(null)
  const [toast,    setToast]    = useState<{ text: string; kind: "success" | "error" } | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const [pendingDelete, setPendingDelete] = useState<AdminShift | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const visible = shifts
    .filter(s => s.status !== "cancelled")
    .map(s => resizeOverlay[s.id] ? { ...s, ...resizeOverlay[s.id] } : s)

  // ── Time range (include show times) ────────────────────────────────────────
  const { dayStart, dayEnd } = dayRange([...visible, ...shows])
  const span     = dayEnd - dayStart
  const totalW   = LABEL_W + span * PX_PER_MIN

  // ── Coordinate conversion ──────────────────────────────────────────────────
  const xToMin = useCallback((clientX: number, max = 1440) => {
    const el = containerRef.current
    if (!el) return dayStart
    const rect       = el.getBoundingClientRect()
    const scrollLeft = el.scrollLeft
    const localX     = clientX - rect.left + scrollLeft - LABEL_W
    return offsetToMin(localX, dayStart, dayEnd, max)
  }, [dayStart, dayEnd])

  const px = (min: number) => (min - dayStart) * PX_PER_MIN

  // ── Role rows ─────────────────────────────────────────────────────────────
  const layout = layoutRoles(visible, roleOrder)
  const { byRole, roleLane, roleHeight } = layout
  // By sector (#1147): the groups of this day's postes, « Sans secteur » last, each with a header row.
  const groups = sectorGrouping ? groupRolesBySector(layout.roles, (r) => sectorGrouping.sectorOf[r], sectorGrouping.sectors) : null
  const sectorRows = groups ? layoutSectorGroups(groups.map((g) => ({ key: sectorGroupKey(g), roles: g.roles })), roleHeight, sectorGrouping!.collapsed) : null
  const roles = sectorRows ? sectorRows.groups.flatMap((g) => g.roles) : layout.roles
  const roleTop = sectorRows ? sectorRows.roleTop : layout.roleTop
  const rowsH = sectorRows ? sectorRows.rowsH : layout.rowsH

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
      origEnd:   toMinEnd(shift.endTime, shift.startTime),
    })
  }

  // ── Global mouse move / up ──────────────────────────────────────────────────
  const onMouseMove = useCallback((e: MouseEvent) => {
    // The end of a shift that already runs into the next morning follows the pointer past
    // midnight (#1024); every other edge stays within the day.
    const cur = xToMin(e.clientX, resize?.side === "right" && resize.origEnd >= 1440 ? 2880 : 1440)
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

  // Successes fade; errors stay until the next outcome. Both are voiced through the status region.
  const showToast = useCallback((text: string, kind: "success" | "error" = "success") => {
    setToast({ text, kind })
    announce(setAnnouncement, text)
    if (kind === "success") setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 2500)
  }, [])

  const onMouseUp = useCallback(async () => {
    if (resize) {
      const overlay = resizeOverlay[resize.shiftId]
      const orig    = shifts.find(s => s.id === resize.shiftId)
      if (orig && overlay) {
        const outcome = await requestJson(() => fetch(`/api/admin/shifts/${resize.shiftId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ startTime: overlay.startTime, endTime: overlay.endTime }),
        }), "Horaires non enregistrés.")
        if (outcome.ok) { onUpdated({ ...orig, ...overlay }); showToast("Horaires mis à jour") } else showToast(outcome.error, "error")
      }
      setResizeOverlay({})
      setResize(null)
      return
    }
    if (draft && draft.endMin - draft.startMin >= MIN_DUR) {
      const outcome = await requestJson<AdminShift & { date: string }>(() => fetch("/api/admin/shifts", {
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
      }), "Créneau non créé.")
      if (!outcome.ok) showToast(outcome.error, "error")
      if (outcome.ok) {
        const data = outcome.data
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

  // Resolves to whether the change was saved: the popover stays open on a failure (#991).
  async function handlePatch(id: string, data: Partial<AdminShift>): Promise<boolean> {
    const orig = shifts.find(s => s.id === id)
    if (!orig) return false
    const patch = { ...data, label: data.label?.trim() || orig.roleName }
    const outcome = await requestJson(() => fetch(`/api/admin/shifts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }), "Modification non enregistrée.")
    if (outcome.ok) { onUpdated({ ...orig, ...patch }); showToast("Enregistré") } else showToast(outcome.error, "error")
    return outcome.ok
  }

  // Deletion asks first (#379): the popover closes, focus goes back to the bar so that the
  // modal has a real opener to return to on Cancel, then the recap modal takes over.
  function handleDelete(id: string) {
    const shift = shifts.find(s => s.id === id)
    if (!shift) return
    flushSync(() => setSelected(null))
    document.getElementById(`shift-bar-${id}`)?.focus()
    setDeleteError(null)
    setPendingDelete(shift)
  }

  async function runDelete(shift: AdminShift) {
    setDeleting(true)
    setDeleteError(null)
    const outcome = await requestJson(() => fetch(`/api/admin/shifts/${shift.id}`, { method: "DELETE" }), "Suppression impossible.")
    setDeleting(false)
    if (!outcome.ok) { setDeleteError(outcome.error); return }
    // The bar that opened the modal disappears with the shift: land on a neighbour, else the day.
    const siblings = shifts.filter(s => s.roleName === shift.roleName && s.id !== shift.id)
    const next = siblings.find(s => toMin(s.startTime) >= toMin(shift.startTime)) ?? siblings[siblings.length - 1]
    flushSync(() => { setPendingDelete(null); onDeleted(shift.id) })
    showToast("Créneau supprimé")
    const target = next ? document.getElementById(`shift-bar-${next.id}`) : null
    ;(target ?? containerRef.current)?.focus()
  }

  // Quick edits (#398): a copy right after the shift, and one capacity for the whole role.
  async function handleDuplicate(id: string) {
    const outcome = await requestJson<AdminShift & { date: string }>(() => fetch(`/api/admin/shifts/${id}/duplicate`, { method: "POST" }), "Duplication impossible.")
    if (!outcome.ok) { showToast(outcome.error); return }
    const created = outcome.data
    onCreated({ ...created, date: created.date.split("T")[0], registrationCount: 0 })
    showToast("Créneau dupliqué")
  }

  // Places and minimum together (#949): the minimum is checked against the places asked.
  // « Appliquer au poste » (#1017): places, minimum and label of one shift onto the poste's live
  // shifts of this day or of the whole event. The popover says the result; when it was closed during
  // the request, the timeline says it instead.
  const selectedRef = useRef(selected)
  selectedRef.current = selected
  async function handleApplyToPoste(shiftId: string, roleName: string, scope: ApplyScope, values: ApplyValues): Promise<ApplyResult | false> {
    const outcome = await requestJson<{ shifts?: number; days?: number; keptHigher?: number }>(() => fetch(`/api/admin/events/${eventId}/roles/${encodeURIComponent(roleName)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, ...(scope === "day" ? { date } : {}) }),
    }), "Rien n'a été appliqué.")
    if (!outcome.ok) { showToast(outcome.error, "error"); return false }
    const targets = posteApplyTargets(eventShifts, roleName, scope, date)
    for (const s of targets) {
      onUpdated({
        ...s,
        capacity: Math.max(values.capacity, s.registrationCount),
        ...(values.minVolunteers !== undefined ? { minVolunteers: values.minVolunteers } : {}),
        ...(values.label !== undefined ? { label: values.label } : {}),
      })
    }
    const counted = posteApplyCount(targets)
    const result: ApplyResult = { shifts: outcome.data?.shifts ?? counted.shifts, days: outcome.data?.days ?? counted.days, keptHigher: outcome.data?.keptHigher ?? 0 }
    if (selectedRef.current !== shiftId) showToast(applyResultMessage(roleName, scope, result))
    return result
  }

  // One poste's name in the sticky label column.
  function renderRoleLabel(role: string) {
    return (
      <div
        key={role}
        className="flex items-center justify-end pr-2 shrink-0"
        style={{ height: roleHeight[role], marginBottom: GAP }}
      >
        <span
          className="text-[11px] text-gray-600 line-clamp-2 text-right leading-tight max-w-full"
          title={role}
        >
          {role.split(" &")[0].trim()}
        </span>
      </div>
    )
  }

  // One poste's row: its bars, and the ghost bar while one is dragged in it.
  function renderRoleRow(role: string) {
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
          // Below its minimum (#949): a dashed white frame on top of the words on the bar,
          // so the critical shifts stand out at a glance even when the text is cut.
          const belowMin   = !isFull && shiftStaffingState({ ...shift, active: shift.registrationCount }) === "below_minimum"
          const barCls     = getBarClasses(shift.roleName, isSelected ? "selected" : "default", shift.colorKey)
          const hasLabel   = shift.label && shift.label !== shift.roleName

          return (
            <div
              key={shift.id}
              id={`shift-bar-${shift.id}`}
              data-shift-bar="1"
              data-below-minimum={belowMin ? "1" : undefined}
              className={`absolute rounded-lg cursor-pointer overflow-hidden focus:z-20
                flex items-center transition-shadow
                ${isSelected ? "shadow-md" : "hover:shadow-sm"} ${belowMin ? "border-2 border-dashed border-white" : ""} ${barCls}`}
              style={{
                left: barLeft,
                width: barWidth,
                top: laneTop + 6,
                height: ROW_H - 12,
                ...(isFull ? {
                  backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 5px, rgba(255,255,255,0.3) 5px, rgba(255,255,255,0.3) 7px)",
                } : {}),
              }}
              role="button"
              tabIndex={0}
              aria-haspopup="dialog"
              aria-expanded={isSelected}
              aria-label={timelineBarName(shift)}
              aria-describedby={`shift-bar-desc-${shift.id}`}
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); openPopover(shift.id) }}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPopover(shift.id) } }}
            >
              {/* The full visible text as a tooltip, for a narrow bar that cuts it: on this
                  inner box, not on the bar, whose title would be read after its name
                  (the bar's children are presentational, so this one is not exposed). */}
              <div
                className="flex flex-col justify-center px-2 overflow-hidden w-full"
                title={[timelineBarTime(shift), hasLabel ? shift.label : null, timelineBarPlaces(shift)].filter(Boolean).join(" · ")}
              >
                {/* The spaces between the lines keep their words apart in the visible
                    text that the bar's name must contain (WCAG 2.5.3); a flex column
                    does not render them. */}
                <span className="text-white text-xs font-bold leading-none truncate text-shadow-[0_1px_2px_rgb(0_0_0/0.3)]">
                  {timelineBarTime(shift)}
                </span>{" "}
                {hasLabel && (
                  <>
                    <span className="text-white text-[11px] leading-none truncate mt-0.5">
                      {shift.label}
                    </span>{" "}
                  </>
                )}
                <span className="text-white text-[11px] leading-none truncate mt-0.5">
                  {timelineBarPlaces(shift)}
                </span>
              </div>
              {/* The hours and places in words (#587), read after the name. */}
              <span id={`shift-bar-desc-${shift.id}`} hidden>{timelineBarDescription(shift, isFull)}</span>

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
            className="absolute rounded-lg border-2 border-blue-400 border-dashed bg-blue-400/25 pointer-events-none flex items-center justify-center"
            style={{
              left:  px(draft.startMin),
              width: Math.max((draft.endMin - draft.startMin) * PX_PER_MIN, 2),
              top:   6,
              height: ROW_H - 12,
            }}
          >
            <span className="text-[11px] text-blue-700 font-medium px-1 truncate">
              {fmt(fromMin(draft.startMin))}–{fmt(fromMin(draft.endMin))}
            </span>
          </div>
        )}
      </div>
    )
  }

  // ── Hour ticks ──────────────────────────────────────────────────────────────
  const hours = hourTicks(dayStart, dayEnd)

  const selectedShift = selected ? visible.find(s => s.id === selected) : null
  const hasShows      = shows.length > 0

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <div
        ref={containerRef} tabIndex={-1}
        role="region" aria-label={`Planning du ${dayLabel(date)}`}
        className="overflow-x-auto select-none rounded-xl border border-gray-100 bg-white"
        // The sticky role column covers the left of the region: a bar brought into view by focus
        // stops to its right, not under it (#924).
        style={{ scrollPaddingLeft: LABEL_W }}
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
                  left:  LABEL_W + px(showSpan(show).start),
                  width: Math.max((showSpan(show).end - showSpan(show).start) * PX_PER_MIN, 2),
                }}
              />
            ))}

            {/* Role-name column, sticky (#924): it used to be absolute and scrolled away with the
                hours, leaving the rows unnamed on a long day. A sticky element can't be absolute,
                so a full-width absolute layer (no pointer events) holds it; the column sticks to
                the left edge of the scroll region while the hours scroll under it. A focused bar
                rises above it (focus:z-20, also when focus comes back by code) and the region's scroll padding keeps it clear. */}
            {groups && sectorRows ? (
              <>
                {/* By sector (#1147): each group holds its header, its own sticky label column
                    and its postes' rows, in screen order, so Tab goes from a sector's button to its
                    bars. No group wrapper sets z-index, transform, opacity or filter: a focused bar
                    must still rise above the label columns (DESIGN.md, timeline focus). */}
                {groups.map((g, gi) => {
                  const rows = sectorRows.groups[gi]
                  const expanded = !sectorGrouping!.collapsed.has(rows.key)
                  const nameId = `${groupIdBase}-sector-${gi}`
                  const rowsId = `${groupIdBase}-sector-rows-${gi}`
                  return (
                    <div key={rows.key} role="group" aria-labelledby={nameId} data-sector-group={rows.key}>
                      {/* The header's band across the hours; its border stays in forced colours. */}
                      <div aria-hidden="true" className="absolute left-0 border-t border-gray-300 bg-gray-50 pointer-events-none" style={{ top: rows.top, height: SECTOR_H, width: totalW }} />
                      <div className="absolute left-0 z-10 pointer-events-none" style={{ top: rows.top, height: rows.height, width: totalW }}>
                        <div className="sticky left-0 flex flex-col bg-white pointer-events-auto" style={{ width: LABEL_W }}>
                          {/* Wider than the label column, over the band: a long sector name stays on one line. */}
                          <div className="flex items-center border-t border-transparent bg-gray-50 pr-1" style={{ height: SECTOR_H, marginBottom: LANE_GAP, width: Math.min(totalW, 420) }}>
                            <button
                              type="button"
                              aria-expanded={expanded}
                              aria-controls={expanded ? rowsId : undefined}
                              onClick={() => sectorGrouping!.onToggle(rows.key)}
                              data-sector-toggle={rows.key}
                              className="flex min-h-6 max-w-full items-center gap-1 rounded-md px-1 text-left text-xs font-semibold text-gray-900 hover:bg-gray-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                            >
                              <svg aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 motion-safe:transition-transform ${expanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                              <span className="min-w-0 truncate">
                                <span id={nameId}>{g.name}</span>{" "}
                                <span className="font-normal text-gray-700">· {postesCount(g.roles.length)}</span>
                              </span>
                            </button>
                          </div>
                          {rows.roles.map(renderRoleLabel)}
                        </div>
                      </div>
                      <div id={rowsId}>{rows.roles.map(renderRoleRow)}</div>
                    </div>
                  )
                })}
                {/* The axis and the shows' row keep their label column below the groups. */}
                <div className="absolute left-0 bottom-0 z-10 pointer-events-none" style={{ top: rowsH, width: totalW }}>
                  <div className="sticky left-0 flex flex-col bg-white pointer-events-auto" style={{ width: LABEL_W }}>
                    <div style={{ height: AXIS_H }} />
                    {hasShows && (
                      <div className="flex items-center justify-end pr-2" style={{ height: SHOW_H }}>
                        <span className="text-[11px] text-indigo-800">Spectacles</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
              <div className="absolute inset-y-0 left-0 z-10 pointer-events-none" style={{ width: totalW }}>
              <div
                data-role-labels="1"
                className="sticky left-0 flex flex-col bg-white pointer-events-auto"
                style={{ width: LABEL_W }}
              >
                {roles.map(renderRoleLabel)}
                <div style={{ height: AXIS_H }} />
                {hasShows && (
                  <div className="flex items-center justify-end pr-2" style={{ height: SHOW_H }}>
                    <span className="text-[11px] text-indigo-800">Spectacles</span>
                  </div>
                )}
              </div>
              </div>

              {/* Role rows */}
              {roles.map(renderRoleRow)}
              </>
            )}

            {/* Spacer */}
            <div style={{ height: rowsH }} />

            {/* Time axis */}
            <div className="relative border-t border-gray-100" style={{ height: AXIS_H }}>
              {hours.map(h => (
                <div
                  key={h}
                  className="absolute top-1 text-[11px] text-gray-700 leading-none"
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
                    className="absolute inset-y-1 flex items-center px-1.5 rounded-md bg-indigo-50 text-[11px] text-indigo-700 truncate pointer-events-none"
                    style={{
                      left:  LABEL_W + px(showSpan(show).start),
                      width: Math.max((showSpan(show).end - showSpan(show).start) * PX_PER_MIN, 48),
                    }}
                  >
                    <span aria-hidden="true">🎪 </span>{show.name}<span aria-hidden="true"> · {fmt(show.startTime)}–{fmt(show.endTime)}</span><span className="sr-only">, {spokenTimeRange(show.startTime, show.endTime)}</span>
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
          onDuplicate={handleDuplicate}
          eventCount={posteSpansOtherDays(eventShifts, selectedShift.roleName, date)
            ? posteApplyCount(posteApplyTargets(eventShifts, selectedShift.roleName, "event", date))
            : null}
          onApplyToPoste={handleApplyToPoste}
          onNotSaved={(message) => showToast(message, "error")}
        />
      )}

      {pendingDelete && (
        <ConfirmActionModal
          recap={deleteShiftRecapFor({ ...pendingDelete, date })}
          busy={deleting}
          error={deleteError}
          onConfirm={() => void runDelete(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {toast && <Toast message={toast.text} kind={toast.kind} />}
      <div role="status" className="sr-only">{announcement}</div>
    </>
  )
}
