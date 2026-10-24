import { describe, it, expect } from "vitest"
import { addressCorrected, linksToResend, UPCOMING_GRACE_MS, type RenewedInvite, type RenewedRegistration } from "../member-address-change"

const now = new Date("2031-05-01T12:00:00Z")
const later = new Date("2031-06-01T00:00:00Z")
const past = new Date(now.getTime() - UPCOMING_GRACE_MS - 1)

const reg = (over: Partial<RenewedRegistration>): RenewedRegistration => ({ id: "r", eventId: "e1", status: "active", createdAt: new Date("2031-01-01"), eventEndDate: later, ...over })
const inv = (over: Partial<RenewedInvite>): RenewedInvite => ({ id: "i", eventId: "e2", usedAt: null, declinedAt: null, eventEndDate: later, ...over })

describe("addressCorrected: when a member's links are renewed", () => {
  it("a saved address replaced by another one, or removed", () => {
    expect(addressCorrected("typo@x.ch", "right@x.ch")).toBe(true)
    expect(addressCorrected("typo@x.ch", null)).toBe(true)
    expect(addressCorrected("typo@x.ch", "")).toBe(true)
  })

  it("not the same address in another case or with spaces, and not a first address", () => {
    expect(addressCorrected("Alix@X.ch ", "alix@x.ch")).toBe(false)
    expect(addressCorrected(null, "first@x.ch")).toBe(false)
    expect(addressCorrected("", "first@x.ch")).toBe(false)
    expect(addressCorrected(null, null)).toBe(false)
  })
})

describe("linksToResend: what the new address receives", () => {
  it("one personal link per upcoming event, the newest live registration's", () => {
    const plan = linksToResend({
      newEmail: "right@x.ch", active: true,
      registrations: [
        reg({ id: "old", createdAt: new Date("2031-01-01") }),
        reg({ id: "new", createdAt: new Date("2031-02-01") }),
        reg({ id: "cancelled", status: "cancelled", eventId: "e3" }),
        reg({ id: "past", eventId: "e4", eventEndDate: past }),
        reg({ id: "waiting", status: "waiting", eventId: "e5" }),
      ],
      invites: [],
    }, now)
    expect(plan.registrationIds.sort()).toEqual(["new", "waiting"])
  })

  it("every unanswered invitation of an upcoming event where the member holds no place", () => {
    const plan = linksToResend({
      newEmail: "right@x.ch", active: true,
      registrations: [reg({ id: "r1", eventId: "e1" })],
      invites: [
        inv({ id: "open", eventId: "e2" }),
        inv({ id: "covered", eventId: "e1" }),
        inv({ id: "used", eventId: "e3", usedAt: now }),
        inv({ id: "declined", eventId: "e4", declinedAt: now }),
        inv({ id: "past", eventId: "e5", eventEndDate: past }),
      ],
    }, now)
    expect(plan.inviteIds).toEqual(["open"])
  })

  it("nothing without a new address; no invitation for a deactivated member", () => {
    const input = { registrations: [reg({ id: "r1" })], invites: [inv({ id: "i1" })] }
    expect(linksToResend({ ...input, newEmail: null, active: true }, now)).toEqual({ registrationIds: [], inviteIds: [] })
    expect(linksToResend({ ...input, newEmail: "  ", active: true }, now)).toEqual({ registrationIds: [], inviteIds: [] })
    expect(linksToResend({ ...input, newEmail: "right@x.ch", active: false }, now)).toEqual({ registrationIds: ["r1"], inviteIds: [] })
  })
})
