import { describe, expect, it } from "vitest"
import { plannedHours, type PlannedRegistration } from "../planned-hours"

const TZ = "Europe/Zurich"
const reg = (date: string, startTime: string, endTime: string, status = "active"): PlannedRegistration => ({
  status,
  shift: { date, startTime, endTime },
})

describe("plannedHours", () => {
  it("counts an ordinary shift", () => {
    expect(plannedHours([reg("2026-07-04", "18:00", "21:30")], TZ)).toBe(3.5)
  })

  it("counts a shift past midnight up to its end the next day", () => {
    expect(plannedHours([reg("2026-07-04", "22:00", "02:00")], TZ)).toBe(4)
  })

  it("counts one hour less across the spring change (last Sunday of March 2026)", () => {
    // 29 March 2026: 02:00 jumps to 03:00 in Europe/Zurich.
    expect(plannedHours([reg("2026-03-29", "01:00", "05:00")], TZ)).toBe(3)
    // Starting the evening before and running past midnight through the change.
    expect(plannedHours([reg("2026-03-28", "22:00", "04:00")], TZ)).toBe(5)
  })

  it("counts one hour more across the autumn change (last Sunday of October 2026)", () => {
    // 25 October 2026: 03:00 falls back to 02:00 in Europe/Zurich.
    expect(plannedHours([reg("2026-10-25", "01:00", "05:00")], TZ)).toBe(5)
    expect(plannedHours([reg("2026-10-24", "22:00", "04:00")], TZ)).toBe(7)
  })

  it("leaves the same wall-clock shift unchanged on days without a change", () => {
    expect(plannedHours([reg("2026-03-22", "01:00", "05:00"), reg("2026-11-01", "01:00", "05:00")], TZ)).toBe(8)
  })

  it("sums every active registration and skips cancelled, waiting, offered and requested ones", () => {
    const regs = [
      reg("2026-07-04", "18:00", "21:00"),
      reg("2026-07-05", "10:00", "12:00"),
      reg("2026-07-06", "10:00", "12:00", "cancelled"),
      reg("2026-07-06", "14:00", "16:00", "waiting"),
      reg("2026-07-06", "18:00", "20:00", "offered"),
      reg("2026-07-07", "10:00", "12:00", "requested"),
    ]
    expect(plannedHours(regs, TZ)).toBe(5)
  })

  it("is zero without registrations", () => {
    expect(plannedHours([], TZ)).toBe(0)
  })

  it("accepts the shift date as a Date (as stored, midnight UTC)", () => {
    expect(plannedHours([{ status: "active", shift: { date: new Date("2026-10-25T00:00:00Z"), startTime: "01:00", endTime: "05:00" } }], TZ)).toBe(5)
  })
})
