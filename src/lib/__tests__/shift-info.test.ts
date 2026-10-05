import { describe, it, expect } from "vitest"
import { EMERGENCY_NOTE, emergencyNoteFor, hasShiftInfo, onSiteContact, pickShiftInfo, shiftInfoLines, shiftInfoText, telHref, withDayContact, withSectorLeaders } from "../shift-info"

describe("shiftInfoLines", () => {
  it("returns nothing for a shift without info, blanks included", () => {
    expect(shiftInfoLines({})).toEqual([])
    expect(shiftInfoLines({ locationDetails: "  ", contactName: null, contactPhone: "", instructions: undefined })).toEqual([])
    expect(hasShiftInfo({ contactPhone: " " })).toBe(false)
  })

  it("lists place, contact and instructions in reading order", () => {
    expect(shiftInfoLines({ instructions: "Venir 10 min avant.", contactName: "Léa", contactPhone: "079 000 00 00", locationDetails: "Entrée B" })).toEqual([
      { kind: "place", label: "Lieu", text: "Entrée B" },
      { kind: "contact", label: "Contact pour ce créneau", text: "Léa, 079 000 00 00" },
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
    expect(shiftInfoText({ locationDetails: "Entrée B", latitude: 46.18, longitude: 6.12 })[0]).toBe("Lieu : Entrée B. Voir sur la carte : https://www.openstreetmap.org/?mlat=46.18&mlon=6.12#map=17/46.18/6.12")
    // No doubled punctuation when the place already ends a sentence.
    expect(shiftInfoText({ locationDetails: "Entrée B.", latitude: 46.18, longitude: 6.12 })[0]).toMatch(/^Lieu : Entrée B\. Voir sur la carte : /)
    expect(shiftInfoText({ locationDetails: "Où ça ?", latitude: 46.18, longitude: 6.12 })[0]).toMatch(/^Lieu : Où ça \? Voir sur la carte : /)
    expect(pickShiftInfo({ latitude: null, longitude: null }, { latitude: 46.2, longitude: 6.1 })).toMatchObject({ latitude: 46.2, longitude: 6.1 })
    expect(pickShiftInfo({ latitude: 46.18, longitude: 6.12 }, { latitude: 46.2, longitude: 6.1 })).toMatchObject({ latitude: 46.18, longitude: 6.12 })
    expect(hasShiftInfo({ latitude: 46.18, longitude: null })).toBe(false)
  })
})

// Day-of contact (#560): the shift's contact first, the event's as the fallback, never mixed.
describe("onSiteContact and withDayContact", () => {
  const event = { dayContactName: " Coordination ", dayContactPhone: "079 111 11 11" }

  it("prefers the shift's contact, whole, over the day-of contact", () => {
    expect(onSiteContact({ contactName: "Léa", dayContactName: "Coordination", dayContactPhone: "079 111 11 11" })).toEqual({ kind: "shift", label: "Contact pour ce créneau", name: "Léa", phone: "" })
    expect(onSiteContact({ contactPhone: "079 000 00 00", dayContactName: "Coordination" })).toMatchObject({ kind: "shift", name: "", phone: "079 000 00 00" })
  })

  it("falls back on the day-of contact, then on nothing", () => {
    expect(onSiteContact({ contactName: " ", dayContactName: "Coordination", dayContactPhone: "079 111 11 11" })).toEqual({ kind: "day", label: "Contact le jour J", name: "Coordination", phone: "079 111 11 11" })
    expect(onSiteContact({ dayContactPhone: "079 111 11 11" })).toMatchObject({ kind: "day", name: "", phone: "079 111 11 11" })
    expect(onSiteContact({ contactName: "", dayContactName: "  " })).toBeNull()
  })

  it("attaches the day-of contact only to a shift without a contact of its own", () => {
    expect(withDayContact({ locationDetails: "Entrée B" }, event)).toEqual({ locationDetails: "Entrée B", dayContactName: "Coordination", dayContactPhone: "079 111 11 11" })
    expect(withDayContact({ dayContactName: undefined, contactName: "Léa" }, event)).toEqual({ dayContactName: undefined, contactName: "Léa" })
    expect(withDayContact({ contactPhone: "079 000 00 00" }, event)).not.toHaveProperty("dayContactPhone")
    expect(withDayContact({ locationDetails: "Entrée B" }, { dayContactName: " ", dayContactPhone: null })).toEqual({ locationDetails: "Entrée B" })
    expect(withDayContact({ locationDetails: "Entrée B" }, null)).toEqual({ locationDetails: "Entrée B" })
    expect(withDayContact({}, { dayContactName: "Coordination" })).toEqual({ dayContactName: "Coordination", dayContactPhone: null })
  })

  it("labels the line and adds the emergency note once, only for the day-of contact", () => {
    expect(shiftInfoText(withDayContact({ instructions: "Gilet fourni" }, event))).toEqual(["Contact le jour J : Coordination, 079 111 11 11", "À savoir : Gilet fourni"])
    const dayShift = withDayContact({}, event)
    expect(emergencyNoteFor([{ contactName: "Léa" }, dayShift, dayShift])).toBe(EMERGENCY_NOTE)
    expect(emergencyNoteFor([{ contactName: "Léa", dayContactName: "Coordination" }])).toBeNull()
    expect(emergencyNoteFor([])).toBeNull()
  })

  // Sector leaders (#560): their names only, for the shift's role.
  it("attaches the role's leaders by name, nothing else", () => {
    const leaders = [
      { roleName: "Bar", name: " Paul Martin ", email: "paul@x.ch" },
      { roleName: "Bar", name: "Paul Martin", email: "paul2@x.ch" },
      { roleName: "Accueil", name: "Zoé Roux", email: "zoe@x.ch" },
    ]
    const info = withSectorLeaders({ locationDetails: "Entrée B" }, "Bar", leaders)
    expect(info).toEqual({ locationDetails: "Entrée B", sectorLeaderNames: ["Paul Martin"] })
    expect(JSON.stringify(info)).not.toContain("@")
    expect(withSectorLeaders({}, "Montage", leaders)).toEqual({})
    expect(shiftInfoText(withSectorLeaders({ contactName: "Léa" }, "Bar", leaders))).toEqual(["Contact pour ce créneau : Léa", "Responsable du poste : Paul Martin"])
    expect(shiftInfoText({ sectorLeaderNames: ["A", "B"] })).toEqual(["Responsables du poste : A, B"])
  })

  it("keeps only digits and a plus sign in the tel: link", () => {
    expect(telHref("+41 (0)79 111-11-11")).toBe("tel:+410791111111")
  })
})
