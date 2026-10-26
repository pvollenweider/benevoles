import { describe, expect, it } from "vitest"
import { eventPostes, matchingPoste, posteKey, posteSettingsHint, posteSuggestions } from "../poste-suggestions"

// #1018: the poste field of the shift forms suggests the event's postes first, then the examples.

const shifts = [
  { roleName: "Accueil", displayOrder: 200 },
  { roleName: "Bar", displayOrder: 100 },
  { roleName: "Buvette", displayOrder: 300 },
  { roleName: "accueil ", displayOrder: 200 },
  { roleName: "Bar", displayOrder: 100 },
]

describe("posteKey", () => {
  it("ignores case, surrounding spaces and repeated inner spaces", () => {
    expect(posteKey("  Montage   &  rangement ")).toBe(posteKey("montage & rangement"))
    expect(posteKey("Vidéo")).not.toBe(posteKey("Video"))
  })
})

describe("eventPostes", () => {
  it("lists every poste once, in the event's poste order, first spelling kept", () => {
    expect(eventPostes(shifts)).toEqual(["Bar", "Accueil", "Buvette"])
  })

  it("ignores cancelled shifts and blank names", () => {
    expect(eventPostes([
      { roleName: "Loge", displayOrder: 0, status: "cancelled" },
      { roleName: "  ", displayOrder: 0 },
      { roleName: "Parking", displayOrder: 0, status: "open" },
    ])).toEqual(["Parking"])
  })

  it("keeps postes of every day (no date filter) and treats a missing order as 0", () => {
    expect(eventPostes([{ roleName: "Jour 2" , displayOrder: 5 }, { roleName: "Jour 1" }])).toEqual(["Jour 1", "Jour 2"])
  })
})

describe("posteSuggestions", () => {
  it("puts the event's postes first, then the examples it does not use", () => {
    expect(posteSuggestions(shifts, ["Buvette", "Loge", "bar", "Photos"])).toEqual(["Bar", "Accueil", "Buvette", "Loge", "Photos"])
  })

  it("is only the examples for an event without shifts", () => {
    expect(posteSuggestions([], ["Billetterie", "Buvette"])).toEqual(["Billetterie", "Buvette"])
  })

  it("defaults to the app's example postes", () => {
    const list = posteSuggestions([{ roleName: "BUVETTE", displayOrder: 0 }])
    expect(list[0]).toBe("BUVETTE")
    expect(list.filter((p) => posteKey(p) === "buvette")).toHaveLength(1)
    expect(list).toContain("Billetterie")
  })
})

describe("matchingPoste", () => {
  it("returns the stored spelling of an existing poste typed loosely", () => {
    expect(matchingPoste(shifts, " buvette ")).toBe("Buvette")
    expect(matchingPoste(shifts, "ACCUEIL")).toBe("Accueil")
  })

  it("is null for a new poste, an empty field or a cancelled poste", () => {
    expect(matchingPoste(shifts, "Loge")).toBeNull()
    expect(matchingPoste(shifts, "   ")).toBeNull()
    expect(matchingPoste([{ roleName: "Loge", status: "cancelled" }], "Loge")).toBeNull()
  })
})

describe("posteSettingsHint", () => {
  it("names the poste and the settings it carries", () => {
    expect(posteSettingsHint("Bar")).toBe("Les paramètres du poste «\u00a0Bar\u00a0» s'appliquent (couleur, limite, accès, chevauchement).")
  })
})
