import { describe, it, expect } from "vitest"
import { waitlistOfferExpiry, waitlistOfferPageState, WAITLIST_OFFER_MIN_LEAD_MS } from "../waitlist-offer"

// The answer window of a spot offered from the waitlist (#946): 24 hours, never past the shift's
// start, and no offer at all within the hour before it.

const at = (iso: string) => new Date(iso)
const start = at("2026-07-04T08:00:00Z")

describe("waitlistOfferExpiry", () => {
  it("gives 24 hours when the shift is further away", () => {
    expect(waitlistOfferExpiry(at("2026-07-01T08:00:00Z"), start)).toEqual(at("2026-07-02T08:00:00Z"))
    expect(waitlistOfferExpiry(at("2026-07-03T08:00:00Z"), start)).toEqual(start)
  })

  it("caps the window at the shift's start", () => {
    expect(waitlistOfferExpiry(at("2026-07-03T20:00:00Z"), start)).toEqual(start)
    expect(waitlistOfferExpiry(at("2026-07-04T07:00:00Z"), start)).toEqual(start)
  })

  it("offers nothing within the hour before the start, nor after it", () => {
    expect(WAITLIST_OFFER_MIN_LEAD_MS).toBe(60 * 60 * 1000)
    expect(waitlistOfferExpiry(at("2026-07-04T07:00:01Z"), start)).toBeNull()
    expect(waitlistOfferExpiry(at("2026-07-04T08:00:00Z"), start)).toBeNull()
    expect(waitlistOfferExpiry(at("2026-07-04T09:00:00Z"), start)).toBeNull()
  })
})

// The offer page is read-only on load (#1044): its state comes from the registration, the button
// alone accepts.
describe("waitlistOfferPageState", () => {
  const now = at("2026-07-03T10:00:00Z")
  it("shows the button while the offer stands", () => {
    expect(waitlistOfferPageState({ status: "offered", waitingExpiresAt: at("2026-07-03T12:00:00Z") }, now)).toBe("offered")
    expect(waitlistOfferPageState({ status: "offered", waitingExpiresAt: null }, now)).toBe("offered")
    // Same boundary as the confirm route: expired strictly before now.
    expect(waitlistOfferPageState({ status: "offered", waitingExpiresAt: now }, now)).toBe("offered")
  })

  it("says the offer expired when its time is up before the cron withdrew it", () => {
    expect(waitlistOfferPageState({ status: "offered", waitingExpiresAt: at("2026-07-03T09:59:59Z") }, now)).toBe("expired")
  })

  it("says an accepted offer is already accepted", () => {
    expect(waitlistOfferPageState({ status: "active", waitingExpiresAt: null }, now)).toBe("active")
    expect(waitlistOfferPageState({ status: "requested", waitingExpiresAt: null }, now)).toBe("requested")
  })

  it("treats an unknown link or a withdrawn offer as invalid", () => {
    expect(waitlistOfferPageState(null, now)).toBe("invalid")
    expect(waitlistOfferPageState({ status: "cancelled", waitingExpiresAt: null }, now)).toBe("invalid")
    expect(waitlistOfferPageState({ status: "waiting", waitingExpiresAt: null }, now)).toBe("invalid")
  })

  it("shows nothing of the offer while the organisation is closed", () => {
    expect(waitlistOfferPageState({ status: "offered", waitingExpiresAt: null }, now, false)).toBe("unavailable")
    expect(waitlistOfferPageState({ status: "active", waitingExpiresAt: null }, now, false)).toBe("unavailable")
    // An unknown link stays an unknown link.
    expect(waitlistOfferPageState(null, now, false)).toBe("invalid")
  })
})
