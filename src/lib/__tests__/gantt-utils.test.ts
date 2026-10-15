import { describe, it, expect } from "vitest"
import { resolveNewShiftDisplayOrder, isCompleteTime, addMinutes, fmtHours, showSpan } from "../gantt-utils"

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

describe("fmtHours", () => {
  it("formats a whole number of hours with no minutes", () => {
    expect(fmtHours(3)).toBe("3h")
    expect(fmtHours(0)).toBe("0h")
  })

  it("formats a fractional number of hours as HhMM, never a decimal", () => {
    expect(fmtHours(3.5)).toBe("3h30")
    expect(fmtHours(1.25)).toBe("1h15")
  })

  it("rounds to the nearest minute instead of truncating", () => {
    // 12.9833... hours = 12h59m — truncating minutes would silently read 12h58.
    expect(fmtHours(12 + 59 / 60)).toBe("12h59")
  })

  it("carries a rounded 60 minutes into the next hour", () => {
    // 1h59m59.9s rounds to 2h00, not 1h60.
    expect(fmtHours(1 + 59.999 / 60)).toBe("2h")
  })
})

describe("showSpan", () => {
  it("spans a same-day show from its start to its end", () => {
    expect(showSpan({ startTime: "17:00", endTime: "18:30" })).toEqual({ start: 1020, end: 1110 })
  })
  it("carries an overnight show past midnight instead of a negative width (« Bal populaire » 21:00–01:00)", () => {
    expect(showSpan({ startTime: "21:00", endTime: "01:00" })).toEqual({ start: 1260, end: 1500 })
  })
  it("ends a show at exactly midnight at 1440", () => {
    expect(showSpan({ startTime: "22:00", endTime: "00:00" })).toEqual({ start: 1320, end: 1440 })
  })
  it("keeps a show starting at 00:00 on the same day", () => {
    expect(showSpan({ startTime: "00:00", endTime: "02:00" })).toEqual({ start: 0, end: 120 })
  })
})
