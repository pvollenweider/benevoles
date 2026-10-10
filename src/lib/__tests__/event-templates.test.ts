import { describe, it, expect } from "vitest"
import { EVENT_TEMPLATES, findTemplate, templateRhythm, templateShiftCount, templateSummary, templateToEvent } from "../event-templates"
import { isValidClock } from "../shift-time"

describe("EVENT_TEMPLATES", () => {
  it("has the starter templates with unique ids, valid times and days within the span", () => {
    expect(EVENT_TEMPLATES.map((t) => t.id)).toEqual(["festival", "buvette", "sport", "fete", "chantier", "epicerie", "distribution", "permanence", "repair"])
    for (const t of EVENT_TEMPLATES) {
      expect(t.shifts.length + (t.recurrences?.length ?? 0)).toBeGreaterThan(0)
      for (const r of t.recurrences ?? []) {
        expect(isValidClock(r.startTime) && isValidClock(r.endTime)).toBe(true)
        expect(r.weekdays.length).toBeGreaterThan(0)
        expect(r.capacity).toBeGreaterThan(0)
      }
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

  // Regular activities (#866): permanences repeated over the template's quarter.
  it("turns a recurring template into rules and their shifts, holidays left out", () => {
    const epicerie = findTemplate("epicerie")!
    // Tuesday 1 September 2026, a quarter: to 30 November.
    const draft = templateToEvent(epicerie, { title: "", startDate: "2026-09-01" }, "FR")
    expect(draft.endDate).toBe("2026-11-30")
    expect(draft.shifts).toEqual([])
    expect(draft.recurrences).toHaveLength(4)
    const tuesdayThursday = draft.recurrences[0]
    expect(tuesdayThursday.rule).toMatchObject({ roleName: "Caisse et accueil", weekdays: [2, 4], slotMinutes: 150, holidays: "FR" })
    // 13 weeks of Tuesdays and Thursdays; 11 November 2026 (Armistice) is a Wednesday, left out of the deliveries.
    expect(tuesdayThursday.shifts).toHaveLength(26)
    expect(draft.recurrences[3].shifts.map((s) => s.date)).not.toContain("2026-11-11")
    expect(templateShiftCount(epicerie)).toBe(0)
    expect(templateShiftCount(epicerie, "2026-09-01")).toBe(26 + 13 + 13 + 13)
    expect(templateRhythm(findTemplate("repair")!)[0]).toBe("Accueil : un samedi sur deux, 13:30–17:30, 1 personne")
  })
})
