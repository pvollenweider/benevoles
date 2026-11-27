// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { barDetailsText, detailsButtonName, hasShortShift, shiftDetails, shiftDetailsById } from "../shift-details"

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
  // Regression (review of #1471): every shift inherits the event's meeting point, so a map link
  // alone put « Détails » under every shift of an event with an address.
  it("does not count a meeting point alone, but keeps its link once there is something else", () => {
    expect(shiftDetails({ latitude: 46.2, longitude: 6.1 })).toBeNull()
    expect(shiftDetails({ instructions: "Gilet", latitude: 46.2, longitude: 6.1 })?.info).toMatchObject({ latitude: 46.2, longitude: 6.1 })
    expect(shiftDetails({ description: "Accueillir les visiteurs" })).not.toBeNull()
    expect(shiftDetails({ mealOnTheGo: true })).not.toBeNull()
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
    expect(barDetailsText(shiftDetails({ instructions: "Gilet", latitude: 46.2, longitude: 6.1 })!)).toBe("Lieu : Point de rendez-vous. Détails sous le planning.")
  })
})

describe("hasShortShift (#1470)", () => {
  it("is true from one shift of 60 minutes or less, cancelled ones aside", () => {
    expect(hasShortShift([{ startTime: "08:00", endTime: "09:00" }])).toBe(true)
    expect(hasShortShift([{ startTime: "08:00", endTime: "09:01" }])).toBe(false)
    expect(hasShortShift([{ startTime: "08:00", endTime: "08:30", status: "cancelled" }, { startTime: "10:00", endTime: "14:00" }])).toBe(false)
  })
  it("counts a night shift's real length", () => {
    expect(hasShortShift([{ startTime: "22:00", endTime: "00:30" }])).toBe(false)
    expect(hasShortShift([{ startTime: "23:30", endTime: "00:15" }])).toBe(true)
  })
  it("reads time like the frise: « 24:00 » ends the day, equal hours are a whole day", () => {
    expect(hasShortShift([{ startTime: "23:30", endTime: "24:00" }])).toBe(true)
    expect(hasShortShift([{ startTime: "08:00", endTime: "08:00" }])).toBe(false)
  })
})
