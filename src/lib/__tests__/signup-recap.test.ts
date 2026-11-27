import { describe, it, expect } from "vitest"
import { allowedOverlapNotices, allowedOverlapText, fmtDuration, gapAfter, gapLabel, hasOverlap, personalDataLines, recapShifts, totalLabel, type RecapShiftInput } from "../signup-recap"

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
    // The time label already says the shift ends the next day: the recap must not add it again.
    expect(rows[1].timeLabel.match(/lendemain/g)).toHaveLength(1)
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

describe("signup recap, a poste reserved to an answer (#962)", () => {
  const base: RecapShiftInput = { id: "n1", roleName: "Navette", label: "Navette", date: "2026-07-04", startTime: "14:00", endTime: "18:00", status: "open", waitlistEnabled: false, minAge: null }
  it("carries the required answer as a mention, and null without a condition", () => {
    const [withCondition] = recapShifts([{ ...base, reservedAnswer: { questionLabel: "Permis de conduire", answers: ["Oui", "En cours"] } }])
    expect(withCondition.answerMention).toBe("Réponse requise : Permis de conduire, Oui ou En cours")
    expect(recapShifts([base])[0].answerMention).toBeNull()
  })
})

// The event allows overlapping shifts (#1467): a warning line, never the refusal; the red banner
// disappears, and the block also names an overlap with a shift already held.
describe("signup recap, an event that allows overlaps (#1467)", () => {
  const at = (id: string, startTime: string, endTime: string, date = "2026-07-04"): RecapShiftInput =>
    ({ id, roleName: "Bar", label: id, date, startTime, endTime, status: "open", waitlistEnabled: false, minAge: null })

  it("gives the allowed overlap its own gap kind and plain words", () => {
    const rows = recapShifts([at("a", "10:00", "14:00"), at("b", "12:00", "16:00")])
    const gap = gapAfter(rows, 0, true)
    expect(gap).toEqual({ kind: "allowed_overlap", minutes: 120 })
    expect(gapLabel(gap!)).toBe("Ces deux créneaux se chevauchent de 2 h. C'est autorisé pour cet événement : vérifie que tu peux tenir les deux, ou préviens l'organisation si quelqu'un te remplace.")
    expect(hasOverlap(rows, true)).toBe(false)
  })

  it("keeps the refusal when the event does not allow overlaps", () => {
    const rows = recapShifts([at("a", "10:00", "14:00"), at("b", "12:00", "16:00")])
    expect(gapAfter(rows, 0, false)?.kind).toBe("overlap")
    expect(hasOverlap(rows, false)).toBe(true)
  })

  it("finds an overlap with a shift already held, and between shifts that are not neighbours", () => {
    const rows = recapShifts([at("a", "08:00", "14:00"), at("b", "12:00", "15:00"), at("c", "16:00", "18:00")])
    expect(gapAfter(rows, 0, true)?.kind).toBe("allowed_overlap")
    const notices = allowedOverlapNotices(rows, [{ roleName: "Accueil", label: "Accueil", date: "2026-07-04", startTime: "13:00", endTime: "15:00" }])
    expect(notices).toContainEqual({ kind: "picked", minutes: 120 })
    expect(notices).toContainEqual({ kind: "held", minutes: 60, label: "Accueil" })
    expect(allowedOverlapText({ kind: "held", minutes: 90, label: "Accueil" })).toBe(
      "Ce créneau a lieu en même temps que ton créneau « Accueil » pendant 1 h 30. Tu peux quand même t'inscrire. Vérifie que tu peux faire les deux. Si quelqu'un te remplace, dis-le à l'organisation.",
    )
  })

  it("warns about an overlap with a held shift at any hour, not only next to a picked one", () => {
    const rows = recapShifts([at("a", "10:00", "12:00")])
    expect(allowedOverlapNotices(rows, [{ roleName: "Accueil", label: "Accueil", date: "2026-07-04", startTime: "11:00", endTime: "13:00" }]))
      .toEqual([{ kind: "held", minutes: 60, label: "Accueil" }])
  })
})
