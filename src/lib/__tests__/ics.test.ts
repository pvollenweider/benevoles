import { describe, it, expect } from "vitest"
import { FEED_UPDATE_NOTE, buildIcs, icsEscape, icsFold, shiftInstants, type IcsShift } from "../ics"

// « Ajouter à mon calendrier » (#480).
const TZ = "Europe/Zurich"
const shift = (over: Partial<IcsShift> = {}): IcsShift => ({
  registrationId: "reg-1", eventTitle: "Fête", roleName: "Bar", label: "Bar soir",
  date: "2026-07-04", startTime: "18:00", endTime: "23:00", url: "https://org.benevol.app/my/tok", ...over,
})
const unfold = (ics: string) => ics.replace(/\r\n /g, "")

describe("icsEscape and icsFold", () => {
  it("escapes RFC 5545 text", () => {
    expect(icsEscape("a, b; c\\d\nligne")).toBe("a\\, b\\; c\\\\d\\nligne")
    // Regression (CodeQL js/identity-replacement): "\;" in a JS string is ";", so semicolons were left bare.
    expect(icsEscape("Parking; entrée nord")).toBe("Parking\\; entrée nord")
  })

  it("folds at 75 octets without cutting a multi-byte character", () => {
    const line = "DESCRIPTION:" + "é".repeat(80)
    const folded = icsFold(line)
    for (const part of folded.split("\r\n")) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
    expect(folded.replace(/\r\n /g, "")).toBe(line)
  })
})

describe("shiftInstants", () => {
  it("uses real instants in the organisation's zone, in summer and winter", () => {
    expect(shiftInstants(shift(), TZ).start.toISOString()).toBe("2026-07-04T16:00:00.000Z")
    expect(shiftInstants(shift({ date: "2026-12-05" }), TZ).start.toISOString()).toBe("2026-12-05T17:00:00.000Z")
  })

  it("ends the next day past midnight, and handles the DST night", () => {
    expect(shiftInstants(shift({ startTime: "22:00", endTime: "02:00" }), TZ).end.toISOString()).toBe("2026-07-05T00:00:00.000Z")
    const dst = shiftInstants(shift({ date: "2026-10-25", startTime: "00:00", endTime: "06:30" }), TZ)
    expect((dst.end.getTime() - dst.start.getTime()) / 3_600_000).toBe(7.5)
  })
})

describe("buildIcs", () => {
  const now = new Date("2026-06-01T10:00:00Z")
  it("writes one VEVENT per shift, UTC times, stable UID, escaped text, CRLF", () => {
    const ics = buildIcs([shift({ location: "Salle, 1er étage", details: ["Contact : Léa; 079 1"], latitude: 46.2, longitude: 6.1 })], { timeZone: TZ, now, host: "org.benevol.app" })
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true)
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true)
    const flat = unfold(ics)
    expect(flat).toContain("UID:reg-1@org.benevol.app")
    expect(flat).toContain("DTSTART:20260704T160000Z")
    expect(flat).toContain("DTEND:20260704T210000Z")
    expect(flat).toContain("DTSTAMP:20260601T100000Z")
    expect(flat).toContain("SUMMARY:Fête — Bar · Bar soir")
    expect(flat).toContain("LOCATION:Salle\\, 1er étage")
    expect(flat).toContain("GEO:46.200000;6.100000")
    expect(flat).toContain("Contact : Léa\\; 079 1")
    expect(flat).toContain("URL:https://org.benevol.app/my/tok")
    expect(ics.split("BEGIN:VEVENT")).toHaveLength(2)
  })

  it("keeps the same UIDs across two exports", () => {
    const a = buildIcs([shift(), shift({ registrationId: "reg-2" })], { timeZone: TZ, now })
    const b = buildIcs([shift(), shift({ registrationId: "reg-2" })], { timeZone: TZ, now: new Date() })
    const uids = (s: string) => unfold(s).match(/^UID:.*$/gm)
    expect(uids(a)).toEqual(uids(b))
  })

  it("writes the entry's SEQUENCE and LAST-MODIFIED, 0 without them, and a confirmed status", () => {
    const flat = unfold(buildIcs([shift({ sequence: 42, lastModified: new Date("2026-05-02T08:00:00Z") }), shift({ registrationId: "reg-2" })], { timeZone: TZ, now }))
    expect(flat).toContain("SEQUENCE:42")
    expect(flat).toContain("LAST-MODIFIED:20260502T080000Z")
    expect(flat).toContain("SEQUENCE:0")
    expect(flat.match(/^STATUS:CONFIRMED$/gm)).toHaveLength(2)
  })

  it("keeps the one-off file as it was: METHOD:PUBLISH, fetch-time DTSTAMP, personal link, download advice", () => {
    const flat = unfold(buildIcs([shift({ lastModified: new Date("2026-05-02T08:00:00Z") })], { timeZone: TZ, now }))
    expect(flat).toContain("METHOD:PUBLISH")
    expect(flat).toContain("DTSTAMP:20260601T100000Z")
    expect(flat).toContain("téléchargez à nouveau le fichier")
    expect(flat).toContain("Mes inscriptions : https://org.benevol.app/my/tok")
    expect(flat).not.toContain("REFRESH-INTERVAL")
  })
})

describe("buildIcs as a subscription feed (#961)", () => {
  const now = new Date("2026-06-01T10:00:00Z")
  const feed = { calendarName: "Fête, été", refreshHours: 6 }
  const entry = shift({ url: "https://org.benevol.app/fete", sequence: 7, lastModified: new Date("2026-05-02T08:00:00Z") })

  it("is named, gives a refresh hint and no METHOD", () => {
    const flat = unfold(buildIcs([entry], { timeZone: TZ, now, feed }))
    expect(flat).toContain("X-WR-CALNAME:Fête\\, été")
    expect(flat).toContain("NAME:Fête\\, été")
    expect(flat).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT6H")
    expect(flat).toContain("X-PUBLISHED-TTL:PT6H")
    expect(flat).not.toContain("METHOD:")
  })

  it("dates each entry at its last change, so that a fetch without change gives the same entries", () => {
    const a = buildIcs([entry], { timeZone: TZ, now, feed })
    const b = buildIcs([entry], { timeZone: TZ, now: new Date("2026-06-02T10:00:00Z"), feed })
    expect(a).toBe(b)
    expect(unfold(a)).toContain("DTSTAMP:20260502T080000Z")
  })

  it("never carries the download advice nor a personal link, and says it updates itself", () => {
    const flat = unfold(buildIcs([entry], { timeZone: TZ, now, feed }))
    expect(flat).not.toContain("/my/")
    expect(flat).not.toContain("Mes inscriptions")
    expect(flat).not.toContain("téléchargez")
    expect(flat).toContain(icsEscape(FEED_UPDATE_NOTE))
    expect(flat).toContain("URL:https://org.benevol.app/fete")
  })

  it("is a valid empty calendar when no shift is confirmed any more", () => {
    const ics = buildIcs([], { timeZone: TZ, now, feed })
    expect(ics).not.toContain("BEGIN:VEVENT")
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true)
  })
})
