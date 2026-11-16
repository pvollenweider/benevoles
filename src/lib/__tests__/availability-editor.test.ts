// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, expect, it } from "vitest"
import { addRange, allUnavailable, chooseDay, copiedText, copyPreviousDay, datesCountText, dayAnswerText, editorDirty, editorFrom, editorSubmission, endsNextDay, nbspQuotes, nextDayHint, previousDay, removeRange, setRangeTime } from "../availability-editor"

const dates = ["2099-07-10", "2099-07-11", "2099-07-12"]

describe("availability editor (#1146)", () => {
  it("starts from what is stored: unanswered, available with its ranges, or not available", () => {
    const s = editorFrom(dates, [{ date: "2099-07-10", ranges: [{ startTime: "20:00", endTime: "03:00" }] }, { date: "2099-07-11", ranges: [] }])
    expect(s.days.map((d) => d.choice)).toEqual(["available", "unavailable", null])
    expect(s.days[0].ranges).toEqual([{ key: 0, start: "20:00", end: "03:00" }])
  })

  it("adds an empty range when « Disponible » is chosen, keeps ranges through « Pas disponible »", () => {
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

  it("sends only the dates with a choice; « tout l'événement » answers every date", () => {
    let s = editorFrom(dates, [])
    s = chooseDay(s, "2099-07-10", "available")
    s = setRangeTime(s, "2099-07-10", 0, "start", "08:00")
    s = setRangeTime(s, "2099-07-10", 0, "end", "12:00")
    expect(editorSubmission(s, "tu")).toEqual({ ok: true, days: [{ date: "2099-07-10", ranges: [{ start: "08:00", end: "12:00" }] }] })
    const all = editorSubmission(allUnavailable(s), "tu")
    expect(all.ok && all.days.map((d) => d.ranges.length)).toEqual([0, 0, 0])
  })

  it("points at every empty time field at once, in the page's voice", () => {
    let s = chooseDay(editorFrom(dates, []), "2099-07-11", "available")
    s = setRangeTime(s, "2099-07-11", s.days[1].ranges[0].key, "end", "12:00")
    s = addRange(chooseDay(s, "2099-07-12", "available"), "2099-07-12")
    const r = editorSubmission(s, "tu")
    expect(r).toEqual({ ok: false, errors: [
      { message: "Indique l'heure de début du samedi 11 juillet.", at: { date: "2099-07-11", range: 0, field: "start" } },
      { message: "Indique l'heure de début de l'horaire 1 du dimanche 12 juillet.", at: { date: "2099-07-12", range: 0, field: "start" } },
      { message: "Indique l'heure de fin de l'horaire 1 du dimanche 12 juillet.", at: { date: "2099-07-12", range: 0, field: "end" } },
      { message: "Indique l'heure de début de l'horaire 2 du dimanche 12 juillet.", at: { date: "2099-07-12", range: 1, field: "start" } },
      { message: "Indique l'heure de fin de l'horaire 2 du dimanche 12 juillet.", at: { date: "2099-07-12", range: 1, field: "end" } },
    ] })
    const v = editorSubmission(s, "vous")
    expect(!v.ok && v.errors[0].message).toMatch(/^Indiquez/)
    const none = editorSubmission(editorFrom(dates, []), "tu")
    expect(!none.ok && none.errors).toEqual([{ message: "Choisis au moins une date : «\u00a0Disponible à certaines heures\u00a0» ou «\u00a0Pas disponible\u00a0».", at: { date: "2099-07-10" } }])
  })

  it("tells unsaved changes from the last save", () => {
    const saved = editorFrom(dates, [{ date: "2099-07-10", ranges: [] }])
    expect(editorDirty(saved, saved)).toBe(false)
    expect(editorDirty(chooseDay(saved, "2099-07-11", "unavailable"), saved)).toBe(true)
    // Ranges kept under « Pas disponible » are not a change: they are not sent.
    const typed = setRangeTime(chooseDay(saved, "2099-07-10", "available"), "2099-07-10", 0, "start", "08:00")
    expect(editorDirty(chooseDay(typed, "2099-07-10", "unavailable"), saved)).toBe(false)
  })

  it("copies the previous date's hours, never from nothing", () => {
    let s = chooseDay(editorFrom(dates, []), "2099-07-10", "available")
    s = setRangeTime(setRangeTime(s, "2099-07-10", 0, "start", "20:00"), "2099-07-10", 0, "end", "03:00")
    s = setRangeTime(setRangeTime(addRange(s, "2099-07-10"), "2099-07-10", 1, "start", "09:00"), "2099-07-10", 1, "end", "12:00")
    expect(previousDay(s, "2099-07-10")).toBeNull()
    const copied = copyPreviousDay(s, "2099-07-11")
    expect(copied.days[1]).toMatchObject({ choice: "available", ranges: [{ start: "20:00", end: "03:00" }, { start: "09:00", end: "12:00" }] })
    expect(new Set(copied.days.flatMap((d) => d.ranges.map((r) => r.key))).size).toBe(4)
    expect(copyPreviousDay(copied, "2099-07-12").days[2].choice).toBe("available")
    expect(copyPreviousDay(editorFrom(dates, []), "2099-07-11")).toEqual(editorFrom(dates, []))
    expect(copiedText(s.days[0], "2099-07-11")).toBe("Horaires du vendredi 10 juillet repris pour le samedi 11 juillet : 2 horaires.")
    expect(copiedText({ date: "2099-07-10", choice: "unavailable", ranges: [] }, "2099-07-11")).toBe("Réponse du vendredi 10 juillet reprise pour le samedi 11 juillet : «\u00a0Pas disponible\u00a0».")
  })

  it("keeps French quotes with their words", () => {
    expect(nbspQuotes("« Pas disponible »")).toBe("«\u00a0Pas disponible\u00a0»")
  })

  it("says a night range in words", () => {
    expect(endsNextDay({ start: "20:00", end: "03:00" })).toBe(true)
    expect(endsNextDay({ start: "08:00", end: "" })).toBe(false)
    expect(nextDayHint("2099-07-11")).toBe("se termine le lendemain, dimanche 12 juillet")
    expect(dayAnswerText({ date: "x", ranges: [{ startTime: "09:00", endTime: "12:00" }, { startTime: "20:00", endTime: "02:30" }] })).toBe("disponible de 9h à 12h et de 20h à 2h30 le lendemain")
    expect(dayAnswerText({ date: "x", ranges: [] })).toBe("pas disponible")
    expect(dayAnswerText(undefined)).toBe("sans réponse")
    expect(datesCountText(1, 11)).toBe("1 date sur 11")
  })
})
