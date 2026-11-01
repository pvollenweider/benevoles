import { describe, it, expect } from "vitest"
import {
  cancelledShiftMessage, guardShiftPlacement, overrideLogValue, shiftOverrideBody, shiftOverrideKey, shiftOverrideOf,
  shiftOverrideWarning, shiftOverrideWords, type ShiftOverrideNeed,
} from "../shift-override"

const NBSP = " "
const words = { roleName: "Bar", label: "Bar", date: "2030-07-04", startTime: "10:00", endTime: "12:00" }
const need = (over: Partial<ShiftOverrideNeed & typeof words> = {}) => ({ shiftId: "s1", key: "k", closed: false, full: true, markedFull: false, occupied: 5, capacity: 5, ...words, ...over })

describe("guardShiftPlacement (AUTHZ-15)", () => {
  it("lets a shift with a free place and open sign-ups through", () => {
    expect(guardShiftPlacement("manual_add", "v1", { id: "s1", status: "open", capacity: 5, occupied: 4 })).toEqual({ kind: "ok" })
  })

  it("refuses a cancelled shift, whatever its places", () => {
    expect(guardShiftPlacement("manual_add", "v1", { id: "s1", status: "cancelled", capacity: 5, occupied: 0 })).toEqual({ kind: "cancelled" })
  })

  it("asks once every place is taken, even while the shift is still stored as open", () => {
    expect(guardShiftPlacement("manual_add", "v1", { id: "s1", status: "open", capacity: 5, occupied: 5 })).toEqual({
      kind: "confirm",
      need: { shiftId: "s1", key: "o1|manual_add|v1|s1|open|5|5", closed: false, full: true, markedFull: false, occupied: 5, capacity: 5 },
    })
  })

  it("asks on a shift marked « Complet » by hand, places left or not (Codex)", () => {
    expect(guardShiftPlacement("accept", "r1", { id: "s1", status: "full", capacity: 5, occupied: 3 })).toMatchObject({ kind: "confirm", need: { full: true, markedFull: true } })
    expect(guardShiftPlacement("accept", "r1", { id: "s1", status: "full", capacity: 5, occupied: 5 })).toMatchObject({ kind: "confirm", need: { full: true, markedFull: false } })
  })

  it("asks on a closed shift, places left or not", () => {
    expect(guardShiftPlacement("restore", "r1", { id: "s1", status: "closed", capacity: 5, occupied: 1 })).toMatchObject({ kind: "confirm", need: { closed: true, full: false } })
    expect(guardShiftPlacement("restore", "r1", { id: "s1", status: "closed", capacity: 5, occupied: 5 })).toMatchObject({ kind: "confirm", need: { closed: true, full: true } })
  })
})

describe("shiftOverrideKey", () => {
  it("is bound to the action, the subject, the status, the spots taken and the places", () => {
    const base = { id: "s1", status: "open", capacity: 5, occupied: 5 }
    const key = shiftOverrideKey("manual_add", "v1", base)
    expect(shiftOverrideKey("accept", "v1", base)).not.toBe(key)
    expect(shiftOverrideKey("manual_add", "v2", base)).not.toBe(key)
    expect(shiftOverrideKey("manual_add", "v1", { ...base, occupied: 6 })).not.toBe(key)
    expect(shiftOverrideKey("manual_add", "v1", { ...base, capacity: 6 })).not.toBe(key)
    expect(shiftOverrideKey("manual_add", "v1", { ...base, status: "closed" })).not.toBe(key)
  })
})

describe("the confirmation's words", () => {
  it("one full shift: the state, the question, then what it becomes", () => {
    expect(shiftOverrideWords("manual_add", "Emma", [need()])).toEqual({
      title: `Ajouter Emma à un créneau complet${NBSP}?`,
      lead: `Ce créneau est complet${NBSP}: 5 places sur 5 sont prises. Ajouter Emma quand même${NBSP}?`,
      lines: ["Bar, jeudi 4 juillet, de 10h à 12h.", "Il y aura 6 personnes pour 5 places."],
    })
  })

  it("a closed shift says so in its own sentence", () => {
    expect(shiftOverrideWords("restore", "Emma Rochat", [need({ closed: true, full: false, occupied: 2 })]).lead)
      .toBe(`Les inscriptions à ce créneau sont fermées${NBSP}: 2 places sur 5 sont prises. Rétablir l'inscription de Emma Rochat quand même${NBSP}?`)
  })

  it("several shifts: a plural title and one line each", () => {
    const out = shiftOverrideWords("manual_add", "Emma", [need(), need({ shiftId: "s2", closed: true, full: false, occupied: 1, capacity: 1, label: "Matin" })])
    expect(out.title).toBe(`Ajouter Emma à 2 créneaux complets ou fermés${NBSP}?`)
    expect(out.lines).toEqual([
      `Bar, jeudi 4 juillet, de 10h à 12h${NBSP}: complet, 5 places sur 5 sont prises. Il y aura 6 personnes pour 5 places.`,
      `Bar, Matin, jeudi 4 juillet, de 10h à 12h${NBSP}: inscriptions fermées, 1 place sur 1 est prise. Il y aura 2 personnes pour 1 place.`,
    ])
  })

  it("the warning of a dialog already open", () => {
    expect(shiftOverrideWarning([need({ markedFull: true, occupied: 3 })])).toBe(`Ce créneau est marqué complet${NBSP}: 3 places sur 5 sont prises. Il y aura 4 personnes pour 5 places.`)
  })

  it("the log keeps the state confirmed, after the addition", () => {
    expect(overrideLogValue(need())).toBe("complet, 6 sur 5")
    expect(overrideLogValue(need({ closed: true, full: false, occupied: 2 }))).toBe("inscriptions fermées, 3 sur 5")
  })

  it("the cancelled shift's refusal says to reopen it first", () => {
    expect(cancelledShiftMessage("Bar")).toBe(`Le créneau « Bar » est annulé. Rouvrez d'abord le créneau${NBSP}: rien n'a été fait.`)
  })
})

describe("the 409 body", () => {
  it("is read back by the pages, and only for this refusal", () => {
    const body = shiftOverrideBody([need()])
    expect(body.code).toBe("shift_override")
    expect(body.error).toContain("rien n'a été ajouté")
    expect(shiftOverrideOf(body)).toEqual([need()])
    expect(shiftOverrideOf({ code: "availability", outside: [] })).toBeNull()
    expect(shiftOverrideOf({ code: "shift_override", shifts: [] })).toBeNull()
    expect(shiftOverrideOf(null)).toBeNull()
  })
})
