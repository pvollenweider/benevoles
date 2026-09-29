import { describe, it, expect } from "vitest"
import { localDateTimeToUtc } from "../time-zone"

// Shift.date is stored at midnight UTC for its calendar day; times are local to Europe/Zurich.
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)
const at = (iso: string, hhmm: string) => localDateTimeToUtc(day(iso), hhmm, "Europe/Zurich").toISOString()

describe("localDateTimeToUtc (#308)", () => {
  it("summer (CEST, UTC+2) and winter (CET, UTC+1)", () => {
    expect(at("2026-07-01", "10:00")).toBe("2026-07-01T08:00:00.000Z")
    expect(at("2026-01-15", "10:00")).toBe("2026-01-15T09:00:00.000Z")
  })

  it("midnight is the start of that calendar day in Zurich (the previous day in UTC)", () => {
    expect(at("2026-07-01", "00:00")).toBe("2026-06-30T22:00:00.000Z")
  })

  it("hours past 24 run into the next day (overnight shifts)", () => {
    expect(at("2026-06-01", "26:00")).toBe("2026-06-02T00:00:00.000Z")
  })

  it("the evening before a DST change still uses the old offset", () => {
    expect(at("2026-03-28", "23:30")).toBe("2026-03-28T22:30:00.000Z") // still CET
    expect(at("2026-10-24", "23:30")).toBe("2026-10-24T21:30:00.000Z") // still CEST
  })

  it("the morning after a DST change uses the new offset", () => {
    expect(at("2026-03-29", "10:00")).toBe("2026-03-29T08:00:00.000Z") // CEST
    expect(at("2026-10-25", "10:00")).toBe("2026-10-25T09:00:00.000Z") // CET
  })

  it("the non-existent spring-forward hour lands one hour later; the repeated fall-back hour uses standard time", () => {
    expect(at("2026-03-29", "02:30")).toBe(at("2026-03-29", "03:30"))
    expect(at("2026-10-25", "02:30")).toBe("2026-10-25T01:30:00.000Z")
  })

  it("other zones work too", () => {
    expect(localDateTimeToUtc(day("2026-07-01"), "10:00", "America/New_York").toISOString()).toBe("2026-07-01T14:00:00.000Z")
  })
})
