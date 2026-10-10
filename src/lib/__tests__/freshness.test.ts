import { describe, it, expect } from "vitest"
import { freshness, freshnessDate, parseCalendarDate, FRESHNESS_DAYS } from "../freshness"

const now = new Date("2026-10-10T15:00:00Z")

describe("freshness (#763)", () => {
  it("is « new » while the added date is within the window", () => {
    expect(freshness({ added: "2026-10-10" }, now)).toBe("new")
    expect(freshness({ added: "2026-09-20" }, now)).toBe("new")
  })

  it("expires after FRESHNESS_DAYS days", () => {
    expect(FRESHNESS_DAYS).toBe(30)
    // Day 29 still shows, day 30 no longer.
    expect(freshness({ added: "2026-09-11" }, now)).toBe("new")
    expect(freshness({ added: "2026-09-10" }, now)).toBeNull()
    expect(freshness({ added: "2025-01-01" }, now)).toBeNull()
  })

  it("is « updated » when only the update is recent", () => {
    expect(freshness({ added: "2025-01-01", updated: "2026-10-01" }, now)).toBe("updated")
    expect(freshness({ updated: "2026-10-01" }, now)).toBe("updated")
  })

  it("prefers « new » when both dates are recent", () => {
    expect(freshness({ added: "2026-10-01", updated: "2026-10-05" }, now)).toBe("new")
  })

  it("ignores an update dated before the unit was added", () => {
    expect(freshness({ added: "2026-08-01", updated: "2026-07-01" }, new Date("2026-07-15T00:00:00Z"))).toBeNull()
  })

  it("shows nothing for a future date", () => {
    expect(freshness({ added: "2026-10-11" }, now)).toBeNull()
    expect(freshness({ updated: "2026-12-01" }, now)).toBeNull()
  })

  it("is hidden by the override", () => {
    expect(freshness({ added: "2026-10-10", hidden: true }, now)).toBeNull()
    expect(freshness({ updated: "2026-10-10", hidden: true }, now)).toBeNull()
  })

  it("shows nothing when the dates are missing or invalid", () => {
    expect(freshness({}, now)).toBeNull()
    expect(freshness({ added: "2026-02-30" }, now)).toBeNull()
    expect(freshness({ added: "10/10/2026" }, now)).toBeNull()
  })

  it("parses only real calendar dates", () => {
    expect(parseCalendarDate("2024-02-29")).toEqual(new Date("2024-02-29T00:00:00Z"))
    expect(parseCalendarDate("2026-02-29")).toBeNull()
    expect(parseCalendarDate("2026-13-01")).toBeNull()
    expect(parseCalendarDate(undefined)).toBeNull()
  })

  it("gives the date the label refers to", () => {
    expect(freshnessDate({ added: "2026-10-01", updated: "2026-10-05" }, "updated")).toEqual(new Date("2026-10-05T00:00:00Z"))
    expect(freshnessDate({ added: "2026-10-01" }, "new")).toEqual(new Date("2026-10-01T00:00:00Z"))
  })
})
