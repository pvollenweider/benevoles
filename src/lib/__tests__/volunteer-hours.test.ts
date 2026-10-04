// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import {
  defaultPeriod,
  eventHourSummaries,
  lastParticipation,
  localToday,
  memberHourTotals,
  pastEntries,
  registrationCounts,
  returningVolunteerIds,
  splitMinutes,
  volunteerHourEntries,
  withinPeriod,
  totalMinutes,
  type HourEntry,
  type HourRegistration,
} from "../volunteer-hours"

const TZ = "Europe/Zurich"

type RegOverrides = Partial<Omit<HourRegistration, "shift">> & { shift?: Partial<HourRegistration["shift"]> }

const reg = (over: RegOverrides = {}): HourRegistration => ({
  id: "reg-1",
  status: "active",
  checkedInAt: new Date("2026-05-01T20:00:00Z"),
  event: { id: "event-1", title: "Fête du village" },
  ...over,
  shift: { id: "shift-1", roleName: "Bar", label: "Bar", date: "2026-05-02", startTime: "18:00", endTime: "22:00", status: "full", ...over.shift },
})

describe("registrationCounts", () => {
  for (const status of ["active"]) {
    it(`counts an ${status} registration on a live shift`, () => {
      expect(registrationCounts(reg({ status }))).toBe(true)
    })
  }
  for (const status of ["waiting", "offered", "requested", "cancelled", "refused", "deleted"]) {
    it(`never counts a ${status} registration`, () => {
      expect(registrationCounts(reg({ status }))).toBe(false)
    })
  }
  it("never counts a registration on a cancelled shift, even if active", () => {
    expect(registrationCounts(reg({ status: "active", shift: { status: "cancelled" } }))).toBe(false)
  })
  it("a presence recorded on a shift later cancelled does not count (owner decision, #556)", () => {
    const r = reg({ status: "cancelled", checkedInAt: new Date("2026-05-01T20:00:00Z"), shift: { status: "cancelled" } })
    expect(registrationCounts(r)).toBe(false)
    expect(volunteerHourEntries([r], TZ)).toHaveLength(0)
  })
})

describe("volunteerHourEntries", () => {
  it("computes minutes from the real local instants", () => {
    const [entry] = volunteerHourEntries([reg()], TZ)
    expect(entry.minutes).toBe(240)
    expect(entry.attested).toBe(true)
    expect(entry.localDate).toBe("2026-05-02")
  })

  it("counts a night shift crossing midnight as its real duration (22:00–02:00 = 4 h)", () => {
    const r = reg({ shift: { startTime: "22:00", endTime: "02:00" } })
    const [entry] = volunteerHourEntries([r], TZ)
    expect(entry.minutes).toBe(240)
  })

  it("counts the spring DST change (2026-03-29, 02:00→03:00 skipped) for its real duration", () => {
    const r = reg({ shift: { date: "2026-03-29", startTime: "01:00", endTime: "04:00" } })
    const [entry] = volunteerHourEntries([r], TZ)
    expect(entry.minutes).toBe(120) // 3 wall hours minus the skipped hour
  })

  it("counts the autumn DST change (2026-10-25, 02:00→03:00 repeated) for its real duration", () => {
    const r = reg({ shift: { date: "2026-10-25", startTime: "01:00", endTime: "04:00" } })
    const [entry] = volunteerHourEntries([r], TZ)
    expect(entry.minutes).toBe(240) // 3 wall hours plus the repeated hour
  })

  it("separates attested hours (checkedInAt set) from planned hours (confirmed, no presence)", () => {
    const attested = reg({ checkedInAt: new Date("2026-05-02T19:00:00Z") })
    const planned = reg({ id: "reg-2", checkedInAt: null, shift: { id: "shift-2" } })
    const entries = volunteerHourEntries([attested, planned], TZ)
    expect(entries.find((e) => e.registrationId === "reg-1")?.attested).toBe(true)
    expect(entries.find((e) => e.registrationId === "reg-2")?.attested).toBe(false)
  })

  it("filters by period on the shift's local start date, inclusive bounds", () => {
    const inPeriod = reg({ shift: { date: "2026-05-02" } })
    const before = reg({ id: "reg-before", shift: { id: "s-before", date: "2026-04-30" } })
    const after = reg({ id: "reg-after", shift: { id: "s-after", date: "2026-06-01" } })
    const onBoundary = reg({ id: "reg-boundary", shift: { id: "s-boundary", date: "2026-05-01" } })
    const period = { from: "2026-05-01", to: "2026-05-31" }
    const entries = volunteerHourEntries([inPeriod, before, after, onBoundary], TZ, period)
    expect(entries.map((e) => e.registrationId).sort()).toEqual(["reg-1", "reg-boundary"])
  })

  it("withinPeriod matches the same inclusive bounds", () => {
    const period = { from: "2026-05-01", to: "2026-05-31" }
    expect(withinPeriod("2026-05-01", period)).toBe(true)
    expect(withinPeriod("2026-05-31", period)).toBe(true)
    expect(withinPeriod("2026-04-30", period)).toBe(false)
    expect(withinPeriod("2026-06-01", period)).toBe(false)
  })
})

describe("eventHourSummaries", () => {
  it("groups entries per event with roles, shift count and an attested/planned split", () => {
    const attested = reg({ shift: { id: "s1", roleName: "Bar", label: "Bar" } })
    const planned = reg({ id: "reg-2", checkedInAt: null, shift: { id: "s2", roleName: "Caisse", label: "Caisse" } })
    const entries = volunteerHourEntries([attested, planned], TZ)
    const [summary] = eventHourSummaries(entries)
    expect(summary.eventId).toBe("event-1")
    expect(summary.shiftsCount).toBe(2)
    expect(summary.roles.sort()).toEqual(["Bar", "Caisse"])
    expect(summary.attestedMinutes).toBe(240)
    expect(summary.plannedWithoutPresenceMinutes).toBe(240)
    expect(summary.noCheckIn).toBe(false)
  })

  it("flags an event with confirmed shifts but no recorded presence at all", () => {
    const planned = reg({ checkedInAt: null })
    const entries = volunteerHourEntries([planned], TZ)
    const [summary] = eventHourSummaries(entries)
    expect(summary.noCheckIn).toBe(true)
    expect(summary.attestedMinutes).toBe(0)
  })

  it("distinguishes a role from its label, joined by a separator, and dedupes repeats", () => {
    const r1 = reg({ shift: { id: "s1", roleName: "Bar", label: "Bar soir" } })
    const r2 = reg({ id: "reg-2", shift: { id: "s2", roleName: "Bar", label: "Bar soir" } })
    const entries = volunteerHourEntries([r1, r2], TZ)
    const [summary] = eventHourSummaries(entries)
    expect(summary.roles).toEqual(["Bar (Bar soir)"])
  })
})

describe("totalMinutes", () => {
  it("sums attested-only or every counted entry", () => {
    const attested = reg()
    const planned = reg({ id: "reg-2", checkedInAt: null, shift: { id: "s2" } })
    const entries = volunteerHourEntries([attested, planned], TZ)
    expect(totalMinutes(entries, true)).toBe(240)
    expect(totalMinutes(entries, false)).toBe(480)
  })
})

describe("defaultPeriod", () => {
  it("is the last 12 months ending today, in the organisation's time zone", () => {
    const now = new Date("2026-06-15T22:30:00Z") // 00:30 the next day in Europe/Zurich (summer, UTC+2)
    const period = defaultPeriod(now, TZ)
    expect(period.to).toBe("2026-06-16")
    expect(period.from).toBe("2025-06-16")
  })
})

describe("localToday", () => {
  it("matches defaultPeriod's own notion of today", () => {
    const now = new Date("2026-06-15T22:30:00Z")
    expect(localToday(now, TZ)).toBe("2026-06-16")
    expect(defaultPeriod(now, TZ).to).toBe(localToday(now, TZ))
  })
})

describe("pastEntries (#557)", () => {
  it("keeps entries on or before today and drops later ones", () => {
    const entries = volunteerHourEntries(
      [
        reg({ id: "reg-past", shift: { id: "s-past", date: "2026-05-01" } }),
        reg({ id: "reg-today", shift: { id: "s-today", date: "2026-05-02" } }),
        reg({ id: "reg-future", shift: { id: "s-future", date: "2026-05-03" } }),
      ],
      TZ,
    )
    const past = pastEntries(entries, "2026-05-02")
    expect(past.map((e) => e.registrationId).sort()).toEqual(["reg-past", "reg-today"])
  })
})

describe("splitMinutes (#557)", () => {
  it("planned is the total of every counted entry, attested entries included (owner decision)", () => {
    const attested = reg()
    const planned = reg({ id: "reg-2", checkedInAt: null, shift: { id: "s2" } })
    const entries = volunteerHourEntries([attested, planned], TZ)
    const { plannedMinutes, attestedMinutes } = splitMinutes(entries)
    expect(attestedMinutes).toBe(240)
    expect(plannedMinutes).toBe(480)
    expect(plannedMinutes).toBe(totalMinutes(entries, false))
  })

  it("attested equals planned when every counted shift has a recorded presence — never 0 h planned", () => {
    const r1 = reg()
    const r2 = reg({ id: "reg-2", shift: { id: "s2" } })
    const entries = volunteerHourEntries([r1, r2], TZ)
    const { plannedMinutes, attestedMinutes } = splitMinutes(entries)
    expect(attestedMinutes).toBe(480)
    expect(plannedMinutes).toBe(480)
    expect(attestedMinutes).toBeLessThanOrEqual(plannedMinutes)
  })

  it("is all zero without entries", () => {
    expect(splitMinutes([])).toEqual({ plannedMinutes: 0, attestedMinutes: 0 })
  })
})

describe("lastParticipation (#557)", () => {
  it("is the most recent shift date and the most recent presence date", () => {
    const old = reg({ id: "reg-old", checkedInAt: null, shift: { id: "s-old", date: "2026-01-10" } })
    const recentPresence = reg({ id: "reg-recent", shift: { id: "s-recent", date: "2026-05-02" } })
    const recentNoPresence = reg({ id: "reg-later", checkedInAt: null, shift: { id: "s-later", date: "2026-06-01" } })
    const entries = volunteerHourEntries([old, recentPresence, recentNoPresence], TZ)
    expect(lastParticipation(entries)).toEqual({ lastShiftDate: "2026-06-01", lastPresenceDate: "2026-05-02" })
  })

  it("is null for both without entries, and null for presence when none was recorded", () => {
    expect(lastParticipation([])).toEqual({ lastShiftDate: null, lastPresenceDate: null })
    const r = reg({ checkedInAt: null })
    expect(lastParticipation(volunteerHourEntries([r], TZ))).toEqual({ lastShiftDate: "2026-05-02", lastPresenceDate: null })
  })
})

describe("memberHourTotals (#557)", () => {
  it("groups entries per volunteer with distinct event count, shift count and the planned/attested split", () => {
    const entries: HourEntry[] = [
      ...volunteerHourEntries([reg({ volunteerId: "vol-1" })], TZ),
      ...volunteerHourEntries([reg({ id: "reg-2", volunteerId: "vol-1", checkedInAt: null, event: { id: "event-2", title: "Marché de Noël" }, shift: { id: "s2" } })], TZ),
      ...volunteerHourEntries([reg({ id: "reg-3", volunteerId: "vol-2", shift: { id: "s3" } })], TZ),
    ]
    const totals = memberHourTotals(entries)
    expect(totals.find((t) => t.volunteerId === "vol-1")).toEqual({ volunteerId: "vol-1", eventsCount: 2, shiftsCount: 2, plannedMinutes: 480, attestedMinutes: 240 })
    expect(totals.find((t) => t.volunteerId === "vol-2")).toEqual({ volunteerId: "vol-2", eventsCount: 1, shiftsCount: 1, plannedMinutes: 240, attestedMinutes: 240 })
  })

  it("skips entries without a volunteerId", () => {
    const entries = volunteerHourEntries([reg()], TZ)
    expect(memberHourTotals(entries)).toEqual([])
  })
})

describe("returningVolunteerIds (#557)", () => {
  it("is returning when an active registration exists on another, earlier-starting event", () => {
    const records = [
      { volunteerId: "vol-1", eventId: "event-prev", eventStart: new Date("2026-01-01T00:00:00Z") },
      { volunteerId: "vol-2", eventId: "event-2", eventStart: new Date("2026-05-01T00:00:00Z") },
    ]
    const ids = returningVolunteerIds(records, "event-this", new Date("2026-06-01T00:00:00Z"))
    expect(ids.has("vol-1")).toBe(true)
  })

  it("is first-time when the only other registration is on a later or the same event", () => {
    const records = [
      { volunteerId: "vol-1", eventId: "event-later", eventStart: new Date("2026-07-01T00:00:00Z") },
      { volunteerId: "vol-2", eventId: "event-this", eventStart: new Date("2026-06-01T00:00:00Z") },
    ]
    const ids = returningVolunteerIds(records, "event-this", new Date("2026-06-01T00:00:00Z"))
    expect(ids.has("vol-1")).toBe(false)
    expect(ids.has("vol-2")).toBe(false)
  })

  it("is first-time with no other activity at all", () => {
    expect(returningVolunteerIds([], "event-this", new Date("2026-06-01T00:00:00Z")).size).toBe(0)
  })
})
