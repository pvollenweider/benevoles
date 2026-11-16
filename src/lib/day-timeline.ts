// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pure logic of the admin day timeline (AdminDayTimeline, #291): the visible time range, pointer
 * position to snapped minutes, role rows with lane packing, and the drag-to-create and resize
 * bounds. Kept out of the component so it can be tested on its own.
 */
import { assignLanes, clamp, fromMin, toMin, toMinEnd } from "./gantt-utils"

// ── Layout constants ──────────────────────────────────────────────────────────
export const PX_PER_MIN = 2.5
export const SNAP       = 15
// 56, not 48: room for three lines of 12/11 px text in a bar (42 px tall inside a dashed frame).
export const ROW_H      = 56
export const LANE_GAP   = 4
export const GAP        = 8
// 112, not 92: long role names ("Chauffeurs artistes", "Techniciens de scène"…) were truncated
// to near-illegibility, especially on mobile (#217).
export const LABEL_W    = 112
export const HANDLE_W   = 8
export const MIN_DUR    = 15
export const AXIS_H     = 20
export const SHOW_H     = 22

export function snapTo(n: number) { return Math.round(n / SNAP) * SNAP }

type Timed = { startTime: string; endTime: string }

/**
 * Minutes shown on the axis: the shifts and shows, widened to whole hours plus one hour of
 * padding each side; 08:00–20:00 (padded) when the day is empty.
 */
export function dayRange(items: Timed[]): { dayStart: number; dayEnd: number } {
  const allMins = items.flatMap((s) => [toMin(s.startTime), toMinEnd(s.endTime, s.startTime)])
  const rawStart = allMins.length ? Math.min(...allMins) : 8 * 60
  const rawEnd   = allMins.length ? Math.max(...allMins) : 20 * 60
  return {
    dayStart: Math.floor(rawStart / 60) * 60 - 60,
    dayEnd:   Math.ceil(rawEnd / 60) * 60 + 60,
  }
}

/**
 * Snapped minute under a horizontal offset (px from the start of the time area). Shift times are
 * wall-clock times of the date (00:00 to 23:59, end at most midnight): the padding hour around the
 * shifts is display only, so drag never leaves 0..1440. `max` lifts the midnight cap for the end of
 * a shift that already runs into the next morning (#1024).
 */
export function offsetToMin(localX: number, dayStart: number, dayEnd: number, max = 1440): number {
  return snapTo(clamp(dayStart + localX / PX_PER_MIN, Math.max(dayStart, 0), Math.min(dayEnd, max)))
}

/** Whole hours to draw a tick for. */
export function hourTicks(dayStart: number, dayEnd: number): number[] {
  const hours: number[] = []
  for (let h = Math.ceil(dayStart / 60); h <= Math.floor(dayEnd / 60); h++) hours.push(h)
  return hours
}

type RowShift = Timed & { id: string; roleName: string; displayOrder: number }

export type RoleRows<S> = {
  roles: string[]
  /** Shifts of each role, in visual scan order (start time, then lane) so DOM/tab order matches layout. */
  byRole: Record<string, S[]>
  roleLane: Record<string, Record<string, number>>
  roleHeight: Record<string, number>
  roleTop: Record<string, number>
  rowsH: number
}

/**
 * One row per role, in the parent's global order when given (avoids per-day inconsistency when
 * several roles share a displayOrder), else by the role's smallest displayOrder. Overlapping
 * shifts of a role (same post, same time, different label) are packed onto separate sub-rows
 * instead of stacking invisibly.
 */
export function layoutRoles<S extends RowShift>(shifts: S[], roleOrder?: string[]): RoleRows<S> {
  const byRole: Record<string, S[]> = {}
  const roleMinOrder: Record<string, number> = {}
  for (const s of shifts) {
    if (!byRole[s.roleName]) { byRole[s.roleName] = []; roleMinOrder[s.roleName] = s.displayOrder }
    byRole[s.roleName].push(s)
    if (s.displayOrder < roleMinOrder[s.roleName]) roleMinOrder[s.roleName] = s.displayOrder
  }
  const roles = roleOrder
    ? roleOrder.filter((r) => !!byRole[r])
    : Object.keys(byRole).sort((a, b) => roleMinOrder[a] - roleMinOrder[b])

  const roleLane: Record<string, Record<string, number>> = {}
  const roleHeight: Record<string, number> = {}
  const roleTop: Record<string, number> = {}
  let acc = 0
  for (const role of roles) {
    const { lane, count } = assignLanes(byRole[role])
    roleLane[role] = lane
    roleHeight[role] = count * ROW_H + (count - 1) * LANE_GAP
    byRole[role] = [...byRole[role]].sort((a, b) =>
      toMin(a.startTime) - toMin(b.startTime) || lane[a.id] - lane[b.id])
    roleTop[role] = acc
    acc += roleHeight[role] + GAP
  }
  return { roles, byRole, roleLane, roleHeight, roleTop, rowsH: acc }
}

/** Start of a new shift dragged from a minute: at least one snap step before midnight. */
export function draftStart(min: number): number {
  return Math.min(min, 1440 - SNAP)
}

/** End of a new shift while dragging: at least one snap step long, at most midnight. */
export function draftEnd(startMin: number, cur: number): number {
  return Math.min(1440, Math.max(startMin + SNAP, cur))
}

/** A snapped minute within lo..hi: the step inside the bounds when the nearest one is outside. */
function snapWithin(n: number, lo: number, hi: number): number {
  const s = snapTo(clamp(n, lo, hi))
  if (s > hi) return Math.floor(hi / SNAP) * SNAP
  if (s < lo) return Math.ceil(lo / SNAP) * SNAP
  return s
}

/**
 * True when the end of a shift may be dragged past midnight: the shift already ends at or after
 * midnight (22:00–02:00, 22:00–00:00). A daytime shift keeps its end within the day.
 */
export function endMayPassMidnight(orig: Timed): boolean {
  return toMinEnd(orig.endTime, orig.startTime) >= 1440
}

/**
 * Times of a shift while one of its edges is dragged to `cur`: the other edge stays, the shift
 * keeps at least MIN_DUR minutes and less than a day, and stays within the visible range. Its start
 * stays on its date; its end stays within the day, unless the shift already ran into the next
 * morning (#1024): dragging the end of a 22:00–02:00 shift never pulls it back to 00:00.
 */
export function resizedTimes(
  orig: Timed,
  side: "left" | "right",
  cur: number,
  { dayStart, dayEnd }: { dayStart: number; dayEnd: number },
): Timed {
  const startMin = toMin(orig.startTime)
  const endMin   = toMinEnd(orig.endTime, orig.startTime)
  if (side === "right") {
    const max = endMayPassMidnight(orig) ? Math.min(dayEnd, startMin + 1440 - SNAP) : Math.min(dayEnd, 1440)
    return { startTime: orig.startTime, endTime: fromMin(snapWithin(cur, startMin + MIN_DUR, max)) }
  }
  const newStart = snapWithin(cur, Math.max(dayStart, 0, endMin - 1440 + SNAP), Math.min(endMin - MIN_DUR, 1440 - SNAP))
  return { startTime: fromMin(newStart), endTime: orig.endTime }
}

// ── Sectors (#1147) ───────────────────────────────────────────────────────────
/** Height of a sector's header row: its collapse button (at least 24 px) and the band. */
export const SECTOR_H = 32

export type SectorRows = {
  /** One entry per group, in order: where its header starts, its full height, and the postes drawn (none when collapsed). */
  groups: { key: string; top: number; height: number; roles: string[] }[]
  roleTop: Record<string, number>
  rowsH: number
}

/**
 * Rows of a timeline grouped by sector: each group's header, then its postes (their heights from
 * layoutRoles), unless the group is collapsed. The rows of the postes of a collapsed group are not
 * drawn at all, so their bars leave the tab order.
 */
export function layoutSectorGroups(groups: { key: string; roles: string[] }[], roleHeight: Record<string, number>, collapsed: ReadonlySet<string>): SectorRows {
  const roleTop: Record<string, number> = {}
  const out: SectorRows["groups"] = []
  let acc = 0
  for (const g of groups) {
    const top = acc
    acc += SECTOR_H + LANE_GAP
    const roles = collapsed.has(g.key) ? [] : g.roles
    for (const role of roles) {
      roleTop[role] = acc
      acc += (roleHeight[role] ?? ROW_H) + GAP
    }
    out.push({ key: g.key, top, height: acc - top, roles })
  }
  return { groups: out, roleTop, rowsH: acc }
}
