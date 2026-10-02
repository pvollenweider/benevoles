import { describe, it, expect } from "vitest"
import { fmtDuration, gapAfter, gapLabel, hasOverlap, personalDataLines, recapShifts, totalLabel, type RecapShiftInput } from "../signup-recap"

const s = (id: string, over: Partial<RecapShiftInput>): RecapShiftInput => ({
  id, roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", status: "open", waitlistEnabled: false, minAge: null, ...over,
})

// Recap before confirming (#373).
describe("signup recap", () => {
  it("orders shifts in time, names them, flags the next-day end, the waitlist and the age", () => {
    const rows = recapShifts([
      s("late", { startTime: "22:00", endTime: "02:00", label: "Bar nuit", minAge: 18 }),
      s("early", { roleName: "Accueil", label: "Accueil", startTime: "09:00", endTime: "11:00", status: "full", waitlistEnabled: true }),
    ])
    expect(rows.map((r) => r.id)).toEqual(["early", "late"])
    expect(rows[0]).toMatchObject({ name: "Accueil", dayLabel: "Samedi 4 juillet", timeLabel: "09:00–11:00", endsNextDay: false, waitlist: true, minAge: null })
    expect(rows[1]).toMatchObject({ name: "Bar · Bar nuit", endsNextDay: true, waitlist: false, minAge: 18 })
    expect(rows[1].endAbs - rows[1].startAbs).toBe(240)
  })

  it("tells overlaps, back-to-back, breaks and other days apart", () => {
    const rows = recapShifts([
      s("a", { startTime: "10:00", endTime: "12:00" }),
      s("b", { startTime: "11:30", endTime: "13:00", label: "Bar 2" }),
      s("c", { startTime: "13:00", endTime: "14:00", label: "Bar 3" }),
      s("d", { startTime: "15:30", endTime: "17:00", label: "Bar 4" }),
      s("e", { date: "2026-07-05", startTime: "09:00", endTime: "10:00", label: "Bar 5" }),
    ])
    expect(gapAfter(rows, 0)).toEqual({ kind: "overlap", minutes: 30 })
    expect(gapAfter(rows, 1)).toEqual({ kind: "back_to_back" })
    expect(gapAfter(rows, 2)).toEqual({ kind: "break", minutes: 90 })
    expect(gapAfter(rows, 3)).toEqual({ kind: "other_day" })
    expect(gapAfter(rows, 4)).toBeNull()
    expect(gapLabel({ kind: "overlap", minutes: 30 })).toBe("Ces deux créneaux se chevauchent de 30 min : l'inscription sera refusée.")
    expect(gapLabel({ kind: "break", minutes: 90 })).toBe("Pause de 1 h 30 avant le suivant.")
    expect(gapLabel({ kind: "other_day" })).toBeNull()
    expect(hasOverlap(rows)).toBe(true)
    expect(hasOverlap(rows.slice(1))).toBe(false)
  })

  it("an overnight shift overlaps the next morning's", () => {
    const rows = recapShifts([
      s("night", { startTime: "22:00", endTime: "02:00" }),
      s("morning", { date: "2026-07-05", startTime: "01:00", endTime: "03:00", label: "Bar matin" }),
    ])
    expect(gapAfter(rows, 0)).toEqual({ kind: "overlap", minutes: 60 })
  })

  it("lists the personal data that will be sent, and totals", () => {
    expect(personalDataLines({ requirePhone: false, phoneGiven: false, needsBirthDate: false, commentGiven: false })).toEqual(["prénom et nom", "adresse email"])
    expect(personalDataLines({ requirePhone: true, phoneGiven: false, needsBirthDate: true, commentGiven: true })).toEqual([
      "prénom et nom", "adresse email", "numéro de téléphone", "date de naissance (créneau avec âge minimum)", "ton commentaire",
    ])
    expect(fmtDuration(45)).toBe("45 min")
    expect(fmtDuration(120)).toBe("2 h")
    expect(totalLabel(recapShifts([s("a", {}), s("b", { startTime: "14:00", endTime: "17:30", label: "x" })]))).toBe("2 créneaux, 5 h 30 au total")
  })
})
