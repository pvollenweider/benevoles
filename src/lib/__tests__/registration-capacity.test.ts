import { describe, it, expect } from "vitest"
import { planPlacement, canOfferSpot, isUniqueViolation } from "../registration-capacity"

describe("planPlacement (#264)", () => {
  it("places as active while spots remain", () => {
    expect(planPlacement({ capacity: 3, occupied: 2, waitlistEnabled: false, maxWaitingPosition: null })).toEqual({ status: "active" })
  })

  it("refuses the request once the shift is full and has no waitlist", () => {
    expect(planPlacement({ capacity: 3, occupied: 3, waitlistEnabled: false, maxWaitingPosition: null })).toEqual({ status: "full" })
  })

  it("waitlists at position 1 on an empty waitlist", () => {
    expect(planPlacement({ capacity: 3, occupied: 3, waitlistEnabled: true, maxWaitingPosition: null })).toEqual({ status: "waiting", waitingPosition: 1 })
  })

  it("waitlists after the current last position", () => {
    expect(planPlacement({ capacity: 3, occupied: 3, waitlistEnabled: true, maxWaitingPosition: 4 })).toEqual({ status: "waiting", waitingPosition: 5 })
  })

  it("treats an over-capacity shift (admin overbooking) as full", () => {
    expect(planPlacement({ capacity: 3, occupied: 5, waitlistEnabled: false, maxWaitingPosition: null })).toEqual({ status: "full" })
  })
})

describe("canOfferSpot (#264)", () => {
  it("offers when a spot is actually free", () => {
    expect(canOfferSpot({ capacity: 2, occupied: 1, shiftStatus: "open" })).toBe(true)
  })

  it("doesn't offer when the cancellation didn't free a spot (still at capacity)", () => {
    expect(canOfferSpot({ capacity: 2, occupied: 2, shiftStatus: "full" })).toBe(false)
  })

  it("doesn't offer on a cancelled shift", () => {
    expect(canOfferSpot({ capacity: 2, occupied: 0, shiftStatus: "cancelled" })).toBe(false)
  })
})

describe("isUniqueViolation", () => {
  it("recognizes Prisma's P2002", () => {
    expect(isUniqueViolation({ code: "P2002" })).toBe(true)
    expect(isUniqueViolation({ code: "P2025" })).toBe(false)
    expect(isUniqueViolation(new Error("x"))).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
  })
})
