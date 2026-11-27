// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { barDetailsText, detailsButtonName, shiftDetails, shiftDetailsById } from "../shift-details"

describe("shiftDetails (#1471)", () => {
  it("keeps the description and the public practical info, never a contact", () => {
    const d = shiftDetails({ description: " Servir les boissons ", locationDetails: "Entrée B", instructions: "Chaussures fermées", latitude: 46.2, longitude: 6.1 })
    expect(d?.description).toBe("Servir les boissons")
    expect(d?.info).toEqual({ locationDetails: "Entrée B", instructions: "Chaussures fermées", latitude: 46.2, longitude: 6.1, mealOnTheGo: undefined })
    expect(d?.info).not.toHaveProperty("contactName")
  })
  it("is null when there is nothing to read beyond the name and the time", () => {
    expect(shiftDetails({ description: "  ", locationDetails: null, instructions: "" })).toBeNull()
  })
  it("counts a meeting point alone, and a description alone", () => {
    expect(shiftDetails({ latitude: 46.2, longitude: 6.1 })).not.toBeNull()
    expect(shiftDetails({ description: "Accueillir les visiteurs" })).not.toBeNull()
  })
  it("maps only the shifts that have details", () => {
    const map = shiftDetailsById([{ id: "a", instructions: "Gilet fourni" }, { id: "b" }])
    expect([...map.keys()]).toEqual(["a"])
  })
})

describe("names and descriptions", () => {
  it("starts the button's name with its visible word", () => {
    expect(detailsButtonName("09h–11h · Accueil")).toBe("Détails : 09h–11h · Accueil")
  })
  it("tells a screen-reader user the place and where the rest is", () => {
    expect(barDetailsText(shiftDetails({ locationDetails: "Entrée B", instructions: "Gilet" })!)).toBe("Lieu : Entrée B. Détails sous le planning.")
    expect(barDetailsText(shiftDetails({ locationDetails: "Entrée B" })!)).toBe("Lieu : Entrée B.")
    expect(barDetailsText(shiftDetails({ description: "Servir" })!)).toBe("Détails sous le planning.")
    expect(barDetailsText(shiftDetails({ latitude: 46.2, longitude: 6.1 })!)).toBe("Lieu : Point de rendez-vous. Détails sous le planning.")
  })
})
