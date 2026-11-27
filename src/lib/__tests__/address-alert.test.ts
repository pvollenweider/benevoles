// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { ADDRESS_ALERT_MAX_LOOKBACK_HOURS, ADDRESS_ALERT_WINDOW_HOURS, addressAlertDedupeKey, addressAlertSubject, alertWhenText, alertWindowStart, nextShiftSoon, refusalsText, type AlertOutcome, type AlertShift } from "../address-alert"

const now = new Date("2026-11-27T09:15:00Z")
const shift = (startsAt: string, roleName = "Stand de vente"): AlertShift => ({ startsAt: new Date(startsAt), endsAt: new Date(new Date(startsAt).getTime() + 2 * 3600_000), roleName, label: null, eventTitle: "Marché de Noël" })

describe("nextShiftSoon", () => {
  it("is the earliest confirmed shift that starts within the window", () => {
    const soon = nextShiftSoon([shift("2026-11-28T13:00:00Z", "Demain"), shift("2026-11-27T13:00:00Z", "Aujourd'hui")], now)
    expect(soon?.roleName).toBe("Aujourd'hui")
  })
  it("ignores a shift already started and one beyond the window", () => {
    expect(nextShiftSoon([shift("2026-11-27T09:00:00Z")], now)).toBeNull()
    const beyond = new Date(now.getTime() + (ADDRESS_ALERT_WINDOW_HOURS + 1) * 3600_000).toISOString()
    expect(nextShiftSoon([shift(beyond)], now)).toBeNull()
  })
  it("includes a shift exactly at the end of the window", () => {
    const edge = new Date(now.getTime() + ADDRESS_ALERT_WINDOW_HOURS * 3600_000).toISOString()
    expect(nextShiftSoon([shift(edge)], now)).not.toBeNull()
  })
})

describe("alertWindowStart", () => {
  it("starts where the previous run started, so windows follow each other", () => {
    const previous = new Date("2026-11-27T09:00:00Z")
    expect(alertWindowStart(previous, now)).toEqual(previous)
  })
  it("looks 30 minutes back on a first run", () => {
    expect(alertWindowStart(null, now)).toEqual(new Date("2026-11-27T08:45:00Z"))
  })
  it("catches up after a gap, but no further than the maximum lookback", () => {
    const longAgo = new Date("2026-11-26T09:00:00Z")
    expect(alertWindowStart(longAgo, now)).toEqual(new Date(now.getTime() - ADDRESS_ALERT_MAX_LOOKBACK_HOURS * 3600_000))
    expect(alertWindowStart(new Date("2026-11-27T05:00:00Z"), now)).toEqual(new Date("2026-11-27T05:00:00Z"))
  })
  it("never starts in the future when the clock moved", () => {
    expect(alertWindowStart(new Date("2026-11-27T10:00:00Z"), now)).toEqual(now)
  })
})

describe("refusalsText", () => {
  const o = (outcome: string, kind: string, createdAt: string): AlertOutcome => ({ outcome, kind, createdAt: new Date(createdAt) })

  // The case that started #1476: a confirmation that bounced, then reminders that bounce too.
  it("counts the refusals on record and says since when, naming the confirmation", () => {
    expect(refusalsText([
      o("accepted_by_relay", "registration_confirmation", "2026-11-09T18:42:01Z"),
      o("rejected_permanent", "registration_confirmation", "2026-11-19T10:49:37Z"),
      o("accepted_by_relay", "reminder_j1", "2026-11-26T12:00:28Z"),
      o("rejected_permanent", "reminder_j1", "2026-11-26T15:15:04Z"),
      o("rejected_permanent", "reminder_dd", "2026-11-27T09:15:00Z"),
    ], "Europe/Zurich")).toBe("Son adresse a refusé 3 emails depuis le 19 novembre, dont la confirmation d'inscription.")
  })
  it("does not name the confirmation when only reminders were refused", () => {
    expect(refusalsText([o("rejected_permanent", "reminder_j2", "2026-11-25T15:00:00Z"), o("rejected_permanent", "reminder_j1", "2026-11-26T15:00:00Z")], "Europe/Zurich"))
      .toBe("Son adresse a refusé 2 emails depuis le 25 novembre.")
  })
  it("says nothing for a single refusal, and never claims that no email ever arrived", () => {
    expect(refusalsText([o("accepted_by_relay", "registration_confirmation", "2026-11-09T18:42:01Z"), o("rejected_permanent", "reminder_dd", "2026-11-27T09:15:00Z")], "Europe/Zurich")).toBeNull()
    expect(refusalsText([], "Europe/Zurich")).toBeNull()
  })
})

describe("alertWhenText", () => {
  const at = (startsAt: string, startTime: string, endTime: string) => ({ startsAt: new Date(startsAt), startTime, endTime })
  it("says « aujourd'hui » and « demain » in the organisation's zone", () => {
    expect(alertWhenText(at("2026-11-27T13:00:00Z", "14:00", "16:00"), now, "Europe/Zurich")).toBe("aujourd'hui, vendredi 27 novembre, de 14 h à 16 h")
    expect(alertWhenText(at("2026-11-28T17:00:00Z", "18:00", "21:30"), now, "Europe/Zurich")).toBe("demain, samedi 28 novembre, de 18 h à 21 h 30")
  })
  it("names only the day beyond tomorrow", () => {
    expect(alertWhenText(at("2026-11-29T08:00:00Z", "09:00", "11:00"), now, "Europe/Zurich")).toBe("dimanche 29 novembre, de 9 h à 11 h")
  })
  it("uses the organisation's day, not UTC's: 23:30 UTC is already tomorrow in Zurich", () => {
    const late = new Date("2026-11-27T23:30:00Z")
    expect(alertWhenText(at("2026-11-28T08:00:00Z", "09:00", "11:00"), late, "Europe/Zurich")).toBe("aujourd'hui, samedi 28 novembre, de 9 h à 11 h")
  })
})

describe("addressAlertDedupeKey and addressAlertSubject", () => {
  it("is the same key for the same people in any order, and another for another set", () => {
    const a = addressAlertDedupeKey("org", "2026-11-27", "a@example.org", ["m2", "m1"])
    expect(a).toBe(addressAlertDedupeKey("org", "2026-11-27", "a@example.org", ["m1", "m2"]))
    expect(a).not.toBe(addressAlertDedupeKey("org", "2026-11-27", "a@example.org", ["m1"]))
    expect(a).not.toBe(addressAlertDedupeKey("org", "2026-11-28", "a@example.org", ["m1", "m2"]))
  })
  it("names the person when there is one, counts otherwise", () => {
    expect(addressAlertSubject([{ name: "Julie Martin" }])).toBe("À joindre avant son créneau : Julie Martin")
    expect(addressAlertSubject([{ name: "A" }, { name: "B" }])).toBe("2 bénévoles à joindre avant leur créneau")
  })
})
