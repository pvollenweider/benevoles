import { describe, it, expect } from "vitest"
import { availabilityLabel, availabilitySchema, hasAvailability, AVAILABILITY_PERIODS } from "../availability"

describe("availability", () => {
  it("labels periods in day order with the note", () => {
    expect(availabilityLabel({ availabilityPeriods: ["evening", "morning"], availabilityNote: "pas le dimanche" })).toBe("Matin, Soir · pas le dimanche")
    expect(availabilityLabel({ availabilityPeriods: [], availabilityNote: "  semaine seulement " })).toBe("semaine seulement")
    expect(availabilityLabel({ availabilityPeriods: ["afternoon"] })).toBe("Après-midi")
    expect(availabilityLabel({})).toBe("")
    expect(hasAvailability({ availabilityNote: " " })).toBe(false)
  })

  it("validates and normalizes what the forms send", () => {
    const ok = availabilitySchema.safeParse({ availabilityPeriods: ["evening", "morning", "evening"], availabilityNote: "  " })
    expect(ok.success && ok.data).toEqual({ availabilityPeriods: ["morning", "evening"], availabilityNote: null })
    expect(availabilitySchema.safeParse({ availabilityPeriods: ["night"], availabilityNote: null }).success).toBe(false)
    expect(availabilitySchema.safeParse({ availabilityPeriods: [], availabilityNote: "x".repeat(141) }).success).toBe(false)
    expect(AVAILABILITY_PERIODS.map((p) => p.id)).toEqual(["morning", "afternoon", "evening"])
  })
})
