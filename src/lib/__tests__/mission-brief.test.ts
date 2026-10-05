import { describe, it, expect } from "vitest"
import { missionBrief, nextConfirmedRegistration, orgContactHref, type BriefShift } from "../mission-brief"

// « Avant ta mission » (#560): the shift's info first, the event's fills the gaps.
const shift = (over: Partial<BriefShift> = {}): BriefShift => ({ label: "Bar", date: "2031-06-06T00:00:00.000Z", startTime: "10:00", endTime: "12:00", ...over })
const event = {
  location: "Salle communale", latitude: 46.2, longitude: 6.1, publicInstructions: "Entrée par la cour",
  pages: [{ title: "Accès", url: "https://org.example/fete/acces" }],
}
const OSM = (lat: number, lon: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`

describe("missionBrief", () => {
  it("with only event-level info: the event's place, map link, instructions and pages", () => {
    expect(missionBrief(shift(), event)).toEqual({
      place: { text: "Salle communale", href: OSM(46.2, 6.1) },
      contact: null,
      leaders: [],
      instructions: "Entrée par la cour",
      pages: event.pages,
    })
  })

  it("with shift info too, the shift's take precedence", () => {
    const brief = missionBrief(shift({ locationDetails: "Entrée B", latitude: 46.18, longitude: 6.12, instructions: "Gilet fourni", contactName: "Léa", contactPhone: "079 000 00 00", dayContactName: "Coordination" }), event)
    expect(brief.place).toEqual({ text: "Entrée B", href: OSM(46.18, 6.12) })
    expect(brief.instructions).toBe("Gilet fourni")
    expect(brief.contact).toMatchObject({ kind: "shift", label: "Contact pour ce créneau", name: "Léa", phone: "079 000 00 00" })
  })

  it("the sector leaders' names, blanks dropped", () => {
    expect(missionBrief(shift({ sectorLeaderNames: [" Paul Martin ", " "] }), {}).leaders).toEqual(["Paul Martin"])
  })

  it("the day-of contact for a shift without a contact", () => {
    expect(missionBrief(shift({ dayContactName: "Coordination", dayContactPhone: "079 111 11 11" }), event).contact)
      .toEqual({ kind: "day", label: "Contact le jour J", name: "Coordination", phone: "079 111 11 11" })
  })

  it("renders with partial data: nothing invented", () => {
    expect(missionBrief(shift(), {})).toEqual({ place: null, contact: null, leaders: [], instructions: null, pages: [] })
    // Coordinates without a place name: a meeting point.
    expect(missionBrief(shift({ latitude: 46.18, longitude: 6.12 }), {}).place).toEqual({ text: "Point de rendez-vous", href: OSM(46.18, 6.12) })
    // A place name without coordinates: no map link.
    expect(missionBrief(shift(), { location: "Salle" }).place).toEqual({ text: "Salle", href: null })
    // Blank values count as missing; a page without a title is skipped.
    expect(missionBrief(shift({ locationDetails: " ", instructions: "  " }), { location: " ", publicInstructions: " ", pages: [{ title: " ", url: "https://x" }] }))
      .toEqual({ place: null, contact: null, leaders: [], instructions: null, pages: [] })
  })
})

describe("nextConfirmedRegistration", () => {
  const TZ = "Europe/Zurich"
  const reg = (id: string, status: string, date: string, startTime: string, endTime: string) => ({ id, status, shift: shift({ date: `${date}T00:00:00.000Z`, startTime, endTime }) })
  // 6 June 2031, 11:00 in Zurich (UTC+2).
  const now = new Date("2031-06-06T09:00:00Z")

  it("takes the earliest confirmed shift not over yet, one in progress included", () => {
    const regs = [reg("later", "active", "2031-06-07", "10:00", "12:00"), reg("now", "active", "2031-06-06", "10:00", "12:00"), reg("past", "active", "2031-06-05", "10:00", "12:00")]
    expect(nextConfirmedRegistration(regs, now, TZ)?.id).toBe("now")
  })

  it("never a waitlist, offered or requested registration", () => {
    const regs = [reg("w", "waiting", "2031-06-06", "14:00", "16:00"), reg("o", "offered", "2031-06-06", "14:00", "16:00"), reg("q", "requested", "2031-06-06", "14:00", "16:00"), reg("a", "active", "2031-06-08", "10:00", "12:00")]
    expect(nextConfirmedRegistration(regs, now, TZ)?.id).toBe("a")
  })

  it("keeps an overnight shift until its end the next morning", () => {
    const night = reg("night", "active", "2031-06-05", "22:00", "02:00")
    expect(nextConfirmedRegistration([night], new Date("2031-06-05T23:30:00Z"), TZ)?.id).toBe("night") // 01:30 local
    expect(nextConfirmedRegistration([night], new Date("2031-06-06T00:30:00Z"), TZ)).toBeNull() // 02:30 local
  })

  it("is null when every confirmed shift is over or there is none", () => {
    expect(nextConfirmedRegistration([reg("past", "active", "2031-06-05", "10:00", "12:00")], now, TZ)).toBeNull()
    expect(nextConfirmedRegistration([], now, TZ)).toBeNull()
  })
})

describe("orgContactHref", () => {
  it("names the event in the subject, encoded", () => {
    expect(orgContactHref("orga@example.org", "Fête & co")).toBe("mailto:orga@example.org?subject=Question%20sur%20mon%20inscription%20%3A%20F%C3%AAte%20%26%20co")
  })
})
