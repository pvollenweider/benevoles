// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Pure logic of the admin shifts page (ShiftsManager, #291): event days, time input
 * normalization, role order, rename/delete of a role, grouping and sorting. Kept out of the
 * component so it can be tested on its own.
 */

import { deleteShiftRecap, shiftWhen, type ActionRecap } from "./action-recap"
import { fmt } from "./gantt-utils"
import { spokenShiftName, spokenTimeRange } from "./spoken-time"
import { shiftStaffingState, spokenStaffingState, staffingStateText } from "./staffing"

type ShiftLike = {
  id: string
  roleName: string
  label: string
  date: string
  startTime: string
  status?: string | null
  displayOrder?: number | null
  registrationCount: number
}

function localISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

/** Every calendar day of the event, "YYYY-MM-DD", from start to end inclusive. */
export function eventDates(start: string, end: string): string[] {
  const dates: string[] = []
  const cur = new Date(start + "T00:00:00")
  const last = new Date(end + "T00:00:00")
  while (cur <= last) {
    dates.push(localISO(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

/**
 * "9" → "09:00", "9:5" → "09:05". Out-of-range values (24, 26, -2, 75 minutes) are kept as typed
 * so the server reports them, instead of being silently changed to a different time.
 */
export function normalizeTime(val: string): string {
  const clean = val.trim()
  if (!clean) return ""
  const [h, m] = clean.split(":")
  const hours = parseInt(h, 10)
  const minutes = m !== undefined ? parseInt(m, 10) : 0
  if (isNaN(hours)) return clean
  if (hours < 0 || hours > 23 || isNaN(minutes) || minutes < 0 || minutes > 59) return clean
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

/** "samedi 1 juin". */
export function fmtLongDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
}

const active = <S extends ShiftLike>(shifts: S[]) => shifts.filter((s) => s.status !== "cancelled")

/** Roles in their display order (first shift's displayOrder), cancelled shifts ignored. */
export function roleOrder(shifts: ShiftLike[]): string[] {
  return [...new Set(
    [...active(shifts)].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)).map((s) => s.roleName),
  )]
}

/** The list with the item at `from` moved to `to` (drag and drop). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Shifts with displayOrder set from a role order (role index × 100), as the server does. */
export function applyRoleOrder<S extends ShiftLike>(shifts: S[], order: string[]): S[] {
  return shifts.map((s) => {
    const idx = order.indexOf(s.roleName)
    return idx >= 0 ? { ...s, displayOrder: idx * 100 } : s
  })
}

/** Shifts after renaming a role; a label equal to the old role name follows it. */
export function renameRole<S extends ShiftLike>(shifts: S[], oldName: string, newName: string): S[] {
  return shifts.map((s) => (s.roleName === oldName ? { ...s, roleName: newName, label: s.label === oldName ? newName : s.label } : s))
}

/** Confirmation text before deleting a role, warning about the volunteers who'll be emailed. */
export function roleDeletionWarning(shifts: ShiftLike[], role: string): string {
  const roleShifts = active(shifts).filter((s) => s.roleName === role)
  const n = roleShifts.length
  const regs = roleShifts.reduce((sum, s) => sum + s.registrationCount, 0)
  const base = `Supprimer le poste « ${role} » (${n} créneau${n > 1 ? "x" : ""}) ?`
  if (regs === 0) return base
  const p = regs > 1 ? "s" : ""
  return `${base} ${regs} bénévole${p} inscrit${p} ${regs > 1 ? "seront" : "sera"} prévenu${p} par email.`
}

/** Active shifts grouped by day. */
export function activeShiftsByDay<S extends ShiftLike>(shifts: S[]): Record<string, S[]> {
  return active(shifts).reduce<Record<string, S[]>>((acc, s) => {
    ;(acc[s.date] ??= []).push(s)
    return acc
  }, {})
}

/** Active shifts sorted by day, then role order, then start time. */
export function sortShifts<S extends ShiftLike>(shifts: S[]): S[] {
  return [...active(shifts)].sort((a, b) =>
    a.date.localeCompare(b.date) || (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.startTime.localeCompare(b.startTime),
  )
}

type ShiftWords = { roleName: string; label?: string | null; date: string; startTime: string; endTime: string }

/** « 3 inscrits sur 5 », « 1 inscrit sur 2 »: a shift's places in words, for « 3/5 » read « 3 barre 5 » (#587). */
export function spokenPlaces(registered: number, capacity: number): string {
  return `${registered} inscrit${registered > 1 ? "s" : ""} sur ${capacity}`
}

type BarShift = ShiftWords & { registrationCount: number; capacity: number; minAge?: number | null; minVolunteers?: number | null }

/** The hours a bar on the admin timeline shows: « 07h–09h ». */
export function timelineBarTime(s: { startTime: string; endTime: string }): string {
  return `${fmt(s.startTime)}–${fmt(s.endTime)}`
}

/**
 * The accessible name of a shift's bar on the admin timeline: the role (shown by the row, not the
 * bar), then the bar's visible text in its order, then the action: « Bar, 10h30–12h15, Soir,
 * 3/5 inscrits, 2 libres, modifier ». It holds the visible words in a row so that a voice command
 * using them reaches the bar (WCAG 2.5.3, axe `label-content-name-mismatch`); the « · » of the bar
 * becomes a comma. The hours and places in words (#587) are its description, `timelineBarDescription`.
 */
export function timelineBarName(s: BarShift): string {
  const label = s.label && s.label !== s.roleName ? `, ${s.label}` : ""
  return `${s.roleName}, ${timelineBarTime(s)}${label}, ${timelineBarPlaces(s).split(" · ").join(", ")}, modifier`
}

/**
 * The description of a bar on the admin timeline (#587), read after its name: the hours and places
 * in words, for « 07h–09h » and « 3/5 » read with « tiret » and « barre »: « de 10h30 à 12h, 3
 * inscrits sur 5, complet, 18 ans minimum ».
 */
export function timelineBarDescription(s: BarShift, full: boolean): string {
  const free = s.capacity - s.registrationCount
  // Against the minimum (#949): « sous le minimum de 2 », « minimum atteint », as on the bar.
  const minState = full ? null : spokenStaffingState(s, shiftStaffingState({ ...s, active: s.registrationCount }))
  const state = full ? ", complet" : minState ? `, ${minState}` : free > 0 ? `, ${free} libre${free > 1 ? "s" : ""}` : ""
  return `${spokenTimeRange(s.startTime, s.endTime)}, ${spokenPlaces(s.registrationCount, s.capacity)}${state}${s.minAge != null ? `, ${s.minAge} ans minimum` : ""}`
}

/**
 * The places line of a bar on the admin timeline (#925): « 2/4 inscrits · 2 libres », « 3/3 inscrits
 * · Complet », after « 18 ans min. · » for a shift with a minimum age (first, so that a narrow bar
 * cuts the figures rather than the rule). « inscrits » says what the figures count, « libres »
 * agrees with the number as in the list view. With a minimum of people (#949), the state takes the
 * place of the free spots: « 1/4 inscrits · sous le minimum (2) », « 2/4 inscrits · minimum atteint ».
 */
export function timelineBarPlaces(s: { registrationCount: number; capacity: number; minAge?: number | null; minVolunteers?: number | null }): string {
  const free = s.capacity - s.registrationCount
  const minState = free > 0 ? staffingStateText(s, shiftStaffingState({ ...s, active: s.registrationCount })) : null
  const places = `${s.registrationCount}/${s.capacity} inscrit${s.registrationCount > 1 ? "s" : ""} · ${minState ?? (free > 0 ? `${free} libre${free > 1 ? "s" : ""}` : "Complet")}`
  return s.minAge != null ? `${s.minAge} ans min. · ${places}` : places
}

/**
 * What deleting one shift does, before the confirmation (#379), for the list and the timeline
 * alike (#587): « Bar, Soir » and « Samedi 4 juillet, de 10h30 à 12h15 », from the stored times
 * (the timeline used to pass « 10h30 », whose minutes were lost).
 */
export function deleteShiftRecapFor(s: ShiftWords & { registrationCount: number }): ActionRecap {
  return deleteShiftRecap({ name: spokenShiftName(s), when: shiftWhen(s.date, s.startTime, s.endTime), registered: s.registrationCount })
}

export type ShiftListStatus = "open" | "full" | "closed"

/**
 * The one status of a row in the list view: « Fermé » for a closed shift, « Complet » once its
 * places are taken (even while it is still stored as open, which used to show « Ouvert » next to
 * « Complet »), « Ouvert » otherwise.
 */
export function shiftListStatus(s: { status?: string | null; registrationCount: number; capacity: number }): ShiftListStatus {
  if (s.status === "closed") return "closed"
  if (s.status === "full" || s.registrationCount >= s.capacity) return "full"
  return "open"
}
