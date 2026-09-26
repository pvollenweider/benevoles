import { describe, it, expect } from "vitest"
import { resolveNewShiftDisplayOrder, isCompleteTime, addMinutes } from "../gantt-utils"

describe("resolveNewShiftDisplayOrder", () => {
  it("inherits the existing role's displayOrder instead of a hardcoded 0 (#215 regression)", () => {
    const existing = [
      { roleName: "Sécurité", displayOrder: 0 },
      { roleName: "Bar", displayOrder: 200 },
    ]
    // Adding a new "Bar" shift must not drag the whole role back to position 0 — it should join
    // Bar's own displayOrder (200), even though the naive default is 0.
    expect(resolveNewShiftDisplayOrder(existing, "Bar", 0)).toBe(200)
  })

  it("appends a genuinely new role after the highest displayOrder in use, not at the front", () => {
    // A manually sorted list (e.g. Sécurité=0, Bar=100, Accueil=200) must not have a new role
    // jump to the front just because the naive default is 0 — it belongs at the end.
    const existing = [
      { roleName: "Sécurité", displayOrder: 0 },
      { roleName: "Bar", displayOrder: 100 },
      { roleName: "Accueil", displayOrder: 200 },
    ]
    expect(resolveNewShiftDisplayOrder(existing, "Infirmerie", 0)).toBe(300)
  })

  it("falls back to the given default when there are no existing shifts at all", () => {
    expect(resolveNewShiftDisplayOrder([], "Bar", 0)).toBe(0)
  })
})

describe("isCompleteTime", () => {
  it("accepts complete HH:MM and H:MM times", () => {
    expect(isCompleteTime("14:30")).toBe(true)
    expect(isCompleteTime("9:05")).toBe(true)
    expect(isCompleteTime("00:00")).toBe(true)
  })

  it("rejects a value still being typed", () => {
    expect(isCompleteTime("")).toBe(false)
    expect(isCompleteTime("1")).toBe(false)
    expect(isCompleteTime("14")).toBe(false)
    expect(isCompleteTime("14:")).toBe(false)
    expect(isCompleteTime("14:0")).toBe(false)
  })
})

describe("addMinutes", () => {
  it("adds minutes within the same day", () => {
    expect(addMinutes("14:00", 60)).toBe("15:00")
    expect(addMinutes("14:15", 50)).toBe("15:05")
  })

  it("wraps at midnight", () => {
    expect(addMinutes("23:30", 60)).toBe("00:30")
  })

  it("never produces NaN:NaN for a complete time (#234 regression)", () => {
    // The bug: this used to run against whatever partial string was in the input on every
    // keystroke (e.g. "1" while typing "14:00"), producing "NaN:NaN". Callers now gate this with
    // isCompleteTime() first — this test locks in that addMinutes() itself is correct once fed a
    // genuinely complete time, whatever hour/minute combination.
    for (const start of ["00:00", "09:05", "23:59", "12:00"]) {
      const result = addMinutes(start, 60)
      expect(result).not.toContain("NaN")
      expect(result).toMatch(/^\d{2}:\d{2}$/)
    }
  })
})
