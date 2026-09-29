import { describe, it, expect } from "vitest"
import { copiedShift, type DuplicableShift } from "../event-duplicate"

const source: DuplicableShift & { id: string; eventId: string; status: string } = {
  id: "s1", eventId: "e1", status: "closed",
  roleName: "Bar", label: "Bar soir", description: "Service", date: new Date("2026-07-04T00:00:00Z"),
  startTime: "18:00", endTime: "23:00", capacity: 4, locationDetails: "Cantine", contactName: "Léa", contactPhone: "079 1",
  instructions: "Gilet fourni", displayOrder: 2, internalNotes: "note", minAge: 18, waitlistEnabled: true, colorKey: "amber",
}

// Regression for #356: the copy used to drop minAge, waitlistEnabled and colorKey.
describe("copiedShift", () => {
  it("keeps the minimum age, the waitlist setting and the role color", () => {
    const copy = copiedShift(source)
    expect(copy).toMatchObject({ minAge: 18, waitlistEnabled: true, colorKey: "amber" })
  })

  it("copies every setting but never the identity or the status", () => {
    const copy = copiedShift(source) as Record<string, unknown>
    expect(copy.status).toBe("open")
    expect(copy).not.toHaveProperty("id")
    expect(copy).not.toHaveProperty("eventId")
    expect(copy).toMatchObject({ roleName: "Bar", label: "Bar soir", capacity: 4, displayOrder: 2, contactPhone: "079 1", instructions: "Gilet fourni" })
  })
})
