import { describe, it, expect } from "vitest"
import { hasShiftInfo, pickShiftInfo, shiftInfoLines, shiftInfoText } from "../shift-info"

describe("shiftInfoLines", () => {
  it("returns nothing for a shift without info, blanks included", () => {
    expect(shiftInfoLines({})).toEqual([])
    expect(shiftInfoLines({ locationDetails: "  ", contactName: null, contactPhone: "", instructions: undefined })).toEqual([])
    expect(hasShiftInfo({ contactPhone: " " })).toBe(false)
  })

  it("lists place, contact and instructions in reading order", () => {
    expect(shiftInfoLines({ instructions: "Venir 10 min avant.", contactName: "Léa", contactPhone: "079 000 00 00", locationDetails: "Entrée B" })).toEqual([
      { kind: "place", label: "Lieu", text: "Entrée B" },
      { kind: "contact", label: "Contact", text: "Léa · 079 000 00 00" },
      { kind: "instructions", label: "À savoir", text: "Venir 10 min avant." },
    ])
  })

  it("shows a contact with only a name or only a phone", () => {
    expect(shiftInfoLines({ contactName: "Léa" })[0].text).toBe("Léa")
    expect(shiftInfoLines({ contactPhone: "079 000 00 00" })[0].text).toBe("079 000 00 00")
  })

  it("formats plain-text lines and picks the fields from a row", () => {
    expect(shiftInfoText({ locationDetails: "Entrée B", instructions: "Gilet fourni" })).toEqual(["Lieu : Entrée B", "À savoir : Gilet fourni"])
    expect(pickShiftInfo({ id: "s1", locationDetails: "Entrée B", contactName: undefined })).toEqual({
      locationDetails: "Entrée B", contactName: null, contactPhone: null, instructions: null,
    })
  })
})
