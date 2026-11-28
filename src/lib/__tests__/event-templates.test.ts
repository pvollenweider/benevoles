import { describe, it, expect } from "vitest"
import { EVENT_TEMPLATES, findTemplate, templateRhythm, templateShiftCount, templateSummary, templateToEvent } from "../event-templates"
import { isValidClock } from "../shift-time"
import { usesMonthView } from "../long-event"

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

  it("gives a recurring template one year of dates, enough for the public page's month buttons", () => {
    for (const template of EVENT_TEMPLATES.filter((t) => t.recurrences?.length)) {
      const e = templateToEvent(template, { title: "", startDate: "2026-12-05" })
      expect(e.endDate).toBe("2027-12-03")
      const dates = [...new Set(e.recurrences.flatMap((r) => r.shifts.map((s) => s.date)))].sort()
      expect(usesMonthView(dates), template.id).toBe(true)
      expect(dates.at(-1)! > "2027-11-01", template.id).toBe(true)
    }
    // The repair café, every other Saturday from 5 December 2026: 26 Saturdays.
    const repair = templateToEvent(findTemplate("repair")!, { title: "", startDate: "2026-12-05" })
    expect(new Set(repair.recurrences.flatMap((r) => r.shifts.map((s) => s.date))).size).toBe(26)
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
    // Tuesday 1 September 2026, one year (52 weeks): to 30 August 2027.
    const draft = templateToEvent(epicerie, { title: "", startDate: "2026-09-01" }, "FR")
    expect(draft.endDate).toBe("2027-08-30")
    expect(draft.shifts).toEqual([])
    expect(draft.recurrences).toHaveLength(4)
    const tuesdayThursday = draft.recurrences[0]
    expect(tuesdayThursday.rule).toMatchObject({ roleName: "Caisse et accueil", weekdays: [2, 4], slotMinutes: 150, holidays: "FR" })
    // 52 weeks of Tuesdays and Thursdays but Ascension (Thursday 6 May 2027); 11 November 2026
    // (Armistice) and 14 July 2027 are Wednesdays, left out of the deliveries.
    expect(tuesdayThursday.shifts).toHaveLength(103)
    expect(tuesdayThursday.shifts.map((s) => s.date)).not.toContain("2027-05-06")
    expect(draft.recurrences[3].shifts.map((s) => s.date)).not.toContain("2026-11-11")
    expect(draft.recurrences[3].shifts.map((s) => s.date)).not.toContain("2027-07-14")
    expect(templateShiftCount(epicerie)).toBe(0)
    expect(templateShiftCount(epicerie, "2026-09-01")).toBe(104 + 52 + 52 + 52)
    expect(templateRhythm(findTemplate("repair")!)[0]).toBe("Accueil : un samedi sur deux, de 13:30 à 17:30, 1 personne")
  })
})
