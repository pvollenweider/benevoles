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
      locationDetails: "Entrée B", contactName: null, contactPhone: null, instructions: null, latitude: null, longitude: null,
    })
  })

  it("links the place to a map when coordinates are known, the event's by default (#191)", () => {
    const withMap = shiftInfoLines({ locationDetails: "Entrée B", latitude: 46.18, longitude: 6.12 })
    expect(withMap[0]).toEqual({ kind: "place", label: "Lieu", text: "Entrée B", href: "https://www.openstreetmap.org/?mlat=46.18&mlon=6.12#map=17/46.18/6.12" })
    expect(shiftInfoLines({ latitude: 46.18, longitude: 6.12 })[0].text).toBe("Point de rendez-vous")
    expect(shiftInfoLines({ locationDetails: "", latitude: 46.18, longitude: 6.12 })[0]).toMatchObject({ text: "Point de rendez-vous", href: expect.stringContaining("openstreetmap") })
    expect(shiftInfoText({ locationDetails: "Entrée B", latitude: 46.18, longitude: 6.12 })[0]).toBe("Lieu : Entrée B — Voir sur la carte : https://www.openstreetmap.org/?mlat=46.18&mlon=6.12#map=17/46.18/6.12")
    expect(pickShiftInfo({ latitude: null, longitude: null }, { latitude: 46.2, longitude: 6.1 })).toMatchObject({ latitude: 46.2, longitude: 6.1 })
    expect(pickShiftInfo({ latitude: 46.18, longitude: 6.12 }, { latitude: 46.2, longitude: 6.1 })).toMatchObject({ latitude: 46.18, longitude: 6.12 })
    expect(hasShiftInfo({ latitude: 46.18, longitude: null })).toBe(false)
  })
})
