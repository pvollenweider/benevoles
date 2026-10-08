import { describe, it, expect } from "vitest"
import { publicEventPayload, toPublicEvent, type PublicEventRow } from "../public-event"

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

  // Day-of contact (#560): registered volunteers only, never in the public payload.
  it("never publishes the event's day-of contact", () => {
    const row = {
      id: "e", slug: "fete", title: "Fête", description: null, location: null, startDate: new Date(), endDate: new Date(),
      publicInstructions: null, confirmationMessage: null, requirePhone: false, showSchedule: [],
      dayContactName: "Coordination Marc", dayContactPhone: "079 111 11 11",
      organization: { name: "Org", slug: "org", volunteerCharter: null },
      pages: [],
      shifts: [{
        id: "s1", roleName: "Bar", label: "Bar", description: null, date: new Date(), startTime: "10:00", endTime: "12:00", capacity: 2, status: "open",
        locationDetails: null, contactName: null, contactPhone: null, instructions: null,
        displayOrder: 0, waitlistEnabled: false, minAge: null, colorKey: null, registrations: [],
      }],
    } as unknown as PublicEventRow
    const out = toPublicEvent(row)
    expect(out).not.toHaveProperty("dayContactName")
    expect(out).not.toHaveProperty("dayContactPhone")
    const json = JSON.stringify(out)
    expect(json).not.toContain("079 111 11 11")
    expect(json).not.toContain("Coordination Marc")
  })
})

// A shift's meeting point is a whole pair (#191 audit): never its latitude with the event's longitude.
describe("toPublicEvent coordinates", () => {
  const base = {
    id: "e", slug: "fete", title: "Fête", description: null, location: null, startDate: new Date(), endDate: new Date(),
    publicInstructions: null, confirmationMessage: null, requirePhone: false, showSchedule: [], accentColorKey: null,
    organization: { name: "Org", slug: "org", volunteerCharter: null }, pages: [],
  }
  const shift = (lat: number | null, lon: number | null) => ({
    id: "s", roleName: "Bar", label: "Bar", description: null, date: new Date(), startTime: "10:00", endTime: "12:00",
    capacity: 2, status: "open", locationDetails: null, instructions: null, displayOrder: 0, waitlistEnabled: false,
    minAge: null, colorKey: null, latitude: lat, longitude: lon, registrations: [],
  })
  const run = (s: ReturnType<typeof shift>, ev: { latitude: number | null; longitude: number | null }) =>
    toPublicEvent({ ...base, ...ev, shifts: [s] } as unknown as PublicEventRow).shifts[0]

  it("uses the shift's pair, else the event's, never a mix", () => {
    expect(run(shift(46.18, 6.12), { latitude: 47, longitude: 7 })).toMatchObject({ latitude: 46.18, longitude: 6.12 })
    expect(run(shift(null, null), { latitude: 47, longitude: 7 })).toMatchObject({ latitude: 47, longitude: 7 })
    expect(run(shift(46.18, null), { latitude: 47, longitude: 7 })).toMatchObject({ latitude: 47, longitude: 7 })
    expect(run(shift(46.18, null), { latitude: null, longitude: 7 })).toMatchObject({ latitude: null, longitude: null })
  })
})

// The server-rendered event page (#773) receives what the API sends: ISO strings, no Date objects.
describe("publicEventPayload", () => {
  const row = {
    id: "e", slug: "fete", title: "Fête", description: null, location: null,
    startDate: new Date("2030-06-01T00:00:00Z"), endDate: new Date("2030-06-02T00:00:00Z"),
    registrationOpensAt: new Date("2030-05-01T08:00:00Z"), registrationClosesAt: null,
    publicInstructions: null, confirmationMessage: null, requirePhone: false, showSchedule: [],
    dayContactName: "Coordination Marc", dayContactPhone: "079 111 11 11",
    organization: { name: "Org", slug: "org", volunteerCharter: null },
    pages: [],
    shifts: [{
      id: "s1", roleName: "Bar", label: "Bar", description: null, date: new Date("2030-06-01T00:00:00Z"), startTime: "10:00", endTime: "12:00", capacity: 2, status: "open",
      locationDetails: null, contactName: "Léa", contactPhone: "079 000 00 00", instructions: null,
      displayOrder: 0, waitlistEnabled: false, minAge: null, colorKey: null, registrations: [],
    }],
  } as unknown as PublicEventRow

  it("equals the public API's JSON body", () => {
    expect(publicEventPayload(row)).toEqual(JSON.parse(JSON.stringify(toPublicEvent(row))))
  })

  it("carries dates as ISO strings", () => {
    const out = publicEventPayload(row) as { startDate: unknown; registrationOpensAt: unknown; registrationClosesAt: unknown; shifts: { date: unknown }[] }
    expect(out.startDate).toBe("2030-06-01T00:00:00.000Z")
    expect(out.registrationOpensAt).toBe("2030-05-01T08:00:00.000Z")
    expect(out.registrationClosesAt).toBeNull()
    expect(out.shifts[0].date).toBe("2030-06-01T00:00:00.000Z")
  })

  it("keeps the contacts out, as the API does", () => {
    const text = JSON.stringify(publicEventPayload(row))
    expect(text).not.toContain("079 000 00 00")
    expect(text).not.toContain("079 111 11 11")
  })
})
