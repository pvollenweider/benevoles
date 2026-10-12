import { describe, it, expect } from "vitest"
import { waitlistOfferExpiry, WAITLIST_OFFER_MIN_LEAD_MS } from "../waitlist-offer"

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
