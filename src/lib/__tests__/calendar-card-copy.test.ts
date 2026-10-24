import { describe, it, expect } from "vitest"
import { calendarCard } from "../calendar-card-copy"

// When « Mon calendrier » shows on the personal page (#961).
const feed = { https: "https://o.benevol.app/x.ics", webcal: "webcal://o.benevol.app/x.ics" }
const r = (status: string) => ({ status })

describe("calendarCard", () => {
  it("shows with one confirmed shift, without the whole-planning file", () => {
    expect(calendarCard([r("active"), r("waiting")], feed, "/dl")).toEqual({ webcalUrl: feed.webcal, httpsUrl: feed.https, downloadHref: null })
  })

  it("adds the one-off file with several confirmed shifts", () => {
    expect(calendarCard([r("active"), r("active")], feed, "/dl")?.downloadHref).toBe("/dl")
  })

  it("does not show without a confirmed shift (waitlist, offer, request only) or without an address", () => {
    expect(calendarCard([r("waiting"), r("offered"), r("requested")], feed, "/dl")).toBeNull()
    expect(calendarCard([r("active")], null, "/dl")).toBeNull()
    expect(calendarCard([r("active")], undefined, "/dl")).toBeNull()
  })
})
