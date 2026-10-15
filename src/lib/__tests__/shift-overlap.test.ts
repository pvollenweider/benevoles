import { describe, it, expect } from "vitest"
import { allowedOverlap, roleOverlapAllowed, shiftsClash } from "../shift-overlap"

// The one overlap rule (#986): two shifts clash for one volunteer when their hours overlap and
// neither belongs to a cumulable role.
const shift = (date: string, startTime: string, endTime: string, overlapAllowed?: boolean | null) => ({ date, startTime, endTime, overlapAllowed })

describe("shiftsClash", () => {
  const coffee = shift("2026-07-04", "10:00", "14:00")
  const firstAid = shift("2026-07-04", "09:00", "17:00", true)

  it("refuses two overlapping shifts when neither role is cumulable", () => {
    expect(shiftsClash(coffee, shift("2026-07-04", "12:00", "16:00"))).toBe(true)
    expect(shiftsClash(coffee, shift("2026-07-04", "12:00", "16:00", false))).toBe(true)
    expect(shiftsClash(coffee, shift("2026-07-04", "12:00", "16:00", null))).toBe(true)
  })

  it("lets them overlap when one of the two is cumulable, whichever side", () => {
    expect(shiftsClash(coffee, firstAid)).toBe(false)
    expect(shiftsClash(firstAid, coffee)).toBe(false)
  })

  it("lets them overlap when both are cumulable, including two shifts of the same cumulable role", () => {
    expect(shiftsClash(firstAid, shift("2026-07-04", "16:00", "20:00", true))).toBe(false)
  })

  it("never clashes without an overlap, cumulable or not", () => {
    expect(shiftsClash(coffee, shift("2026-07-04", "15:00", "16:00"))).toBe(false)
    expect(shiftsClash(coffee, shift("2026-07-05", "10:00", "14:00"))).toBe(false)
    expect(shiftsClash(firstAid, shift("2026-07-05", "10:00", "14:00"))).toBe(false)
  })

  it("does not count touching ends as an overlap", () => {
    expect(shiftsClash(coffee, shift("2026-07-04", "14:00", "18:00"))).toBe(false)
    expect(shiftsClash(coffee, shift("2026-07-04", "08:00", "10:00"))).toBe(false)
  })

  it("refuses identical hours and a shift inside another, unless cumulable", () => {
    expect(shiftsClash(coffee, shift("2026-07-04", "10:00", "14:00"))).toBe(true)
    expect(shiftsClash(coffee, shift("2026-07-04", "11:00", "12:00"))).toBe(true)
    expect(shiftsClash(coffee, shift("2026-07-04", "11:00", "12:00", true))).toBe(false)
  })

  it("reads a night shift into the next day", () => {
    const night = shift("2026-07-04", "22:00", "02:00")
    expect(shiftsClash(night, shift("2026-07-05", "01:00", "03:00"))).toBe(true)
    expect(shiftsClash(night, shift("2026-07-05", "02:00", "04:00"))).toBe(false)
    expect(shiftsClash(night, shift("2026-07-05", "01:00", "03:00", true))).toBe(false)
    expect(shiftsClash(shift("2026-07-04", "22:00", "02:00", true), shift("2026-07-05", "00:30", "01:30"))).toBe(false)
  })

  it("compares wall-clock hours on a daylight saving night (the printed hours)", () => {
    // 29 March 2026, Europe: 02:00 does not exist; the shifts still overlap on their printed hours.
    const a = shift("2026-03-29", "01:00", "04:00")
    expect(shiftsClash(a, shift("2026-03-29", "03:00", "05:00"))).toBe(true)
    expect(shiftsClash(a, shift("2026-03-29", "03:00", "05:00", true))).toBe(false)
  })

  it("accepts Date values for the day", () => {
    expect(shiftsClash({ ...coffee, date: new Date("2026-07-04T00:00:00Z") }, shift("2026-07-04", "13:00", "15:00"))).toBe(true)
  })

  it("treats a missing option as not cumulable, as before #986", () => {
    expect(shiftsClash({ date: "2026-07-04", startTime: "10:00", endTime: "12:00" }, { date: "2026-07-04", startTime: "11:00", endTime: "13:00" })).toBe(true)
  })
})

describe("allowedOverlap", () => {
  it("is an overlap the rule lets through", () => {
    expect(allowedOverlap(shift("2026-07-04", "10:00", "14:00"), shift("2026-07-04", "12:00", "16:00", true))).toBe(true)
    expect(allowedOverlap(shift("2026-07-04", "10:00", "14:00"), shift("2026-07-04", "12:00", "16:00"))).toBe(false)
    expect(allowedOverlap(shift("2026-07-04", "10:00", "14:00", true), shift("2026-07-04", "14:00", "16:00"))).toBe(false)
  })
})

describe("roleOverlapAllowed", () => {
  it("is on when every shift of the role has it", () => {
    const shifts = [
      { roleName: "Secours", overlapAllowed: true },
      { roleName: "Secours", overlapAllowed: true },
      { roleName: "Buvette", overlapAllowed: false },
    ]
    expect(roleOverlapAllowed(shifts, "Secours")).toBe(true)
    expect(roleOverlapAllowed(shifts, "Buvette")).toBe(false)
  })

  it("is off when one shift missed it, or for a role without shifts", () => {
    expect(roleOverlapAllowed([{ roleName: "Secours", overlapAllowed: true }, { roleName: "Secours" }], "Secours")).toBe(false)
    expect(roleOverlapAllowed([], "Secours")).toBe(false)
  })
})
