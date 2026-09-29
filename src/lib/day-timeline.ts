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
export const ROW_H      = 48
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
 * shifts is display only, so drag never leaves 0..1440.
 */
export function offsetToMin(localX: number, dayStart: number, dayEnd: number): number {
  return snapTo(clamp(dayStart + localX / PX_PER_MIN, Math.max(dayStart, 0), Math.min(dayEnd, 1440)))
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

/**
 * Times of a shift while one of its edges is dragged to `cur`: the other edge stays, the shift
 * keeps at least MIN_DUR minutes, and stays within the day (and the visible range).
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
    const newEnd = snapTo(clamp(cur, startMin + MIN_DUR, Math.min(dayEnd, 1440)))
    return { startTime: orig.startTime, endTime: fromMin(newEnd) }
  }
  const newStart = snapTo(clamp(cur, Math.max(dayStart, 0), Math.min(endMin - MIN_DUR, 1440 - SNAP)))
  return { startTime: fromMin(newStart), endTime: orig.endTime }
}
