import { describe, it, expect } from "vitest"
import { groupDaysByMonth, isLongEvent, pastShiftLabel, usesMonthView, visibleDays } from "../long-event"

describe("long-running events (#866)", () => {
  it("tells a season from a weekend", () => {
    expect(isLongEvent("2026-07-04", "2026-07-05")).toBe(false)
    expect(isLongEvent("2026-09-01", "2026-09-27")).toBe(false)
    expect(isLongEvent("2026-09-01", "2026-09-28")).toBe(true)
    expect(isLongEvent(new Date("2026-09-01"), new Date("2027-06-30"))).toBe(true)
  })

  it("hides the past days of a long event only", () => {
    const days = ["2026-09-02", "2026-09-09", "2026-09-16"]
    expect(visibleDays(days, "2026-09-09", true)).toEqual(["2026-09-09", "2026-09-16"])
    expect(visibleDays(days, "2026-09-09", false)).toEqual(days)
  })

  it("groups the days by month, in order", () => {
    expect(groupDaysByMonth(["2026-10-07", "2026-09-30", "2026-09-02"])).toEqual([
      { key: "2026-09", label: "septembre 2026", days: ["2026-09-02", "2026-09-30"] },
      { key: "2026-10", label: "octobre 2026", days: ["2026-10-07"] },
    ])
    expect(usesMonthView(["a", "b", "c", "d", "e", "f", "g"])).toBe(false)
    expect(usesMonthView(["a", "b", "c", "d", "e", "f", "g", "h"])).toBe(true)
  })

  it("refuses a past day of a long event, never of a short one", () => {
    const season = { startDate: "2026-09-01", endDate: "2027-06-30" }
    expect(pastShiftLabel(season, [{ date: "2026-09-09", label: "Accueil" }], "2026-09-10")).toBe("Accueil")
    expect(pastShiftLabel(season, [{ date: new Date("2026-09-10"), label: "Accueil" }], "2026-09-10")).toBeNull()
    expect(pastShiftLabel({ startDate: "2026-07-04", endDate: "2026-07-05" }, [{ date: "2026-07-04", label: "Bar" }], "2026-07-06")).toBeNull()
  })
})
