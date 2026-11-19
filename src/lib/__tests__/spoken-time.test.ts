import { describe, it, expect } from "vitest"
import { dayLabel, dayLabelWithYear, spokenShift, spokenShiftName, spokenShortWhen, spokenTimeRange } from "../spoken-time"

// #582: names and times read in words, without « · » (« point ») nor an en dash (« tiret »).
describe("dayLabel", () => {
  it("gives the day in full, capitalised, the same in any time zone", () => {
    expect(dayLabel("2026-07-04")).toBe("Samedi 4 juillet")
  })
})

describe("dayLabelWithYear", () => {
  const now = new Date("2026-11-19T12:00:00Z")

  it("omits the year in the current year", () => {
    expect(dayLabelWithYear("2026-07-04", now)).toBe("Samedi 4 juillet")
  })

  it("adds the year when it differs, for a past or a future date", () => {
    expect(dayLabelWithYear("2031-05-02", now)).toBe("Vendredi 2 mai 2031")
    expect(dayLabelWithYear("2025-12-31", now)).toBe("Mercredi 31 décembre 2025")
  })
})

describe("spokenTimeRange", () => {
  it("says whole hours and minutes in words", () => {
    expect(spokenTimeRange("10:00", "12:00")).toBe("de 10h à 12h")
    expect(spokenTimeRange("10:30", "12:15")).toBe("de 10h30 à 12h15")
    expect(spokenTimeRange("09:00", "09:45")).toBe("de 9h à 9h45")
  })

  it("says when a shift runs past midnight", () => {
    expect(spokenTimeRange("22:00", "02:00")).toBe("de 22h à 2h, jusqu'au lendemain")
    // Ending at midnight is the end of the same day.
    expect(spokenTimeRange("20:00", "00:00")).toBe("de 20h à 0h")
  })

  it("reads a legacy end past 24:00 modulo 24, as the next day", () => {
    expect(spokenTimeRange("22:00", "25:30")).toBe("de 22h à 1h30, jusqu'au lendemain")
  })
})

describe("spokenShiftName", () => {
  it("joins the role and the label with a comma", () => {
    expect(spokenShiftName({ roleName: "Bar", label: "Soir" })).toBe("Bar, Soir")
  })

  it("says the role once when the label is the role, or missing", () => {
    expect(spokenShiftName({ roleName: "Bar", label: "Bar" })).toBe("Bar")
    expect(spokenShiftName({ roleName: "Bar", label: "" })).toBe("Bar")
    expect(spokenShiftName({ roleName: "Bar", label: null })).toBe("Bar")
    expect(spokenShiftName({ roleName: "Bar" })).toBe("Bar")
  })
})

describe("spokenShortWhen", () => {
  it("gives the short date and the hours in words", () => {
    expect(spokenShortWhen({ date: "2026-07-04", startTime: "10:00", endTime: "12:00" })).toBe("sam. 4 juil., de 10h à 12h")
  })
})

describe("spokenShift", () => {
  it("gives the name, the day in full, lower case, and the hours", () => {
    expect(spokenShift({ roleName: "Bar", label: "Soir", date: "2026-07-04", startTime: "10:00", endTime: "12:00" }))
      .toBe("Bar, Soir, samedi 4 juillet, de 10h à 12h")
    expect(spokenShift({ roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "22:00", endTime: "02:00" }))
      .toBe("Bar, samedi 4 juillet, de 22h à 2h, jusqu'au lendemain")
  })

  it("never contains a middle dot or a dash", () => {
    const text = spokenShift({ roleName: "Bar", label: "Soir", date: "2026-07-04", startTime: "10:30", endTime: "12:00" })
    expect(text).not.toMatch(/[·–—]/)
  })
})
