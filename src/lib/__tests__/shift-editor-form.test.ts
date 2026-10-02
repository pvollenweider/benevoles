import { describe, it, expect } from "vitest"
import { missingShiftFields, missingFieldsSummary, shiftSavedMessage, SHIFT_FIELD_ERRORS } from "../shift-editor-form"

// Checks and wording of the shift editor (#554).

const filled = { roleName: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00", capacity: 2 }

describe("missingShiftFields", () => {
  it("lists every required field of an empty form, in form order", () => {
    expect(missingShiftFields({ roleName: "", date: "", startTime: "", endTime: "", capacity: "" }))
      .toEqual(["roleName", "date", "startTime", "endTime", "capacity"])
  })

  it("is empty for a complete form", () => {
    expect(missingShiftFields(filled)).toEqual([])
  })

  it("treats a blank role as missing", () => {
    expect(missingShiftFields({ ...filled, roleName: "   " })).toEqual(["roleName"])
  })

  it("treats an empty capacity as missing, but not 0 as a number", () => {
    expect(missingShiftFields({ ...filled, capacity: "" })).toEqual(["capacity"])
    expect(missingShiftFields({ ...filled, capacity: " " })).toEqual(["capacity"])
    expect(missingShiftFields({ ...filled, capacity: 0 })).toEqual([])
  })

  it("keeps the form order whatever is missing", () => {
    expect(missingShiftFields({ ...filled, endTime: "", roleName: "" })).toEqual(["roleName", "endTime"])
  })

  it("has a message for each field, without colour words", () => {
    for (const text of Object.values(SHIFT_FIELD_ERRORS)) {
      expect(text).toMatch(/\.$/)
      expect(text).not.toMatch(/rouge/)
    }
  })
})

describe("missingFieldsSummary", () => {
  it("names one field", () => {
    expect(missingFieldsSummary(["roleName"])).toBe("À remplir : le poste.")
  })

  it("joins two fields with « et »", () => {
    expect(missingFieldsSummary(["roleName", "endTime"])).toBe("À remplir : le poste et l'heure de fin.")
  })

  it("lists four fields with commas and a final « et »", () => {
    expect(missingFieldsSummary(["roleName", "date", "startTime", "endTime"]))
      .toBe("À remplir : le poste, la date, l'heure de début et l'heure de fin.")
  })

  it("lists all five fields", () => {
    expect(missingFieldsSummary(["roleName", "date", "startTime", "endTime", "capacity"]))
      .toBe("À remplir : le poste, la date, l'heure de début, l'heure de fin et la capacité.")
  })

  it("is empty when nothing is missing", () => {
    expect(missingFieldsSummary([])).toBe("")
  })
})

describe("shiftSavedMessage", () => {
  const bar = { roleName: "Bar", label: "Bar", date: "2026-07-04", startTime: "10:00", endTime: "12:00" }

  it("announces an added shift in words", () => {
    expect(shiftSavedMessage("added", bar)).toBe("Créneau ajouté : Bar, samedi 4 juillet, de 10h à 12h.")
  })

  it("announces an edited shift", () => {
    expect(shiftSavedMessage("edited", bar)).toBe("Créneau modifié : Bar, samedi 4 juillet, de 10h à 12h.")
  })

  it("says the label only when it differs from the role, and reads half hours", () => {
    expect(shiftSavedMessage("added", { ...bar, label: "Entrée principale", startTime: "10:30" }))
      .toBe("Créneau ajouté : Bar, Entrée principale, samedi 4 juillet, de 10h30 à 12h.")
    expect(shiftSavedMessage("added", { ...bar, label: "" })).toBe("Créneau ajouté : Bar, samedi 4 juillet, de 10h à 12h.")
    expect(shiftSavedMessage("added", { ...bar, label: null })).toBe("Créneau ajouté : Bar, samedi 4 juillet, de 10h à 12h.")
  })

  it("takes the day from the ISO date-time the API returns", () => {
    expect(shiftSavedMessage("added", { ...bar, date: "2026-07-04T00:00:00.000Z" }))
      .toBe("Créneau ajouté : Bar, samedi 4 juillet, de 10h à 12h.")
  })

  it("has no « · », « – », and no colon in the shift itself", () => {
    const text = shiftSavedMessage("added", { ...bar, label: "Soir", startTime: "18:15", endTime: "23:45" })
    const shift = text.slice("Créneau ajouté : ".length)
    expect(text).not.toMatch(/[·–—]/)
    expect(shift).not.toContain(":")
    expect(shift).toBe("Bar, Soir, samedi 4 juillet, de 18h15 à 23h45.")
  })
})
