import { describe, it, expect } from "vitest"
import {
  calendarFeedKey,
  calendarFeedKeyFromEnv,
  calendarFeedLinkValid,
  calendarFeedToken,
  calendarFeedUrls,
  icsRevision,
  icsShiftsFor,
  icsShiftsForOrg,
  orgCalendarFeedLinkValid,
  orgCalendarFeedToken,
  orgCalendarFeedUrls,
  parseCalendarFeedToken,
  parseOrgCalendarFeedToken,
} from "../calendar-feed"
import { buildIcs } from "../ics"

// Calendar subscription (#961): a read-only token derived from the personal link.
const key = calendarFeedKey("a".repeat(40))
const otherKey = calendarFeedKey("b".repeat(40))
const REG = "cmabc123def456ghi789"
const HASH = "f".repeat(64)

describe("calendar feed token", () => {
  it("round-trips: the app's token names its registration and matches the current link", () => {
    const token = calendarFeedToken(REG, HASH, key)
    expect(token).toMatch(new RegExp(`^${REG}-1[0-9a-f]{48}$`))
    const parsed = parseCalendarFeedToken(token, key)
    expect(parsed?.registrationId).toBe(REG)
    expect(calendarFeedLinkValid(parsed!, HASH, key)).toBe(true)
    // Calendar apps may keep the .ics suffix on the segment.
    expect(parseCalendarFeedToken(`${token}.ics`, key)?.registrationId).toBe(REG)
  })

  it("is stable for the same link and never contains the link's hash", () => {
    expect(calendarFeedToken(REG, HASH, key)).toBe(calendarFeedToken(REG, HASH, key))
    expect(calendarFeedToken(REG, HASH, key)).not.toContain(HASH.slice(0, 16))
  })

  it("is revoked with the personal link: a new editTokenHash no longer matches, but the id proof still holds", () => {
    const parsed = parseCalendarFeedToken(calendarFeedToken(REG, HASH, key), key)!
    expect(parsed).not.toBeNull()
    expect(calendarFeedLinkValid(parsed, "0".repeat(64), key)).toBe(false)
  })

  it("refuses what the app never made: another key, another id, a personal token, garbage", () => {
    const token = calendarFeedToken(REG, HASH, key)
    expect(parseCalendarFeedToken(token, otherKey)).toBeNull()
    expect(parseCalendarFeedToken(token.replace(REG, "cmabc123def456ghi780"), key)).toBeNull()
    expect(parseCalendarFeedToken("Xk3vR9qLw2", key)).toBeNull()
    expect(parseCalendarFeedToken("", key)).toBeNull()
    expect(parseCalendarFeedToken(`${REG}-2${"0".repeat(48)}`, key)).toBeNull()
  })

  it("a changed link proof still parses (revoked, not a miss) when the id proof is right", () => {
    const token = calendarFeedToken(REG, HASH, key)
    const tampered = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0")
    const parsed = parseCalendarFeedToken(tampered, key)
    expect(parsed).not.toBeNull()
    expect(calendarFeedLinkValid(parsed!, HASH, key)).toBe(false)
  })

  it("reads its key from AUTH_SECRET, none without one", () => {
    expect(calendarFeedKeyFromEnv({ AUTH_SECRET: "a".repeat(40) })?.equals(key)).toBe(true)
    expect(calendarFeedKeyFromEnv({})).toBeNull()
    expect(calendarFeedKeyFromEnv({ AUTH_SECRET: "short" })).toBeNull()
    // The derived key is not the secret itself.
    expect(key.toString("utf8")).not.toContain("a".repeat(32))
  })
})

describe("calendarFeedUrls", () => {
  it("gives the https and webcal forms of the same address", () => {
    expect(calendarFeedUrls("https://org.benevol.app", "tok")).toEqual({
      https: "https://org.benevol.app/api/public/registrations/tok/calendar.ics",
      webcal: "webcal://org.benevol.app/api/public/registrations/tok/calendar.ics",
    })
    expect(calendarFeedUrls("http://localhost:3000/", "tok").webcal).toBe("webcal://localhost:3000/api/public/registrations/tok/calendar.ics")
  })
})

describe("organisation calendar feed token (#1429, lot C)", () => {
  it("round-trips and is tied to the organisation link's current hash", () => {
    const token = orgCalendarFeedToken(REG, HASH, key)
    expect(token).toMatch(new RegExp(`^${REG}-1[0-9a-f]{48}$`))
    const parsed = parseOrgCalendarFeedToken(token, key)
    expect(parsed?.volunteerId).toBe(REG)
    expect(orgCalendarFeedLinkValid(parsed!, HASH, key)).toBe(true)
    // Calendar apps may keep the .ics suffix on the segment.
    expect(parseOrgCalendarFeedToken(`${token}.ics`, key)?.volunteerId).toBe(REG)
  })

  it("is revoked with the organisation link: a renewed hash no longer matches, a cleared one either", () => {
    const parsed = parseOrgCalendarFeedToken(orgCalendarFeedToken(REG, HASH, key), key)!
    expect(orgCalendarFeedLinkValid(parsed, "0".repeat(64), key)).toBe(false)
    expect(orgCalendarFeedLinkValid(parsed, null, key)).toBe(false)
  })

  it("never accepts a per-registration feed token, nor the reverse", () => {
    const registrationToken = calendarFeedToken(REG, HASH, key)
    expect(parseOrgCalendarFeedToken(registrationToken, key)).toBeNull()
    const orgToken = orgCalendarFeedToken(REG, HASH, key)
    expect(parseCalendarFeedToken(orgToken, key)).toBeNull()
    expect(parseOrgCalendarFeedToken(orgToken, otherKey)).toBeNull()
  })

  it("gives the https, webcal and one-off file forms of the same address", () => {
    expect(orgCalendarFeedUrls("https://org.benevol.app", "tok")).toEqual({
      https: "https://org.benevol.app/api/public/mes-inscriptions/tok/calendar.ics",
      webcal: "webcal://org.benevol.app/api/public/mes-inscriptions/tok/calendar.ics",
      download: "https://org.benevol.app/api/public/mes-inscriptions/tok/calendar.ics?download=1",
    })
  })
})

describe("icsShiftsForOrg (#1429, lot C)", () => {
  const orgUpdatedAt = new Date("2026-01-01T00:00:00Z")
  const event = (id: string, title: string, updatedAt: string) => ({
    id,
    title,
    slug: id,
    publicStatus: "published",
    location: "Salle",
    latitude: 46.2,
    longitude: 6.1,
    updatedAt: new Date(updatedAt),
  })
  const shift = (over: object = {}) => ({
    roleName: "Bar",
    label: "Bar soir",
    date: new Date("2026-07-04T00:00:00Z"),
    startTime: "18:00",
    endTime: "23:00",
    locationDetails: null,
    contactName: null,
    contactPhone: null,
    instructions: null,
    latitude: null,
    longitude: null,
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    ...over,
  })

  it("keeps the UID and SEQUENCE of the per-registration feed for the same shift", () => {
    const e = event("e1", "Fête", "2026-05-01T00:00:00Z")
    const s = shift()
    const registration = { id: "r1", updatedAt: new Date("2026-04-01T00:00:00Z"), shift: s }
    const perEvent = buildIcs(icsShiftsFor([registration], e, { url: "https://x/fete", orgUpdatedAt }), {
      timeZone: "Europe/Zurich",
      host: "org.benevol.app",
    })
    const orgWide = buildIcs(icsShiftsForOrg([{ ...registration, event: e }], { urlFor: () => "https://x/fete", orgUpdatedAt }), {
      timeZone: "Europe/Zurich",
      host: "org.benevol.app",
    })
    const entry = (ics: string) => {
      const block = ics.split("BEGIN:VEVENT")[1].split("END:VEVENT")[0]
      return { uid: block.match(/UID:([^\r\n]+)/)![1], sequence: block.match(/SEQUENCE:(\d+)/)![1] }
    }
    expect(entry(orgWide)).toEqual(entry(perEvent))
  })

  it("maps each registration with its own event, across several events", () => {
    const fete = event("e1", "Fête", "2026-05-01T00:00:00Z")
    const cafe = event("e2", "Café", "2026-05-02T00:00:00Z")
    const entries = icsShiftsForOrg(
      [
        { id: "r1", shift: shift(), event: fete },
        { id: "r2", shift: shift({ date: new Date("2026-07-11T00:00:00Z") }), event: cafe },
      ],
      { urlFor: (e) => `https://x/${e.slug}`, orgUpdatedAt },
    )
    expect(entries.map((e) => [e.registrationId, e.eventTitle, e.url])).toEqual([
      ["r1", "Fête", "https://x/e1"],
      ["r2", "Café", "https://x/e2"],
    ])
  })
})

describe("icsRevision", () => {
  it("grows with the latest change among the parts, in whole seconds since 2025", () => {
    const a = icsRevision([new Date("2026-01-01T00:00:00Z"), null, undefined])
    const b = icsRevision([new Date("2026-01-01T00:00:00Z"), new Date("2026-03-01T12:00:00.900Z")])
    expect(a.sequence).toBe((Date.UTC(2026, 0, 1) - Date.UTC(2025, 0, 1)) / 1000)
    expect(b.sequence).toBeGreaterThan(a.sequence)
    expect(b.lastModified.toISOString()).toBe("2026-03-01T12:00:00.000Z")
    // Fits a signed 32-bit integer for decades.
    expect(icsRevision([new Date("2090-01-01T00:00:00Z")]).sequence).toBeLessThan(2 ** 31)
  })

  it("is 0 without any date", () => {
    expect(icsRevision([]).sequence).toBe(0)
  })
})

describe("icsShiftsFor", () => {
  const event = { title: "Fête", location: "Salle", latitude: 46.2, longitude: 6.1, updatedAt: new Date("2026-05-01T00:00:00Z") }
  const shift = {
    roleName: "Bar", label: "Bar soir", date: new Date("2026-07-04T00:00:00Z"), startTime: "18:00", endTime: "23:00",
    locationDetails: null, contactName: "Léa", contactPhone: null, instructions: null, latitude: null, longitude: null,
    updatedAt: new Date("2026-06-01T00:00:00Z"),
  }

  it("maps a registration to its entry, the shift's place first, the event's coordinates otherwise", () => {
    const [e] = icsShiftsFor([{ id: "r1", updatedAt: new Date("2026-04-01T00:00:00Z"), shift }], event, { url: "https://x/ev" })
    expect(e).toMatchObject({ registrationId: "r1", eventTitle: "Fête", roleName: "Bar", label: "Bar soir", location: "Salle", latitude: 46.2, longitude: 6.1, url: "https://x/ev" })
    expect(e.details?.some((l) => l.includes("Léa"))).toBe(true)
    // The shift changed last: its time is the entry's revision.
    expect(e.lastModified?.toISOString()).toBe("2026-06-01T00:00:00.000Z")
  })

  it("raises the revision when the shift is moved later", () => {
    const before = icsShiftsFor([{ id: "r1", shift }], event, { url: "u" })[0].sequence!
    const after = icsShiftsFor([{ id: "r1", shift: { ...shift, startTime: "19:00", updatedAt: new Date("2026-06-02T00:00:00Z") } }], event, { url: "u" })[0].sequence!
    expect(after).toBeGreaterThan(before)
  })

  it("counts a change of the organisation (its time zone) too", () => {
    const later = icsShiftsFor([{ id: "r1", shift }], event, { url: "u", orgUpdatedAt: new Date("2026-08-01T00:00:00Z") })[0]
    expect(later.lastModified?.toISOString()).toBe("2026-08-01T00:00:00.000Z")
  })
})
