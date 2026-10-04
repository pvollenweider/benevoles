import { describe, it, expect } from "vitest"
import { inviteState, isNoAnswer, inviteStateCounts } from "../invite-state"

describe("inviteState", () => {
  it("registered when there is an active registration, declined or not", () => {
    expect(inviteState({ declinedAt: null, hasActiveRegistration: true })).toBe("registered")
    expect(inviteState({ declinedAt: new Date("2026-01-01"), hasActiveRegistration: true })).toBe("registered")
  })

  it("not_available when declined and no active registration", () => {
    expect(inviteState({ declinedAt: new Date("2026-01-01"), hasActiveRegistration: false })).toBe("not_available")
  })

  it("no_answer when neither registered nor declined", () => {
    expect(inviteState({ declinedAt: null, hasActiveRegistration: false })).toBe("no_answer")
  })

  it("accepts an ISO string for declinedAt", () => {
    expect(inviteState({ declinedAt: "2026-01-01T00:00:00.000Z", hasActiveRegistration: false })).toBe("not_available")
  })
})

describe("isNoAnswer", () => {
  it("matches the « Sans réponse » filter and exclusion rule", () => {
    expect(isNoAnswer({ declinedAt: null, hasActiveRegistration: false })).toBe(true)
    expect(isNoAnswer({ declinedAt: new Date(), hasActiveRegistration: false })).toBe(false)
    expect(isNoAnswer({ declinedAt: null, hasActiveRegistration: true })).toBe(false)
    expect(isNoAnswer({ declinedAt: new Date(), hasActiveRegistration: true })).toBe(false)
  })
})

describe("inviteStateCounts", () => {
  it("counters always add up to the total", () => {
    const invites = [
      { declinedAt: null, hasActiveRegistration: true },
      { declinedAt: new Date(), hasActiveRegistration: false },
      { declinedAt: null, hasActiveRegistration: false },
      { declinedAt: null, hasActiveRegistration: false },
    ]
    expect(inviteStateCounts(invites)).toEqual({ total: 4, registered: 1, notAvailable: 1, noAnswer: 2 })
  })

  it("empty list", () => {
    expect(inviteStateCounts([])).toEqual({ total: 0, registered: 0, notAvailable: 0, noAnswer: 0 })
  })
})
