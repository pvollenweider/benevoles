import { describe, it, expect } from "vitest"
import { inviteTargetsWhere, isInviteTarget } from "../invite-targets"
import { localToday } from "../volunteer-hours"

// « Inviter à un événement » on the members page (#1098).

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe("invite targets", () => {
  it("published events whose last day is today or later", () => {
    expect(isInviteTarget({ publicStatus: "published", endDate: day("2026-10-26") }, "2026-10-26")).toBe(true)
    expect(isInviteTarget({ publicStatus: "published", endDate: day("2026-11-02") }, "2026-10-26")).toBe(true)
    expect(isInviteTarget({ publicStatus: "published", endDate: day("2026-10-25") }, "2026-10-26")).toBe(false)
  })

  it("never a draft or an archived event", () => {
    expect(isInviteTarget({ publicStatus: "draft", endDate: day("2026-11-02") }, "2026-10-26")).toBe(false)
    expect(isInviteTarget({ publicStatus: "archived", endDate: day("2026-11-02") }, "2026-10-26")).toBe(false)
  })

  it("the boundary is the organisation's calendar day, on either side of UTC", () => {
    // 2026-10-26 23:30 UTC: already the 27th in Auckland, still the 26th in Los Angeles.
    const now = new Date("2026-10-26T23:30:00Z")
    const endingOn26 = { publicStatus: "published", endDate: day("2026-10-26") }
    expect(isInviteTarget(endingOn26, localToday(now, "Pacific/Auckland"))).toBe(false)
    expect(isInviteTarget(endingOn26, localToday(now, "America/Los_Angeles"))).toBe(true)
    expect(inviteTargetsWhere(localToday(now, "Europe/Zurich"))).toEqual({ publicStatus: "published", endDate: { gte: day("2026-10-27") } })
  })
})
