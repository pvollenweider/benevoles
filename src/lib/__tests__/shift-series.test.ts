import { describe, it, expect } from "vitest"
import { addDays, describeSeries, fmtDuration, generateShiftSeries, seriesProblem, SERIES_MAX_SHIFTS } from "../shift-series"

const times = (slots: { startTime: string; endTime: string }[]) => slots.map((s) => `${s.startTime}-${s.endTime}`)

describe("generateShiftSeries", () => {
  it("divides the range into equal shifts (the buvette example)", () => {
    const slots = generateShiftSeries({ date: "2026-07-04", startTime: "10:00", endTime: "22:00", slotMinutes: 120 })
    expect(times(slots)).toEqual(["10:00-12:00", "12:00-14:00", "14:00-16:00", "16:00-18:00", "18:00-20:00", "20:00-22:00"])
    expect(slots.every((s) => s.date === "2026-07-04" && s.minutes === 120)).toBe(true)
  })

  it("makes the last shift shorter when the range doesn't divide evenly", () => {
    const slots = generateShiftSeries({ date: "2026-07-04", startTime: "09:00", endTime: "12:30", slotMinutes: 90 })
    expect(times(slots)).toEqual(["09:00-10:30", "10:30-12:00", "12:00-12:30"])
    expect(slots[2].minutes).toBe(30)
  })

  it("leaves a break between shifts", () => {
    const slots = generateShiftSeries({ date: "2026-07-04", startTime: "10:00", endTime: "13:00", slotMinutes: 60, breakMinutes: 30 })
    expect(times(slots)).toEqual(["10:00-11:00", "11:30-12:30"])
  })

  it("crosses midnight and dates shifts starting after midnight on the next day", () => {
    const slots = generateShiftSeries({ date: "2026-12-31", startTime: "22:00", endTime: "02:00", slotMinutes: 60 })
    expect(times(slots)).toEqual(["22:00-23:00", "23:00-00:00", "00:00-01:00", "01:00-02:00"])
    expect(slots.map((s) => s.date)).toEqual(["2026-12-31", "2026-12-31", "2027-01-01", "2027-01-01"])
  })

  it("never returns more than the cap", () => {
    const slots = generateShiftSeries({ date: "2026-07-04", startTime: "00:00", endTime: "23:59", slotMinutes: 15 })
    expect(slots).toHaveLength(SERIES_MAX_SHIFTS)
  })
})

describe("seriesProblem", () => {
  const ok = { date: "2026-07-04", startTime: "10:00", endTime: "22:00", slotMinutes: 120 }
  it("accepts a valid series", () => expect(seriesProblem(ok)).toBeNull())
  it("refuses a slot shorter than the minimum", () => expect(seriesProblem({ ...ok, slotMinutes: 10 })).toMatch(/15 minutes/))
  it("refuses a slot longer than the range", () => expect(seriesProblem({ ...ok, slotMinutes: 13 * 60 })).toMatch(/dépasse/))
  it("refuses equal start and end", () => expect(seriesProblem({ ...ok, endTime: "10:00" })).toMatch(/différente/))
  it("refuses a negative or huge break", () => {
    expect(seriesProblem({ ...ok, breakMinutes: -5 })).toMatch(/pause/)
    expect(seriesProblem({ ...ok, breakMinutes: 500 })).toMatch(/pause/)
  })
  it("refuses more shifts than the cap", () => expect(seriesProblem({ ...ok, startTime: "00:00", endTime: "23:59", slotMinutes: 15 })).toMatch(/au plus 48/))
})

describe("wording", () => {
  it("describes equal and uneven series", () => {
    expect(describeSeries(generateShiftSeries({ date: "2026-07-04", startTime: "10:00", endTime: "22:00", slotMinutes: 120 }))).toBe("6 créneaux de 2 h")
    expect(describeSeries(generateShiftSeries({ date: "2026-07-04", startTime: "09:00", endTime: "12:30", slotMinutes: 90 }))).toBe("3 créneaux de 1 h 30, le dernier de 30 min")
    expect(describeSeries(generateShiftSeries({ date: "2026-07-04", startTime: "09:00", endTime: "10:00", slotMinutes: 60 }))).toBe("1 créneau de 1 h")
    expect(describeSeries([])).toBe("Aucun créneau.")
  })
  it("formats durations", () => {
    expect(fmtDuration(45)).toBe("45 min")
    expect(fmtDuration(60)).toBe("1 h")
    expect(fmtDuration(150)).toBe("2 h 30")
  })
  it("adds days across months and years in UTC", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01")
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
  })
})
