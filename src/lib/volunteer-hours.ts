// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Counting rules for volunteer hours, shared by the volunteer certificate (#556) and the
 * post-event summary / hours-by-volunteer export (#557): only `active` registrations on a shift
 * that was never cancelled count; attested = a recorded presence (`checkedInAt`); planned = a
 * confirmed shift without one; a shift belongs to a period by its local start date
 * (`Shift.date` already stores that calendar day, see ics.ts); durations are real instants in the
 * organisation's time zone via `shiftInstants`, so night shifts and DST changes count right.
 *
 * Pure: no Prisma import (this runs through pages and, eventually, client-shared code — see
 * src/lib/ics.ts and src/lib/workload.ts for the same discipline). Three layers, reused as a
 * whole or in parts by #557:
 *   1. `volunteerHourEntries` — one entry per counted registration (per-registration hours);
 *   2. `eventHourSummaries` — grouped per event (per-event aggregation, roles, shift count, the
 *      "no check-in at all" flag);
 *   3. `defaultPeriod` / `withinPeriod` — the shared period filter.
 */
import { shiftInstants } from "./ics"

export type HourRegistration = {
  id: string
  status: string
  checkedInAt: Date | null
  shift: {
    id: string
    roleName: string
    label: string
    /** "YYYY-MM-DD" or a Date at midnight UTC for that calendar day — see ics.ts. */
    date: string | Date
    startTime: string
    endTime: string
    status: string
  }
  event: { id: string; title: string }
}

export type Period = { from: string; to: string }

export type HourEntry = {
  registrationId: string
  eventId: string
  eventTitle: string
  shiftId: string
  roleName: string
  label: string
  /** Local calendar day the shift starts on, "YYYY-MM-DD". */
  localDate: string
  minutes: number
  /** A recorded presence (`checkedInAt`), as opposed to a confirmed shift with none. */
  attested: boolean
}

export type EventHourSummary = {
  eventId: string
  eventTitle: string
  /** Distinct role/label names, in the order first met, for display ("poste · variante"). */
  roles: string[]
  shiftsCount: number
  attestedMinutes: number
  plannedMinutes: number
  /** No shift of this event (within the entries given) has a recorded presence. */
  noCheckIn: boolean
}

const dayOf = (d: string | Date): string => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10))

/** Only `active` registrations on a shift that was never cancelled count — see owner decisions on #556. */
export function registrationCounts(r: Pick<HourRegistration, "status" | "shift">): boolean {
  return r.status === "active" && r.shift.status !== "cancelled"
}

export function withinPeriod(localDate: string, period: Period): boolean {
  return localDate >= period.from && localDate <= period.to
}

/** Last 12 months ending today, in the organisation's time zone, as local "YYYY-MM-DD" bounds. */
export function defaultPeriod(now: Date, timeZone: string): Period {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  const to = `${get("year")}-${get("month")}-${get("day")}`
  const fromDate = new Date(`${to}T00:00:00Z`)
  fromDate.setUTCFullYear(fromDate.getUTCFullYear() - 1)
  return { from: fromDate.toISOString().slice(0, 10), to }
}

/**
 * One entry per registration that counts and falls within the period (or every counted
 * registration, if no period is given). Minutes are the real duration of the shift's instants in
 * `timeZone` — a 22:00–02:00 shift is 240 minutes, a shift across a DST change its real duration.
 */
export function volunteerHourEntries(registrations: HourRegistration[], timeZone: string, period?: Period): HourEntry[] {
  const entries: HourEntry[] = []
  for (const r of registrations) {
    if (!registrationCounts(r)) continue
    const localDate = dayOf(r.shift.date)
    if (period && !withinPeriod(localDate, period)) continue
    const { start, end } = shiftInstants(r.shift, timeZone)
    const minutes = Math.round((end.getTime() - start.getTime()) / 60_000)
    entries.push({
      registrationId: r.id,
      eventId: r.event.id,
      eventTitle: r.event.title,
      shiftId: r.shift.id,
      roleName: r.shift.roleName,
      label: r.shift.label,
      localDate,
      minutes,
      attested: r.checkedInAt != null,
    })
  }
  return entries.sort((a, b) => a.localDate.localeCompare(b.localDate) || a.eventTitle.localeCompare(b.eventTitle, "fr"))
}

const shiftName = (e: { roleName: string; label: string }) => (e.label && e.label !== e.roleName ? `${e.roleName} (${e.label})` : e.roleName)

/** Entries grouped per event, in the order events first appear (chronological, since entries are sorted by date). */
export function eventHourSummaries(entries: HourEntry[]): EventHourSummary[] {
  const order: string[] = []
  const byEvent = new Map<string, HourEntry[]>()
  for (const e of entries) {
    if (!byEvent.has(e.eventId)) {
      byEvent.set(e.eventId, [])
      order.push(e.eventId)
    }
    byEvent.get(e.eventId)!.push(e)
  }
  return order.map((eventId) => {
    const list = byEvent.get(eventId)!
    const roles = [...new Set(list.map(shiftName))]
    return {
      eventId,
      eventTitle: list[0].eventTitle,
      roles,
      shiftsCount: list.length,
      attestedMinutes: list.filter((e) => e.attested).reduce((n, e) => n + e.minutes, 0),
      plannedMinutes: list.filter((e) => !e.attested).reduce((n, e) => n + e.minutes, 0),
      noCheckIn: !list.some((e) => e.attested),
    }
  })
}

export const totalMinutes = (entries: HourEntry[], attestedOnly: boolean): number =>
  entries.filter((e) => !attestedOnly || e.attested).reduce((n, e) => n + e.minutes, 0)
