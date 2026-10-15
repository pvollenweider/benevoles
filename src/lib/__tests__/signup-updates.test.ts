import { describe, it, expect } from "vitest"
import { contactChanges, readUpdatedParams, sessionFormNote, setUpdatedParams, updatedNotice } from "../signup-updates"

// More shifts from the personal page (#1013): what changed in the contact details, and the
// confirmation's line saying what was updated.

describe("contactChanges", () => {
  const stored = { firstName: "Julie", lastName: "Martin", phone: "079 111 11 11" }

  it("nothing changed, spaces around included: no change", () => {
    expect(contactChanges(stored, { firstName: " Julie ", lastName: "Martin", phone: "079 111 11 11 " })).toEqual([])
  })

  it("a new phone and a corrected name, in form order", () => {
    expect(contactChanges(stored, { firstName: "Julie", lastName: "Martin-Roy", phone: "079 222 22 22" })).toEqual([
      { field: "lastName", from: "Martin", to: "Martin-Roy" },
      { field: "phone", from: "079 111 11 11", to: "079 222 22 22" },
    ])
  })

  it("a phone emptied is a change to none; a phone added to none too", () => {
    expect(contactChanges(stored, { phone: "" })).toEqual([{ field: "phone", from: "079 111 11 11", to: null }])
    expect(contactChanges({ ...stored, phone: null }, { phone: "079" })).toEqual([{ field: "phone", from: null, to: "079" }])
    expect(contactChanges({ ...stored, phone: null }, { phone: "  " })).toEqual([])
  })

  it("a field not sent keeps its value", () => {
    expect(contactChanges(stored, { firstName: "Julie" })).toEqual([])
  })
})

describe("updatedNotice", () => {
  it("names what was updated, answers counted with the right plural", () => {
    expect(updatedNotice({ contact: ["phone"], answers: 1 })).toBe("Modifications enregistrées : ton téléphone et 1 réponse.")
    expect(updatedNotice({ contact: ["phone", "firstName"], answers: 2 })).toBe("Modifications enregistrées : ton prénom, ton téléphone et 2 réponses.")
    expect(updatedNotice({ contact: [], answers: 3 })).toBe("Modifications enregistrées : 3 réponses.")
    expect(updatedNotice({ contact: ["lastName"], answers: 0 })).toBe("Modifications enregistrées : ton nom.")
  })

  it("nothing updated, or no update at all: no line", () => {
    expect(updatedNotice({ contact: [], answers: 0 })).toBeNull()
    expect(updatedNotice(null)).toBeNull()
  })
})

describe("the confirmation's parameters", () => {
  it("round-trip field keys and the count, never values", () => {
    const p = new URLSearchParams()
    setUpdatedParams(p, { contact: ["phone", "lastName"], answers: 2 })
    expect(p.toString()).toBe("updated=lastName%2Cphone&updatedAnswers=2")
    expect(readUpdatedParams(p)).toEqual({ contact: ["lastName", "phone"], answers: 2 })
  })

  it("nothing updated: no parameter", () => {
    const p = new URLSearchParams()
    setUpdatedParams(p, { contact: [], answers: 0 })
    setUpdatedParams(p, undefined)
    expect(p.toString()).toBe("")
  })

  it("ignores anything unknown or malformed", () => {
    expect(readUpdatedParams(new URLSearchParams("updated=email,phone,<b>&updatedAnswers=-1"))).toEqual({ contact: ["phone"], answers: 0 })
    expect(readUpdatedParams(new URLSearchParams("updatedAnswers=1.5"))).toEqual({ contact: [], answers: 0 })
  })
})

describe("sessionFormNote", () => {
  it("names the answers only when the event asks questions", () => {
    expect(sessionFormNote(true)).toContain("tes réponses")
    expect(sessionFormNote(false)).not.toContain("réponses")
  })
})
