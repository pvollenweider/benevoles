import { describe, it, expect } from "vitest"
import { isValidClock, clockSchema } from "../shift-time"
import { crossesMidnight, fromMin, fmt, fmtRange, hourLabel, isOvernight, toMin, toMinEnd } from "../gantt-utils"

describe("isValidClock", () => {
  it.each(["00:00", "08:30", "12:59", "23:59"])("accepts %s", (v) => {
    expect(isValidClock(v)).toBe(true)
  })

  it.each(["24:00", "25:30", "26:00", "-2:-15", "9:00", "12:60", "08:5", "", "abc", "08:00:00", " 08:00"])(
    "rejects %j",
    (v) => {
      expect(isValidClock(v)).toBe(false)
    },
  )

  it("explains the rule and the overnight form in the error message", () => {
    const result = clockSchema.safeParse("26:00")
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toMatch(/00:00 à 23:59/)
  })
})

describe("fromMin", () => {
  it("wraps at midnight instead of producing 24:00 or 26:00", () => {
    expect(fromMin(1440)).toBe("00:00")
    expect(fromMin(1560)).toBe("02:00")
    expect(fromMin(1530)).toBe("01:30")
  })

  it("never produces a negative time", () => {
    expect(fromMin(-45)).toBe("23:15")
    expect(fromMin(-135)).toBe("21:45")
  })

  it("keeps normal times", () => {
    expect(fromMin(0)).toBe("00:00")
    expect(fromMin(510)).toBe("08:30")
    expect(fromMin(1439)).toBe("23:59")
  })
})

describe("overnight shifts", () => {
  it("reads an end earlier than the start as the next morning", () => {
    expect(isOvernight("22:00", "02:00")).toBe(true)
    expect(isOvernight("22:00", "00:00")).toBe(true)
    // Ending at exactly midnight is the end of the same day, not the next morning.
    expect(crossesMidnight("22:00", "00:00")).toBe(false)
    expect(crossesMidnight("22:00", "02:00")).toBe(true)
    expect(isOvernight("08:00", "10:00")).toBe(false)
    expect(toMinEnd("02:00", "22:00")).toBe(26 * 60)
  })

  it("keeps a chart position after midnight readable as a clock", () => {
    expect(toMin("22:00")).toBe(1320)
    expect(hourLabel(24)).toBe("00h")
    expect(hourLabel(26)).toBe("02h")
    expect(hourLabel(9)).toBe("09h")
  })
})

describe("legacy hours above 23 are displayed modulo 24", () => {
  it("fmt", () => {
    expect(fmt("24:00")).toBe("00h")
    expect(fmt("25:30")).toBe("01h30")
    expect(fmt("26:00")).toBe("02h")
    expect(fmt("08:00")).toBe("08h")
  })

  it("fmtRange", () => {
    // Legacy 24:00 to 26:00 reads as 00:00 to 02:00 (26:00 is later than 24:00, so not an overnight wrap).
    expect(fmtRange("24:00", "26:00")).toBe("00:00–02:00")
    expect(fmtRange("08:00", "10:00")).toBe("08:00–10:00")
    expect(fmtRange("22:00", "02:00")).toBe("22:00–02:00 (jusqu'au lendemain)")
    expect(fmtRange("22:00", "00:00")).toBe("22:00–00:00")
  })
})
