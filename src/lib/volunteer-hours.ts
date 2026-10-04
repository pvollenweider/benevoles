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
 *
 * #557 adds a fourth layer on top, without touching the three above (the certificate keeps its own,
 * differently-named field for its own split, `EventHourSummary.plannedWithoutPresenceMinutes`):
 *   4. `pastEntries` / `splitMinutes` / `lastParticipation` / `memberHourTotals` for the members
 *      list and the "hours by volunteer" export, and `returningVolunteerIds` for the event summary's
 *      first-time/returning split. Everywhere here (and in event-summary.ts), "planned hours" means
 *      every counted minute, attested or not — the total a volunteer was slated for — and "attested
 *      hours" is the recorded-presence *subset* of it: attested ≤ planned, always (owner decision,
 *      #557). That is a different meaning from the certificate's own
 *      `plannedWithoutPresenceMinutes`, which is deliberately a non-overlapping complement
 *      ("planned, as opposed to attested") for its own table — the field name says so, so the two
 *      are never confused by a shared `plannedMinutes` name.
 */
import { shiftInstants } from "./ics"

export type HourRegistration = {
  id: string
  /** Only needed by callers that mix several volunteers in one list (event summary, period export). */
  volunteerId?: string
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
  /** Carried over from `HourRegistration.volunteerId` when the caller set it. */
  volunteerId?: string
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
  /** Confirmed shifts with NO recorded presence only — the complement of attestedMinutes, not the
   * total (contrast `splitMinutes`'s `plannedMinutes`, below, which is the total). Named
   * differently from that one on purpose: the certificate's own table shows this as "heures
   * planifiées (sans présence)", a second, non-overlapping column next to attestedMinutes. */
  plannedWithoutPresenceMinutes: number
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

/** Today as a local "YYYY-MM-DD" in the organisation's time zone. */
export function localToday(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)!.value
  return `${get("year")}-${get("month")}-${get("day")}`
}

/** Last 12 months ending today, in the organisation's time zone, as local "YYYY-MM-DD" bounds. */
export function defaultPeriod(now: Date, timeZone: string): Period {
  const to = localToday(now, timeZone)
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
      volunteerId: r.volunteerId,
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
      plannedWithoutPresenceMinutes: list.filter((e) => !e.attested).reduce((n, e) => n + e.minutes, 0),
      noCheckIn: !list.some((e) => e.attested),
    }
  })
}

export const totalMinutes = (entries: HourEntry[], attestedOnly: boolean): number =>
  entries.filter((e) => !attestedOnly || e.attested).reduce((n, e) => n + e.minutes, 0)

/** Entries whose shift starts on or before `today` ("YYYY-MM-DD", local) — #557: a future, merely
 * confirmed shift is not yet "planned hours given", it just hasn't happened. */
export function pastEntries(entries: HourEntry[], today: string): HourEntry[] {
  return entries.filter((e) => e.localDate <= today)
}

/**
 * Planned and attested minutes of a set of entries (#557, owner decision): planned = every
 * counted minute, attested or not (the total a volunteer was slated for); attested = the subset of
 * it with a recorded presence. So attested ≤ planned always, never a separate, non-overlapping
 * bucket — a volunteer present at every shift shows attested == planned, not attested with 0
 * planned. Used by the members list, the "hours by volunteer" export and the event summary
 * (#557); the certificate keeps its own, differently-named, non-overlapping split in
 * `eventHourSummaries` (`EventHourSummary.plannedWithoutPresenceMinutes`).
 */
export function splitMinutes(entries: HourEntry[]): { plannedMinutes: number; attestedMinutes: number } {
  return { plannedMinutes: totalMinutes(entries, false), attestedMinutes: totalMinutes(entries, true) }
}

export type LastParticipation = {
  /** Local date of the most recent counted entry, confirmed or attested. */
  lastShiftDate: string | null
  /** Local date of the most recent entry with a recorded presence. */
  lastPresenceDate: string | null
}

/** The most recent shift date and the most recent presence date among `entries` (#557). Null when
 * there is none of either kind — distinct from "today", never confused with it by a caller. */
export function lastParticipation(entries: HourEntry[]): LastParticipation {
  const maxDate = (list: HourEntry[]): string | null =>
    list.reduce<string | null>((max, e) => (max === null || e.localDate > max ? e.localDate : max), null)
  return { lastShiftDate: maxDate(entries), lastPresenceDate: maxDate(entries.filter((e) => e.attested)) }
}

export type MemberHourTotals = {
  volunteerId: string
  eventsCount: number
  shiftsCount: number
  plannedMinutes: number
  attestedMinutes: number
}

/** Entries of several volunteers, grouped per `volunteerId` (#557: the "hours by volunteer" export).
 * `entries` must already carry `volunteerId` (set it on the `HourRegistration`s before calling
 * `volunteerHourEntries`). Order follows each volunteer's first entry. */
export function memberHourTotals(entries: HourEntry[]): MemberHourTotals[] {
  const order: string[] = []
  const byVolunteer = new Map<string, HourEntry[]>()
  for (const e of entries) {
    const id = e.volunteerId
    if (!id) continue
    if (!byVolunteer.has(id)) {
      byVolunteer.set(id, [])
      order.push(id)
    }
    byVolunteer.get(id)!.push(e)
  }
  return order.map((volunteerId) => {
    const list = byVolunteer.get(volunteerId)!
    const { plannedMinutes, attestedMinutes } = splitMinutes(list)
    return { volunteerId, eventsCount: new Set(list.map((e) => e.eventId)).size, shiftsCount: list.length, plannedMinutes, attestedMinutes }
  })
}

export type VolunteerEventRecord = { volunteerId: string; eventId: string; eventStart: Date }

/**
 * Volunteer ids that are "returning" for `eventId` (#557): among `records` — every counted
 * registration across the whole organisation — at least one is for a *different* event whose
 * start is strictly before `eventStart`. Everyone else (never registered elsewhere, or only on
 * events starting on or after this one) is first-time for this event.
 */
export function returningVolunteerIds(records: VolunteerEventRecord[], eventId: string, eventStart: Date): Set<string> {
  const ids = new Set<string>()
  for (const r of records) {
    if (r.eventId === eventId) continue
    if (r.eventStart.getTime() < eventStart.getTime()) ids.add(r.volunteerId)
  }
  return ids
}
