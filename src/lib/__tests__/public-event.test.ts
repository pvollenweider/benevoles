import { describe, it, expect } from "vitest"
import { toPublicEvent, type PublicEventRow } from "../public-event"

// What the anonymous sign-up page receives: the contact person of a shift is not part of it.
describe("toPublicEvent", () => {
  it("publishes place and instructions of a shift, never the contact person", () => {
    const row = {
      id: "e", slug: "fete", title: "Fête", description: null, location: null, startDate: new Date(), endDate: new Date(),
      publicInstructions: null, confirmationMessage: null, requirePhone: false, showSchedule: [],
      organization: { name: "Org", slug: "org", volunteerCharter: null },
      pages: [],
      shifts: [{
        id: "s1", roleName: "Bar", label: "Bar", description: null, date: new Date(), startTime: "10:00", endTime: "12:00", capacity: 2, status: "open",
        locationDetails: "Entrée B", contactName: "Léa", contactPhone: "079 000 00 00", instructions: "Gilet fourni",
        displayOrder: 0, waitlistEnabled: false, minAge: null, colorKey: null, registrations: [],
      }],
    } as unknown as PublicEventRow
    const shift = toPublicEvent(row).shifts[0] as Record<string, unknown>
    expect(shift.locationDetails).toBe("Entrée B")
    expect(shift.instructions).toBe("Gilet fourni")
    expect(shift).not.toHaveProperty("contactName")
    expect(shift).not.toHaveProperty("contactPhone")
    expect(JSON.stringify(toPublicEvent(row))).not.toContain("079 000 00 00")
  })
})
