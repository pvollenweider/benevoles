import { describe, it, expect } from "vitest"
import { birthDateSchema, civilDateSchema, isCivilDate, isOrderedPeriod, isPlausibleBirthDate } from "../civil-date"

// Calendar dates as the API accepts them (audit: invalid birth dates bypassed the minimum age).
describe("civil dates", () => {
  it("accepts real days written YYYY-MM-DD only", () => {
    expect(isCivilDate("2026-07-04")).toBe(true)
    expect(isCivilDate("2028-02-29")).toBe(true)
    expect(isCivilDate("2026-02-30")).toBe(false)
    expect(isCivilDate("2026-13-01")).toBe(false)
    expect(isCivilDate("2026-7-4")).toBe(false)
    expect(isCivilDate("04.07.2026")).toBe(false)
    expect(isCivilDate("2026-07-04T10:00:00Z")).toBe(false)
    expect(isCivilDate("pas une date")).toBe(false)
    expect(isCivilDate("")).toBe(false)
  })

  it("refuses a birth date in the future, before 1900 or not a date", () => {
    const now = new Date("2026-09-30T12:00:00Z")
    expect(isPlausibleBirthDate("2010-05-01", now)).toBe(true)
    expect(isPlausibleBirthDate("2026-09-30", now)).toBe(true)
    expect(isPlausibleBirthDate("2026-10-01", now)).toBe(false)
    expect(isPlausibleBirthDate("1899-12-31", now)).toBe(false)
    expect(isPlausibleBirthDate("abc", now)).toBe(false)
  })

  it("exposes schemas that trim and explain", () => {
    expect(civilDateSchema.safeParse(" 2026-07-04 ").success).toBe(true)
    const bad = civilDateSchema.safeParse("2026-02-30")
    expect(bad.success).toBe(false)
    expect(birthDateSchema.safeParse("x").success).toBe(false)
  })

  it("orders a period: the end on or after the start", () => {
    expect(isOrderedPeriod("2026-07-04", "2026-07-05")).toBe(true)
    expect(isOrderedPeriod("2026-07-04", "2026-07-04")).toBe(true)
    expect(isOrderedPeriod("2026-07-05", "2026-07-04")).toBe(false)
  })
})
