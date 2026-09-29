import { describe, it, expect } from "vitest"
import { EVENT_TEMPLATES, findTemplate, templateSummary, templateToEvent } from "../event-templates"
import { isValidClock } from "../shift-time"

describe("EVENT_TEMPLATES", () => {
  it("has the five starter templates with unique ids, valid times and days within the span", () => {
    expect(EVENT_TEMPLATES.map((t) => t.id)).toEqual(["festival", "buvette", "sport", "fete", "chantier"])
    for (const t of EVENT_TEMPLATES) {
      expect(t.shifts.length).toBeGreaterThan(0)
      for (const s of t.shifts) {
        expect(isValidClock(s.startTime)).toBe(true)
        expect(isValidClock(s.endTime)).toBe(true)
        expect(s.startTime).not.toBe(s.endTime)
        expect(s.day).toBeGreaterThanOrEqual(0)
        expect(s.day).toBeLessThan(t.days)
        expect(s.capacity).toBeGreaterThan(0)
      }
    }
    expect(findTemplate("nope")).toBeUndefined()
  })
})

describe("templateToEvent", () => {
  it("dates the shifts from the start date and spans the template's days", () => {
    const e = templateToEvent(findTemplate("fete")!, { title: "  Fête 2026 ", startDate: "2026-08-29" })
    expect(e.title).toBe("Fête 2026")
    expect(e.startDate).toBe("2026-08-29")
    expect(e.endDate).toBe("2026-08-30")
    expect(e.shifts.filter((s) => s.roleName === "Buvette").map((s) => s.date)).toEqual(["2026-08-29", "2026-08-29", "2026-08-29", "2026-08-30", "2026-08-30", "2026-08-30"])
    expect(e.shifts.find((s) => s.roleName === "Démontage")).toMatchObject({ date: "2026-08-30", startTime: "20:00", endTime: "22:00", capacity: 6, label: "Démontage" })
  })

  it("orders roles as listed, 100 apart, and falls back to the template title", () => {
    const e = templateToEvent(findTemplate("buvette")!, { title: "   ", startDate: "2026-07-04" })
    expect(e.title).toBe("Buvette")
    expect(e.endDate).toBe("2026-07-04")
    const orders = new Map(e.shifts.map((s) => [s.roleName, s.displayOrder]))
    expect([...orders.entries()]).toEqual([["Mise en place", 0], ["Bar", 100], ["Caisse", 200], ["Rangement", 300]])
  })
})

describe("templateSummary", () => {
  it("counts shifts and people per role", () => {
    expect(templateSummary(findTemplate("buvette")!)).toEqual([
      { roleName: "Mise en place", shiftCount: 1, capacity: 3 },
      { roleName: "Bar", shiftCount: 4, capacity: 12 },
      { roleName: "Caisse", shiftCount: 4, capacity: 4 },
      { roleName: "Rangement", shiftCount: 1, capacity: 3 },
    ])
  })
})
