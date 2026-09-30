import { describe, it, expect } from "vitest"
import { workloadByVolunteer, workloadMessage, workloadWarnings } from "../workload"

const TZ = "Europe/Zurich"
let n = 0
const s = (date: string, startTime: string, endTime: string) => ({ id: `s${++n}`, date, startTime, endTime })

// Non-blocking workload warnings (#465).
describe("workloadWarnings", () => {
  it("warns above 8 h in one day, not at exactly 8 h", () => {
    const eight = [s("2026-07-04", "08:00", "12:00"), s("2026-07-04", "14:00", "18:00")]
    expect(workloadWarnings(eight, TZ)).toEqual([])
    const more = [...eight, s("2026-07-04", "19:00", "19:30")]
    expect(workloadWarnings(more, TZ)).toEqual([{ kind: "daily", day: "2026-07-04", minutes: 510, shiftIds: more.map((x) => x.id) }])
  })

  it("warns above 6 h without a real break, a short break counting as continuous", () => {
    // 10:00–13:00, 20 min break, 13:20–16:30: 6 h 30 d'affilée.
    const chained = [s("2026-07-04", "10:00", "13:00"), s("2026-07-04", "13:20", "16:30")]
    expect(workloadWarnings(chained, TZ)).toMatchObject([{ kind: "continuous", minutes: 390, startTime: "10:00", endTime: "16:30" }])
    // Exactly 6 h continuous: no warning.
    expect(workloadWarnings([s("2026-07-04", "10:00", "13:00"), s("2026-07-04", "13:00", "16:00")], TZ)).toEqual([])
  })

  it("treats a break of 29 min as continuous and 30 min as a real break", () => {
    expect(workloadWarnings([s("2026-07-04", "08:00", "11:00"), s("2026-07-04", "11:29", "14:30")], TZ)).toMatchObject([{ kind: "continuous" }])
    expect(workloadWarnings([s("2026-07-04", "08:00", "11:00"), s("2026-07-04", "11:30", "14:31")], TZ)).toEqual([])
  })

  it("follows a night across midnight, and counts it on the day it starts", () => {
    const night = [s("2026-07-04", "20:00", "23:30"), s("2026-07-04", "23:45", "03:00")]
    const w = workloadWarnings(night, TZ)
    expect(w).toMatchObject([{ kind: "continuous", day: "2026-07-04", minutes: 420, endTime: "03:00" }])
    // A shift of the next day is not in the evening's daily total.
    expect(workloadWarnings([s("2026-07-04", "14:00", "20:00"), s("2026-07-05", "09:00", "12:00")], TZ)).toEqual([])
  })

  it("uses real time on a daylight saving day", () => {
    // Night of 25 October 2026: clocks go back at 03:00, so 00:00–06:30 lasts 7 h 30.
    expect(workloadWarnings([s("2026-10-25", "00:00", "06:30")], TZ)).toMatchObject([{ kind: "continuous", minutes: 450 }])
    // 29 March 2026: clocks go forward at 02:00, so 00:00–06:30 lasts 5 h 30.
    expect(workloadWarnings([s("2026-03-29", "00:00", "06:30")], TZ)).toEqual([])
  })
})

describe("workloadMessage", () => {
  it("says the day, the duration and the hours", () => {
    const [c] = workloadWarnings([s("2026-07-04", "10:00", "13:00"), s("2026-07-04", "13:20", "16:30")], TZ)
    expect(workloadMessage(c)).toBe("Samedi 4 juillet : 6 h 30 d'affilée, de 10 h à 16 h 30, sans pause d'au moins 30 minutes.")
    expect(workloadMessage({ kind: "daily", day: "2026-07-04", minutes: 540, shiftIds: [] })).toBe("Samedi 4 juillet : 9 h de créneaux dans la journée.")
  })
})

describe("workloadByVolunteer", () => {
  it("counts only active registrations, per volunteer", () => {
    const long = s("2026-07-04", "08:00", "15:00")
    const regs = [
      { volunteerId: "v1", status: "active", shift: long },
      { volunteerId: "v2", status: "waiting", shift: long },
      { volunteerId: "v3", status: "offered", shift: long },
      { volunteerId: "v4", status: "active", shift: s("2026-07-04", "08:00", "10:00") },
    ]
    const map = workloadByVolunteer(regs, TZ)
    expect([...map.keys()]).toEqual(["v1"])
  })
})
