import { describe, it, expect } from "vitest"
import {
  certificateTotals, eventHourSummaries, hasParallelShifts, memberHourTotals, personMinutes, splitMinutes, volunteerHourEntries, type HourRegistration,
} from "../volunteer-hours"
import { eventSummary } from "../event-summary"
import { workloadWarnings } from "../workload"
import { recapShifts, totalLabel } from "../signup-recap"

// Parallel shifts (#986): a person's total is the union of their shifts' time, counted once; two
// people at the same time still give twice the time; one shift's own duration never changes.
const TZ = "Europe/Zurich"
const DAY = "2026-07-04"

const reg = (id: string, startTime: string, endTime: string, over: { volunteerId?: string; attested?: boolean; eventId?: string; date?: string; roleName?: string } = {}): HourRegistration & { volunteerId: string } => ({
  id,
  volunteerId: over.volunteerId ?? "vol-1",
  status: "active",
  checkedInAt: over.attested === false ? null : new Date(`${over.date ?? DAY}T08:00:00Z`),
  event: { id: over.eventId ?? "event-1", title: over.eventId ?? "Fête" },
  shift: { id: `shift-${id}`, roleName: over.roleName ?? id, label: over.roleName ?? id, date: over.date ?? DAY, startTime, endTime, status: "open" },
})

describe("per-person hours count parallel time once", () => {
  const coffee = reg("buvette", "10:00", "14:00")
  const firstAid = reg("secours", "09:00", "17:00")

  it("keeps each shift's own duration on its line", () => {
    const entries = volunteerHourEntries([coffee, firstAid], TZ)
    expect(entries.map((e) => e.minutes).sort()).toEqual([240, 480])
    expect(entries[0].startMs).toBeTypeOf("number")
  })

  it("totals the union for one person: 8 h, not 12 h", () => {
    const entries = volunteerHourEntries([coffee, firstAid], TZ)
    expect(personMinutes(entries)).toBe(480)
    expect(splitMinutes(entries)).toEqual({ plannedMinutes: 480, attestedMinutes: 480 })
    expect(hasParallelShifts(entries)).toBe(true)
  })

  it("partially overlapping shifts: 6 h", () => {
    const entries = volunteerHourEntries([coffee, reg("secours", "12:00", "16:00")], TZ)
    expect(splitMinutes(entries).plannedMinutes).toBe(360)
  })

  it("keeps the attested hours a subset: only the attested shift's time", () => {
    const entries = volunteerHourEntries([coffee, reg("secours", "12:00", "16:00", { attested: false })], TZ)
    expect(splitMinutes(entries)).toEqual({ plannedMinutes: 360, attestedMinutes: 240 })
  })

  it("does not merge two different people working at the same time", () => {
    const entries = volunteerHourEntries([coffee, reg("buvette-2", "10:00", "14:00", { volunteerId: "vol-2" })], TZ)
    expect(personMinutes(entries)).toBe(480)
    expect(hasParallelShifts(entries)).toBe(false)
  })

  it("sums shifts that do not overlap, touching ones included", () => {
    const entries = volunteerHourEntries([reg("a", "08:00", "10:00"), reg("b", "10:00", "12:00"), reg("c", "14:00", "15:00")], TZ)
    expect(personMinutes(entries)).toBe(300)
    expect(hasParallelShifts(entries)).toBe(false)
  })

  it("counts a night shift and a parallel one once, across midnight", () => {
    const entries = volunteerHourEntries([reg("bar", "20:00", "02:00"), reg("secours", "23:00", "03:00")], TZ)
    expect(personMinutes(entries)).toBe(420)
  })

  it("counts real time on a daylight saving night", () => {
    // 25 October 2026, Zurich: 03:00 back to 02:00; 01:00–04:00 lasts 4 h. A parallel 02:30–03:30
    // falls inside it, whichever 02:30 it is.
    const entries = volunteerHourEntries([reg("bar", "01:00", "04:00", { date: "2026-10-25" }), reg("secours", "01:30", "03:30", { date: "2026-10-25" })], TZ)
    expect(entries.find((e) => e.roleName === "bar")!.minutes).toBe(240)
    expect(personMinutes(entries)).toBe(240)
  })

  it("gives each member their own union in the hours-by-volunteer export", () => {
    const entries = volunteerHourEntries([coffee, firstAid, reg("x", "10:00", "11:00", { volunteerId: "vol-2" })], TZ)
    expect(memberHourTotals(entries)).toEqual([
      { volunteerId: "vol-1", eventsCount: 1, shiftsCount: 2, plannedMinutes: 480, attestedMinutes: 480 },
      { volunteerId: "vol-2", eventsCount: 1, shiftsCount: 1, plannedMinutes: 60, attestedMinutes: 60 },
    ])
  })

  it("counts the union on the certificate, per event and in total", () => {
    const entries = volunteerHourEntries([
      coffee,
      reg("secours", "12:00", "16:00", { attested: false }),
      reg("autre", "13:00", "15:00", { eventId: "event-2" }),
    ], TZ)
    const summaries = eventHourSummaries(entries)
    const first = summaries.find((x) => x.eventId === "event-1")
    const second = summaries.find((x) => x.eventId === "event-2")
    expect(first).toMatchObject({ shiftsCount: 2, attestedMinutes: 240, plannedWithoutPresenceMinutes: 120 })
    expect(second).toMatchObject({ shiftsCount: 1, attestedMinutes: 120, plannedWithoutPresenceMinutes: 0 })
    // 10–16 in all; attested 10–15 (coffee and the other event's 13–15).
    expect(certificateTotals(entries)).toEqual({ attestedMinutes: 300, plannedWithoutPresenceMinutes: 60 })
    // The rows add up to 8 h, the total is 6 h: the note says why.
    expect(summaries.reduce((n, x) => n + x.attestedMinutes + x.plannedWithoutPresenceMinutes, 0)).toBe(480)
    expect(hasParallelShifts(entries)).toBe(true)
  })

  it("says there is parallel time exactly when the totals remove minutes", () => {
    const apart = volunteerHourEntries([reg("a", "08:00", "10:00"), reg("b", "10:00", "12:00", { eventId: "event-2" })], TZ)
    const sum = (es: typeof apart) => es.reduce((n, e) => n + e.minutes, 0)
    const totals = (es: typeof apart) => { const t = certificateTotals(es); return t.attestedMinutes + t.plannedWithoutPresenceMinutes }
    expect(hasParallelShifts(apart)).toBe(false)
    expect(totals(apart)).toBe(sum(apart))
    const across = volunteerHourEntries([reg("a", "08:00", "11:00"), reg("b", "10:00", "12:00", { eventId: "event-2" })], TZ)
    expect(hasParallelShifts(across)).toBe(true)
    expect(totals(across)).toBeLessThan(sum(across))
  })

  it("sums each volunteer's union in the event summary", () => {
    const summary = eventSummary([coffee, firstAid, reg("x", "10:00", "14:00", { volunteerId: "vol-2" })], new Set(), [], [], TZ)
    expect(summary.plannedMinutes).toBe(720)
    expect(summary.shiftsConfirmed).toBe(3)
  })
})

describe("workload warnings count parallel time once", () => {
  it("does not raise « Journée chargée » for two parallel shifts within the day's limit", () => {
    const shifts = [
      { id: "secours", date: DAY, startTime: "09:00", endTime: "16:00" },
      { id: "buvette", date: DAY, startTime: "10:00", endTime: "14:00" },
    ]
    expect(workloadWarnings(shifts, TZ).filter((w) => w.kind === "daily")).toEqual([])
  })

  it("still raises it above the limit", () => {
    const shifts = [
      { id: "secours", date: DAY, startTime: "08:00", endTime: "17:00" },
      { id: "buvette", date: DAY, startTime: "10:00", endTime: "14:00" },
    ]
    expect(workloadWarnings(shifts, TZ).find((w) => w.kind === "daily")).toMatchObject({ minutes: 540 })
  })
})

describe("sign-up recap total counts parallel time once", () => {
  const input = (id: string, startTime: string, endTime: string, overlapAllowed = false) => ({
    id, roleName: id, label: id, date: DAY, startTime, endTime, status: "open", waitlistEnabled: false, minAge: null, overlapAllowed,
  })

  it("says « 2 créneaux, 8 h au total » for coffee within first aid", () => {
    expect(totalLabel(recapShifts([input("buvette", "10:00", "14:00"), input("secours", "09:00", "17:00", true)]))).toBe("2 créneaux, 8 h au total")
  })

  it("still adds separate shifts", () => {
    expect(totalLabel(recapShifts([input("a", "10:00", "12:00"), input("b", "14:00", "15:30")]))).toBe("2 créneaux, 3 h 30 au total")
  })
})
