import { describe, it, expect } from "vitest"
import { isRepeatedLetter, moveActive, panelShift, shiftOptionLabel, shiftTypeaheadText, typeaheadIndex } from "../shift-select"
import { fmtShortDate, type ShiftRef } from "../registrations-list"

// The shift picker's spoken names and keyboard arithmetic (#555).
const shift = (over: Partial<ShiftRef> = {}): ShiftRef => ({
  id: "s1", roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 3, registrationCount: 0, ...over,
})
const date = fmtShortDate("2026-07-04")
const none = { alreadyRegistered: false, conflict: false }

describe("shiftOptionLabel", () => {
  it("names an empty shift", () => {
    expect(shiftOptionLabel(shift(), none)).toBe(`${date}, de 10h à 12h, Bar, aucun inscrit sur 3`)
  })

  it("counts one, then several registrations", () => {
    expect(shiftOptionLabel(shift({ registrationCount: 1 }), none)).toBe(`${date}, de 10h à 12h, Bar, 1 inscrit sur 3`)
    expect(shiftOptionLabel(shift({ registrationCount: 2 }), none)).toBe(`${date}, de 10h à 12h, Bar, 2 inscrits sur 3`)
  })

  it("says complet when full", () => {
    expect(shiftOptionLabel(shift({ registrationCount: 3 }), none)).toBe(`${date}, de 10h à 12h, Bar, complet`)
    expect(shiftOptionLabel(shift({ registrationCount: 0, capacity: 0 }), none)).toBe(`${date}, de 10h à 12h, Bar, complet`)
  })

  it("adds the label only when it differs from the role, and half hours", () => {
    expect(shiftOptionLabel(shift({ label: "Soir", startTime: "18:30", endTime: "20:00" }), none))
      .toBe(`${date}, de 18h30 à 20h, Bar, Soir, aucun inscrit sur 3`)
  })

  it("says already registered and the time conflict", () => {
    expect(shiftOptionLabel(shift({ registrationCount: 1 }), { alreadyRegistered: true, conflict: false }))
      .toBe(`${date}, de 10h à 12h, Bar, 1 inscrit sur 3, déjà inscrit`)
    expect(shiftOptionLabel(shift(), { alreadyRegistered: true, conflict: true }))
      .toBe(`${date}, de 10h à 12h, Bar, aucun inscrit sur 3, déjà inscrit, conflit d'horaire`)
  })

  it("starts with the visible date text", () => {
    expect(date).toBe("sam. 4 juil.")
  })
})

describe("shiftTypeaheadText", () => {
  it("is the role, then the label when it differs", () => {
    expect(shiftTypeaheadText(shift())).toBe("Bar")
    expect(shiftTypeaheadText(shift({ label: "Soir" }))).toBe("Bar Soir")
  })
})

describe("typeaheadIndex", () => {
  const labels = ["Tous les créneaux", "Bar", "Accueil", "Bar Soir", "Équipe"]

  it("finds the next option starting with the letters, wrapping around", () => {
    expect(typeaheadIndex(labels, "b", 0)).toBe(1)
    expect(typeaheadIndex(labels, "b", 2)).toBe(3)
    expect(typeaheadIndex(labels, "b", 4)).toBe(1)
    expect(typeaheadIndex(labels, "a", 3)).toBe(2)
  })

  it("ignores case and accents", () => {
    expect(typeaheadIndex(labels, "e", 0)).toBe(4)
    expect(typeaheadIndex(labels, "EQU", 0)).toBe(4)
    expect(typeaheadIndex(labels, "tous les cre", 1)).toBe(0)
  })

  it("cycles through the matches when the same letter is repeated", () => {
    expect(typeaheadIndex(labels, "bb", 2)).toBe(3)
    expect(typeaheadIndex(labels, "bbb", 4)).toBe(1)
  })

  it("refines with more letters", () => {
    expect(typeaheadIndex(labels, "bar s", 1)).toBe(3)
  })

  it("returns -1 when nothing matches or the list is empty", () => {
    expect(typeaheadIndex(labels, "z", 0)).toBe(-1)
    expect(typeaheadIndex([], "b", 0)).toBe(-1)
    expect(typeaheadIndex(labels, "", 0)).toBe(-1)
  })
})

describe("moveActive", () => {
  it("moves by one and clamps at both ends", () => {
    expect(moveActive("ArrowDown", 0, 3)).toBe(1)
    expect(moveActive("ArrowDown", 2, 3)).toBe(2)
    expect(moveActive("ArrowUp", 1, 3)).toBe(0)
    expect(moveActive("ArrowUp", 0, 3)).toBe(0)
    expect(moveActive("ArrowDown", -1, 3)).toBe(0)
  })

  it("jumps to the first and last options", () => {
    expect(moveActive("Home", 2, 5)).toBe(0)
    expect(moveActive("End", 0, 5)).toBe(4)
  })

  it("moves ten options with PageDown and PageUp, clamped", () => {
    expect(moveActive("PageDown", 0, 25)).toBe(10)
    expect(moveActive("PageDown", 20, 25)).toBe(24)
    expect(moveActive("PageUp", 15, 25)).toBe(5)
    expect(moveActive("PageUp", 3, 25)).toBe(0)
  })

  it("has no active option in an empty list", () => {
    expect(moveActive("ArrowDown", 0, 0)).toBe(-1)
  })
})

describe("isRepeatedLetter", () => {
  it("treats a letter repeated with another case or accent as the same letter", () => {
    expect(isRepeatedLetter("e")).toBe(true)
    expect(isRepeatedLetter("eÉ")).toBe(true)
    expect(isRepeatedLetter("bB")).toBe(true)
    expect(isRepeatedLetter("ba")).toBe(false)
    expect(isRepeatedLetter("")).toBe(false)
  })
})

// #574: the open list stays inside the viewport near the right edge (WCAG 1.4.10).
describe("panelShift", () => {
  it("does not move a list that fits", () => {
    expect(panelShift(100, 500, 1024)).toBe(0)
  })

  it("moves an overflowing list left so it ends 8 px inside the viewport", () => {
    // 700 + 500 = 1200, the viewport ends at 1024 - 8 = 1016: 184 px too far.
    expect(panelShift(700, 500, 1024)).toBe(184)
  })

  it("never moves the list past the left margin", () => {
    // 1100 px too far, but the trigger starts 200 px from the edge: 192 px at most.
    expect(panelShift(200, 2000, 1024)).toBe(192)
    expect(panelShift(4, 400, 300)).toBe(0)
  })

  it("does not move a list that ends exactly at the margin", () => {
    expect(panelShift(516, 500, 1024)).toBe(0)
  })
})
