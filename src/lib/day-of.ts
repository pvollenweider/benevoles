// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Jour J » (#561): the day-of view of an event on a phone. Which shifts are running or about to
 * start, who is expected on each, who has arrived. Pure: the page reads the facts through the
 * org-scoped client and decides `now`; the board component only filters and toggles presences.
 *
 * Times are wall-clock times of the organization's zone (#344). A shift dated yesterday that runs
 * past midnight (22:00 to 02:00) is still in progress this morning: phases are decided on real
 * instants (shiftInstants), never on the shift's date alone, so DST days are handled too.
 */

import { shiftInstants } from "./ics"
import { crossesMidnight } from "./gantt-utils"
import { fmtHour } from "./registrations-list"
import { fold } from "./text-fold"

/** « Dans les prochaines heures »: fixed by the owner (#561), not a setting. */
export const DAY_OF_WINDOW_HOURS = 3

export type DayOfPerson = {
  registrationId: string
  firstName: string
  lastName: string
  /** contactPhone(): the registration's phone first, else the profile's. */
  phone: string | null
  /** ISO instant of the check-in, null when not marked present. */
  checkedInAt: string | null
}

export type DayOfShift = {
  id: string
  roleName: string
  label: string
  /** "YYYY-MM-DD", the calendar day the shift starts on. */
  date: string
  startTime: string
  endTime: string
  capacity: number
  /** Role order of the event (Shift.displayOrder, shared per role). */
  displayOrder?: number
  contactName: string | null
  contactPhone: string | null
  /** Confirmed (active) registrations only. */
  people: DayOfPerson[]
}

/**
 * Where a shift stands at `now`: running, starting within the window, already over today, or
 * starting later today (beyond the window). Null for anything else (another day).
 */
export type DayOfPhase = "in_progress" | "upcoming" | "earlier" | "later"

/** Calendar day "YYYY-MM-DD" of an instant in `timeZone`. */
export function localDay(instant: Date, timeZone: string): string {
  return instant.toLocaleDateString("sv-SE", { timeZone })
}

export function shiftPhase(
  shift: Pick<DayOfShift, "date" | "startTime" | "endTime">,
  now: Date,
  timeZone: string,
  windowHours: number = DAY_OF_WINDOW_HOURS,
): DayOfPhase | null {
  const { start, end } = shiftInstants(shift, timeZone)
  const t = now.getTime()
  if (start.getTime() <= t && t < end.getTime()) return "in_progress"
  if (start.getTime() > t && start.getTime() <= t + windowHours * 3_600_000) return "upcoming"
  const today = localDay(now, timeZone)
  // Over, and ended today: a night shift that ended at 02:00 this morning counts, one that ended
  // at midnight sharp belongs to yesterday.
  if (end.getTime() <= t && localDay(new Date(end.getTime() - 1), timeZone) === today) return "earlier"
  if (start.getTime() > t && shift.date === today) return "later"
  return null
}

/** Whether `now` falls on one of the event's days, in the organization's zone. */
export function isEventDay(event: { startDate: string; endDate: string }, now: Date, timeZone: string): boolean {
  const today = localDay(now, timeZone)
  return today >= event.startDate.slice(0, 10) && today <= event.endDate.slice(0, 10)
}

/**
 * The stored shift dates (UTC midnights) worth loading at `now`: yesterday's night shifts to the
 * window past midnight, in any zone. Two days around the UTC day cover every offset (±14 h);
 * shiftPhase does the exact selection.
 */
export function dayOfDateRange(now: Date): { from: Date; to: Date } {
  const day = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`)
  return { from: new Date(day - 2 * 86_400_000), to: new Date(day + 2 * 86_400_000) }
}

/** Shifts starting at the same instant, in role order. */
export type DayOfGroup = { key: string; date: string; startTime: string; shifts: DayOfShift[] }

export type DayOfBoard = {
  inProgress: DayOfGroup[]
  upcoming: DayOfGroup[]
  /** Over earlier today: shown collapsed. */
  earlier: DayOfGroup[]
  /** Shifts later today, beyond the window: only counted. */
  laterCount: number
}

const byRole = (a: DayOfShift, b: DayOfShift) =>
  (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.roleName.localeCompare(b.roleName, "fr") || a.label.localeCompare(b.label, "fr")

/** Groups by start time (date and hour), earliest first, then role order inside each group. */
export function groupByStart(shifts: DayOfShift[]): DayOfGroup[] {
  const groups = new Map<string, DayOfGroup>()
  for (const s of shifts) {
    const key = `${s.date}T${s.startTime}`
    const g = groups.get(key) ?? { key, date: s.date, startTime: s.startTime, shifts: [] }
    g.shifts.push(s)
    groups.set(key, g)
  }
  return [...groups.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((g) => ({ ...g, shifts: [...g.shifts].sort(byRole) }))
}

export function dayOfBoard(shifts: DayOfShift[], now: Date, timeZone: string, windowHours: number = DAY_OF_WINDOW_HOURS): DayOfBoard {
  const by: Record<DayOfPhase, DayOfShift[]> = { in_progress: [], upcoming: [], earlier: [], later: [] }
  for (const s of shifts) {
    const phase = shiftPhase(s, now, timeZone, windowHours)
    if (phase) by[phase].push(s)
  }
  return {
    inProgress: groupByStart(by.in_progress),
    upcoming: groupByStart(by.upcoming),
    earlier: groupByStart(by.earlier),
    laterCount: by.later.length,
  }
}

export const personName = (p: Pick<DayOfPerson, "firstName" | "lastName">) => `${p.firstName} ${p.lastName}`.trim()

/** « Bar, Soir » or « Bar »: a comma, never the « · » read aloud as « point ». */
export function shiftName(s: Pick<DayOfShift, "roleName" | "label">): string {
  return s.label && s.label !== s.roleName ? `${s.roleName}, ${s.label}` : s.roleName
}

/**
 * Search (#377 folding): a shift whose role or label matches keeps everyone; otherwise only the
 * people whose name matches, and shifts left without anyone are dropped. Groups left empty too.
 */
export function filterGroups(groups: DayOfGroup[], query: string): DayOfGroup[] {
  const q = fold(query.trim())
  if (!q) return groups
  return groups
    .map((g) => ({
      ...g,
      shifts: g.shifts
        .map((s) => (fold(`${s.roleName} ${s.label}`).includes(q) ? s : { ...s, people: s.people.filter((p) => fold(personName(p)).includes(q)) }))
        .filter((s) => s.people.length > 0 || fold(`${s.roleName} ${s.label}`).includes(q)),
    }))
    .filter((g) => g.shifts.length > 0)
}

export type ShiftCounts = { expected: number; present: number; missing: number }

/** Expected (confirmed) people, those marked present, and the places nobody has taken. */
export function shiftCounts(shift: Pick<DayOfShift, "capacity" | "people">, isPresent: (p: DayOfPerson) => boolean): ShiftCounts {
  const expected = shift.people.length
  return { expected, present: shift.people.filter(isPresent).length, missing: Math.max(0, shift.capacity - expected) }
}

const s = (n: number) => (n > 1 ? "s" : "")

/** « 2 présents sur 4 attendus » for a shift card. */
export function presenceLine(c: ShiftCounts): string {
  if (c.expected === 0) return "Personne d'inscrit"
  return `${c.present} présent${s(c.present)} sur ${c.expected} attendu${s(c.expected)}`
}

/** « Il manque 1 personne. », or null when every place is taken. */
export function missingLine(c: ShiftCounts): string | null {
  return c.missing > 0 ? `Il manque ${c.missing} personne${s(c.missing)}.` : null
}

/** « de 22h à 2h le lendemain » for a shift card. */
export function shiftHours(sh: Pick<DayOfShift, "startTime" | "endTime">): string {
  return `de ${fmtHour(sh.startTime)} à ${fmtHour(sh.endTime)}${crossesMidnight(sh.startTime, sh.endTime) ? " le lendemain" : ""}`
}

/**
 * Heading of a group of shifts starting together: « Depuis 14h » for running ones, « À 16h » for
 * the coming ones, « 8h » for the ones over. A start on another day than today is named (« hier »,
 * « demain »), so a night shift that started yesterday reads « Depuis hier 22h ».
 */
export function groupHeading(g: Pick<DayOfGroup, "date" | "startTime">, phase: Exclude<DayOfPhase, "later">, today: string): string {
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  const day = g.date === today ? "" : g.date === yesterday ? "hier " : g.date === tomorrow ? "demain " : ""
  const hour = fmtHour(g.startTime)
  if (phase === "in_progress") return `Depuis ${day}${hour}`
  if (phase === "upcoming") return day ? `Demain à ${hour}` : `À ${hour}`
  return `Commencé ${day}à ${hour}`
}

/** What the live region says after a toggle: the person, the new state, and where the shift stands. */
export function presenceAnnouncement(name: string, present: boolean, shift: string, c: ShiftCounts): string {
  return `${present ? "Présence enregistrée" : "Présence annulée"} pour ${name}. ${shift} : ${presenceLine(c)}.`
}

/** Said once typing has paused: how many shifts and people the search leaves. */
export function searchAnnouncement(groups: DayOfGroup[]): string {
  const shifts = groups.reduce((n, g) => n + g.shifts.length, 0)
  const people = groups.reduce((n, g) => n + g.shifts.reduce((m, sh) => m + sh.people.length, 0), 0)
  if (shifts === 0) return "Aucun résultat."
  return `${shifts} créneau${shifts > 1 ? "x" : ""}, ${people} personne${s(people)} affichée${s(people)}.`
}

/** A `tel:` link from a phone as typed: digits and a leading « + » only. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`
}

/**
 * The check-in request of this page: the very route and action of « Marquer présents » on the
 * registrations list (#399), for one registration, so the same rules (active registrations only,
 * no double mark) and the same event log entries apply.
 */
export function presenceRequest(eventId: string, registrationId: string, present: boolean): { url: string; body: { action: "check_in" | "undo_check_in"; registrationIds: string[] } } {
  return {
    url: `/api/admin/events/${encodeURIComponent(eventId)}/registrations/bulk`,
    body: { action: present ? "check_in" : "undo_check_in", registrationIds: [registrationId] },
  }
}
