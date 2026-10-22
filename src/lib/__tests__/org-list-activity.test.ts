import { describe, it, expect } from "vitest"
import { eventActivity, eventActivityLabel, eventActivityRank, ownerActivation, ownerActivationLabel, type EventSpan } from "../org-list-activity"
import { localToday } from "../volunteer-hours"

// Organisations list of the super admin (#1078): event activity and owner activation.

const ev = (startDate: string, endDate = startDate): EventSpan => ({ startDate, endDate })

describe("eventActivity", () => {
  const today = "2026-10-22"

  it("is in progress when today falls within an event's days, first and last day included", () => {
    expect(eventActivity([ev("2026-10-20", "2026-10-24")], today)).toEqual({ kind: "ongoing" })
    expect(eventActivity([ev("2026-10-22", "2026-10-25")], today)).toEqual({ kind: "ongoing" })
    expect(eventActivity([ev("2026-10-18", "2026-10-22")], today)).toEqual({ kind: "ongoing" })
    // An ongoing event wins over an upcoming one.
    expect(eventActivity([ev("2026-12-01"), ev("2026-10-22")], today)).toEqual({ kind: "ongoing" })
  })

  it("gives the soonest upcoming start, even with past events", () => {
    expect(eventActivity([ev("2025-05-01"), ev("2027-01-10"), ev("2026-11-12", "2026-11-13")], today)).toEqual({ kind: "upcoming", startDate: "2026-11-12" })
  })

  it("gives the latest end when every event is over", () => {
    expect(eventActivity([ev("2025-05-01", "2025-05-03"), ev("2026-03-01", "2026-03-04"), ev("2024-09-01")], today)).toEqual({ kind: "past", endDate: "2026-03-04" })
  })

  it("says none without any event", () => {
    expect(eventActivity([], today)).toEqual({ kind: "none" })
  })

  it("takes today in the organisation's zone: just after midnight in Zurich, still the day before in UTC", () => {
    const now = new Date("2026-11-11T23:30:00Z") // 00:30 on 12 November in Zurich
    const events = [ev("2026-11-12")]
    expect(eventActivity(events, localToday(now, "Europe/Zurich"))).toEqual({ kind: "ongoing" })
    expect(eventActivity(events, localToday(now, "UTC"))).toEqual({ kind: "upcoming", startDate: "2026-11-12" })
    // The last day ends at midnight local time, not UTC.
    const later = new Date("2026-11-12T23:30:00Z") // 00:30 on 13 November in Zurich
    expect(eventActivity(events, localToday(later, "Europe/Zurich"))).toEqual({ kind: "past", endDate: "2026-11-12" })
    expect(eventActivity(events, localToday(later, "UTC"))).toEqual({ kind: "ongoing" })
  })
})

describe("eventActivityLabel", () => {
  const today = "2026-10-22"
  it("reads as a short sentence, with the year only when it is not this year's", () => {
    expect(eventActivityLabel({ kind: "ongoing" }, today)).toBe("Événement en cours")
    expect(eventActivityLabel({ kind: "upcoming", startDate: "2026-11-12" }, today)).toBe("Événement à venir le 12 nov.")
    expect(eventActivityLabel({ kind: "upcoming", startDate: "2027-01-10" }, today)).toBe("Événement à venir le 10 janv. 2027")
    expect(eventActivityLabel({ kind: "past", endDate: "2026-03-04" }, today)).toBe("Dernier événement le 4 mars")
    expect(eventActivityLabel({ kind: "past", endDate: "2025-05-03" }, today)).toBe("Dernier événement le 3 mai 2025")
    expect(eventActivityLabel({ kind: "none" }, today)).toBe("Aucun événement")
  })
})

describe("eventActivityRank", () => {
  const today = "2026-10-22"
  it("orders from the most active: in progress, soonest upcoming, most recent past, none", () => {
    const ranks = [
      eventActivityRank({ kind: "none" }, today),
      eventActivityRank({ kind: "past", endDate: "2024-01-01" }, today),
      eventActivityRank({ kind: "upcoming", startDate: "2028-01-01" }, today),
      eventActivityRank({ kind: "past", endDate: "2026-10-21" }, today),
      eventActivityRank({ kind: "upcoming", startDate: "2026-10-23" }, today),
      eventActivityRank({ kind: "ongoing" }, today),
    ]
    expect([...ranks].sort((a, b) => a - b)).toEqual([ranks[5], ranks[4], ranks[2], ranks[3], ranks[1], ranks[0]])
  })
})

describe("ownerActivation", () => {
  const now = new Date("2026-10-22T10:00:00Z")
  const day = 86_400_000
  const valid = new Date(now.getTime() + 3 * day)
  const expired = new Date(now.getTime() - 10 * day)

  it("is active as soon as one owner account is", () => {
    expect(ownerActivation([{ isActive: true, setupTokenExpiresAt: null }], now)).toEqual({ kind: "active" })
    expect(ownerActivation([{ isActive: false, setupTokenExpiresAt: expired }, { isActive: true, setupTokenExpiresAt: null }], now)).toEqual({ kind: "active" })
  })

  it("tells a never-activated owner whose link expired", () => {
    expect(ownerActivation([{ isActive: false, setupTokenExpiresAt: expired }], now)).toEqual({ kind: "expired", expiresAt: expired })
    expect(ownerActivation([{ isActive: false, setupTokenExpiresAt: null }], now)).toEqual({ kind: "expired", expiresAt: null })
  })

  it("prefers a link still valid over an expired one", () => {
    expect(ownerActivation([{ isActive: false, setupTokenExpiresAt: expired }, { isActive: false, setupTokenExpiresAt: valid }], now)).toEqual({ kind: "pending", expiresAt: valid })
  })

  it("says none without any owner account", () => {
    expect(ownerActivation([], now)).toEqual({ kind: "none" })
  })
})

describe("ownerActivationLabel", () => {
  const now = new Date("2026-10-22T10:00:00Z")
  it("says nothing when an owner is active, the expiry date in the organisation's zone otherwise", () => {
    expect(ownerActivationLabel({ kind: "active" }, now, "Europe/Zurich")).toBeNull()
    expect(ownerActivationLabel({ kind: "pending", expiresAt: new Date("2026-10-29T09:00:00Z") }, now, "Europe/Zurich")).toBe("Lien d'activation valable jusqu'au 29 oct.")
    // 23:30 UTC on 2 November is already 3 November in Zurich.
    expect(ownerActivationLabel({ kind: "expired", expiresAt: new Date("2026-11-02T23:30:00Z") }, now, "Europe/Zurich")).toBe("Propriétaire jamais activé (lien expiré le 3 nov.)")
    expect(ownerActivationLabel({ kind: "expired", expiresAt: new Date("2025-12-01T12:00:00Z") }, now, "Europe/Zurich")).toBe("Propriétaire jamais activé (lien expiré le 1 déc. 2025)")
    expect(ownerActivationLabel({ kind: "expired", expiresAt: null }, now, "Europe/Zurich")).toBe("Propriétaire jamais activé")
    expect(ownerActivationLabel({ kind: "none" }, now, "Europe/Zurich")).toBe("Aucun compte propriétaire")
  })
})
