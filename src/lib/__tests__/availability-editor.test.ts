// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import { addRange, allUnavailable, chooseDay, datesCountText, dayAnswerText, editorFrom, editorSubmission, endsNextDay, nextDayHint, removeRange, setRangeTime } from "../availability-editor"

const dates = ["2099-07-10", "2099-07-11", "2099-07-12"]

describe("availability editor (#1146)", () => {
  it("starts from what is stored: unanswered, available with its ranges, or not available", () => {
    const s = editorFrom(dates, [{ date: "2099-07-10", ranges: [{ startTime: "20:00", endTime: "03:00" }] }, { date: "2099-07-11", ranges: [] }])
    expect(s.days.map((d) => d.choice)).toEqual(["available", "unavailable", null])
    expect(s.days[0].ranges).toEqual([{ key: 0, start: "20:00", end: "03:00" }])
  })

  it("adds an empty range when « Disponible » is chosen, keeps ranges through « Pas disponible »", () => {
    let s = editorFrom(dates, [])
    s = chooseDay(s, "2099-07-12", "available")
    expect(s.days[2].ranges).toHaveLength(1)
    s = setRangeTime(s, "2099-07-12", s.days[2].ranges[0].key, "start", "08:00")
    s = chooseDay(s, "2099-07-12", "unavailable")
    s = chooseDay(s, "2099-07-12", "available")
    expect(s.days[2].ranges[0].start).toBe("08:00")
  })

  it("gives each new range its own key, at most six per date, and removes by key", () => {
    let s = chooseDay(editorFrom(dates, []), "2099-07-10", "available")
    for (let i = 0; i < 8; i++) s = addRange(s, "2099-07-10")
    expect(s.days[0].ranges).toHaveLength(6)
    expect(new Set(s.days[0].ranges.map((r) => r.key)).size).toBe(6)
    s = removeRange(s, "2099-07-10", s.days[0].ranges[2].key)
    expect(s.days[0].ranges).toHaveLength(5)
  })

  it("sends only the dates with a choice; « tout l'événement » answers every date", () => {
    let s = editorFrom(dates, [])
    s = chooseDay(s, "2099-07-10", "available")
    s = setRangeTime(s, "2099-07-10", 0, "start", "08:00")
    s = setRangeTime(s, "2099-07-10", 0, "end", "12:00")
    expect(editorSubmission(s, "tu")).toEqual({ ok: true, days: [{ date: "2099-07-10", ranges: [{ start: "08:00", end: "12:00" }] }] })
    const all = editorSubmission(allUnavailable(s), "tu")
    expect(all.ok && all.days.map((d) => d.ranges.length)).toEqual([0, 0, 0])
  })

  it("points at an empty time field, in the page's voice", () => {
    const s = chooseDay(editorFrom(dates, []), "2099-07-11", "available")
    expect(editorSubmission(s, "tu")).toEqual({ ok: false, error: { message: "Indique l'heure de début de la plage 1 du samedi 11 juillet.", at: { date: "2099-07-11", range: 0, field: "start" } } })
    const v = editorSubmission(s, "vous")
    expect(!v.ok && v.error.message).toMatch(/^Indiquez/)
    expect(editorSubmission(editorFrom(dates, []), "tu").ok).toBe(false)
  })

  it("says a night range in words", () => {
    expect(endsNextDay({ start: "20:00", end: "03:00" })).toBe(true)
    expect(endsNextDay({ start: "08:00", end: "" })).toBe(false)
    expect(nextDayHint("2099-07-11")).toBe("se termine le lendemain, dimanche 12 juillet")
    expect(dayAnswerText({ date: "x", ranges: [{ startTime: "09:00", endTime: "12:00" }, { startTime: "20:00", endTime: "02:30" }] })).toBe("disponible de 9h à 12h et de 20h à 2h30 le lendemain")
    expect(dayAnswerText({ date: "x", ranges: [] })).toBe("pas disponible")
    expect(dayAnswerText(undefined)).toBe("pas de réponse")
    expect(datesCountText(1, 11)).toBe("1 date sur 11")
  })
})
