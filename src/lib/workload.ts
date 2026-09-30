// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Workload warnings (#465): a volunteer who stays too long on one day, or chains shifts with only
 * short breaks, gets a non-blocking warning in the sign-up recap; the organiser sees the same
 * situations in the registrations list and the dashboard. Overlaps are a separate, blocking rule.
 *
 * Times are real instants in the organisation's time zone, so a shift across a daylight saving
 * change lasts what it really lasts. A shift crossing midnight counts in the daily total of the
 * day it starts; continuity is measured on absolute time, across midnight. Pure.
 */
import { toMin, toMinEnd } from "./gantt-utils"
import { fmtDay, fmtDuration } from "./signup-recap"
import { localDateTimeToUtc } from "./time-zone"

export const WORKLOAD_LIMITS = {
  /** Above this total on one day, a warning. */
  dailyMinutes: 8 * 60,
  /** Above this without a real break, a warning. */
  continuousMinutes: 6 * 60,
  /** Breaks shorter than this count as continuous time. */
  shortBreakMinutes: 30,
}
export type WorkloadLimits = typeof WORKLOAD_LIMITS

export type WorkloadShift = { id: string; date: string | Date; startTime: string; endTime: string }

export type WorkloadWarning =
  | { kind: "daily"; day: string; minutes: number; shiftIds: string[] }
  | { kind: "continuous"; day: string; minutes: number; startTime: string; endTime: string; shiftIds: string[] }

const MIN = 60_000
const dayKey = (d: string | Date) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10))
const hhmm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`

type Interval = { id: string; day: string; start: number; end: number; startTime: string; endTime: string }

function interval(s: WorkloadShift, timeZone: string): Interval {
  const day = dayKey(s.date)
  const base = new Date(`${day}T00:00:00Z`)
  // Hours past 24 (an end after midnight) roll over to the next day in localDateTimeToUtc.
  const start = localDateTimeToUtc(base, hhmm(toMin(s.startTime)), timeZone).getTime()
  const end = localDateTimeToUtc(base, hhmm(toMinEnd(s.endTime, s.startTime)), timeZone).getTime()
  return { id: s.id, day, start, end, startTime: s.startTime, endTime: s.endTime }
}

/** The warnings for one volunteer's confirmed shifts (never waitlist entries or offers). */
export function workloadWarnings(shifts: WorkloadShift[], timeZone: string, limits: WorkloadLimits = WORKLOAD_LIMITS): WorkloadWarning[] {
  const all = shifts.map((s) => interval(s, timeZone)).sort((a, b) => a.start - b.start || a.end - b.end)
  const warnings: WorkloadWarning[] = []

  // Continuous blocks: a break shorter than the limit (or an overlap) keeps the block going.
  let block: Interval[] = []
  let blockEnd = 0
  const flush = () => {
    if (block.length === 0) return
    const minutes = Math.round((blockEnd - block[0].start) / MIN)
    if (minutes > limits.continuousMinutes) {
      const last = block.reduce((a, b) => (b.end > a.end ? b : a))
      warnings.push({ kind: "continuous", day: block[0].day, minutes, startTime: block[0].startTime, endTime: last.endTime, shiftIds: block.map((b) => b.id) })
    }
  }
  for (const s of all) {
    if (block.length > 0 && s.start - blockEnd < limits.shortBreakMinutes * MIN) {
      block.push(s)
      blockEnd = Math.max(blockEnd, s.end)
    } else {
      flush()
      block = [s]
      blockEnd = s.end
    }
  }
  flush()

  // Daily totals, on the day each shift starts.
  const byDay = new Map<string, Interval[]>()
  for (const s of all) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s])
  for (const [day, list] of byDay) {
    const minutes = Math.round(list.reduce((n, s) => n + (s.end - s.start), 0) / MIN)
    if (minutes > limits.dailyMinutes) warnings.push({ kind: "daily", day, minutes, shiftIds: list.map((s) => s.id) })
  }

  return warnings.sort((a, b) => a.day.localeCompare(b.day) || (a.kind === "continuous" ? -1 : 1))
}

const clock = (t: string) => {
  const [h, m] = t.split(":")
  const hour = ((parseInt(h, 10) % 24) + 24) % 24
  return m === "00" ? `${hour} h` : `${hour} h ${m}`
}

/** One sentence per warning, the same for volunteers and organisers. */
export function workloadMessage(w: WorkloadWarning): string {
  const day = fmtDay(w.day)
  if (w.kind === "continuous") {
    return `${day} : ${fmtDuration(w.minutes)} d'affilée, de ${clock(w.startTime)} à ${clock(w.endTime)}, sans pause d'au moins ${WORKLOAD_LIMITS.shortBreakMinutes} minutes.`
  }
  return `${day} : ${fmtDuration(w.minutes)} de créneaux dans la journée.`
}

/** Registrations grouped per volunteer, for the organiser's views: volunteer id → warnings. */
export function workloadByVolunteer(
  registrations: { volunteerId: string; status: string; shift: WorkloadShift }[],
  timeZone: string,
  limits: WorkloadLimits = WORKLOAD_LIMITS,
): Map<string, WorkloadWarning[]> {
  const shifts = new Map<string, WorkloadShift[]>()
  for (const r of registrations) {
    if (r.status !== "active") continue
    shifts.set(r.volunteerId, [...(shifts.get(r.volunteerId) ?? []), r.shift])
  }
  const out = new Map<string, WorkloadWarning[]>()
  for (const [id, list] of shifts) {
    const w = workloadWarnings(list, timeZone, limits)
    if (w.length > 0) out.set(id, w)
  }
  return out
}
