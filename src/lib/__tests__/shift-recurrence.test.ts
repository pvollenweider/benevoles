import { describe, it, expect } from "vitest"
import {
  defaultHolidayCalendar, describeWeekdays, easterSunday, generateRecurrence, publicHolidays, recurrenceDays,
  recurrenceProblem, RECURRENCE_MAX_SHIFTS, weekdayOf, type RecurrenceInput,
} from "../shift-recurrence"

const base: RecurrenceInput = {
  from: "2026-09-01", until: "2026-09-30", weekdays: [3], everyWeeks: 1,
  startTime: "14:00", endTime: "17:00", slotMinutes: 180, holidays: "none", closures: [],
}

describe("shift recurrence (#866)", () => {
  it("knows the weekday of a date", () => {
    expect(weekdayOf("2026-09-02")).toBe(3)
    expect(weekdayOf("2026-09-06")).toBe(7)
  })

  it("repeats a permanence every Wednesday of the period", () => {
    expect(recurrenceDays(base).days).toEqual(["2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23", "2026-09-30"])
  })

  it("repeats every other week, counted from the week of the start date", () => {
    expect(recurrenceDays({ ...base, everyWeeks: 2 }).days).toEqual(["2026-09-02", "2026-09-16", "2026-09-30"])
    // A start on Sunday 6 September: its week (Monday 31 August) is the first one.
    expect(recurrenceDays({ ...base, from: "2026-09-06", weekdays: [1, 7], everyWeeks: 2 }).days)
      .toEqual(["2026-09-06", "2026-09-14", "2026-09-20", "2026-09-28"])
  })

  it("leaves out closures and public holidays, with their reason", () => {
    const r = recurrenceDays({ ...base, from: "2026-12-01", until: "2026-12-31", weekdays: [5], holidays: "CH", closures: ["2026-12-04"] })
    expect(r.days).toEqual(["2026-12-11", "2026-12-18"])
    expect(r.skipped).toEqual([{ date: "2026-12-04", reason: "fermeture" }, { date: "2026-12-25", reason: "jour férié (Noël)" }])
  })

  it("computes Easter and the holidays that depend on it", () => {
    expect(easterSunday(2026)).toBe("2026-04-05")
    expect(easterSunday(2027)).toBe("2027-03-28")
    const fr = publicHolidays("FR", 2026)
    expect(fr.get("2026-04-06")).toBe("Lundi de Pâques")
    expect(fr.get("2026-05-14")).toBe("Ascension")
    expect(fr.get("2026-05-25")).toBe("Lundi de Pentecôte")
    expect(fr.get("2026-07-14")).toBe("Fête nationale")
    expect(fr.has("2026-08-01")).toBe(false)
    const ch = publicHolidays("CH", 2026)
    expect(ch.get("2026-04-03")).toBe("Vendredi saint")
    expect(ch.get("2026-08-01")).toBe("Fête nationale")
    expect(ch.has("2026-07-14")).toBe(false)
    expect(publicHolidays("none", 2026).size).toBe(0)
  })

  it("spans the turn of the year", () => {
    const r = recurrenceDays({ ...base, from: "2026-12-28", until: "2027-01-08", weekdays: [5], holidays: "FR" })
    expect(r.days).toEqual(["2027-01-08"])
    expect(r.skipped).toEqual([{ date: "2027-01-01", reason: "jour férié (Nouvel an)" }])
  })

  it("repeats the daily series on each day, a slot past midnight keeping its day", () => {
    const { shifts } = generateRecurrence({ ...base, until: "2026-09-09", startTime: "22:00", endTime: "02:00", slotMinutes: 120 })
    expect(shifts.map((s) => [s.day, s.date, s.startTime])).toEqual([
      ["2026-09-02", "2026-09-02", "22:00"], ["2026-09-02", "2026-09-03", "00:00"],
      ["2026-09-09", "2026-09-09", "22:00"], ["2026-09-09", "2026-09-10", "00:00"],
    ])
  })

  it("explains what is wrong", () => {
    expect(recurrenceProblem({ ...base, weekdays: [] })).toMatch(/au moins un jour/)
    expect(recurrenceProblem({ ...base, until: "2026-08-01" })).toMatch(/avant la date de début/)
    expect(recurrenceProblem(base, { start: "2026-09-10", end: "2026-12-31" })).toMatch(/période de l'événement/)
    expect(recurrenceProblem({ ...base, from: "2026-09-03", until: "2026-09-08" })).toMatch(/Aucune date/)
    expect(recurrenceProblem({ ...base, closures: ["demain"] })).toMatch(/fermeture/)
    expect(recurrenceProblem(base)).toBeNull()
  })

  it("refuses more than the bound", () => {
    const big = { ...base, from: "2026-01-01", until: "2026-12-31", weekdays: [1, 2, 3, 4, 5, 6, 7] as RecurrenceInput["weekdays"], startTime: "08:00", endTime: "20:00", slotMinutes: 60 }
    expect(recurrenceProblem(big)).toMatch(String(RECURRENCE_MAX_SHIFTS))
  })

  it("describes the rhythm and suggests a calendar from the time zone", () => {
    expect(describeWeekdays([3], 1)).toBe("chaque mercredi")
    expect(describeWeekdays([2, 4], 1)).toBe("chaque mardi et jeudi")
    expect(describeWeekdays([6], 2)).toBe("un samedi sur deux")
    expect(defaultHolidayCalendar("Europe/Paris")).toBe("FR")
    expect(defaultHolidayCalendar("Europe/Zurich")).toBe("CH")
    expect(defaultHolidayCalendar("America/Montreal")).toBe("none")
  })
})
