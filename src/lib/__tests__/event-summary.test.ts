// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { eventSummary, type EventSummaryRegistration } from "../event-summary"
import type { StaffingShift } from "../staffing"

const TZ = "Europe/Zurich"

type RegOverrides = Partial<Omit<EventSummaryRegistration, "shift">> & { shift?: Partial<EventSummaryRegistration["shift"]> }

const reg = (over: RegOverrides = {}): EventSummaryRegistration => ({
  id: "reg-1",
  volunteerId: "vol-1",
  status: "active",
  checkedInAt: new Date("2026-05-02T19:00:00Z"),
  event: { id: "event-1", title: "Fête du village" },
  ...over,
  shift: { id: "shift-1", roleName: "Bar", label: "Bar", date: "2026-05-02", startTime: "18:00", endTime: "22:00", status: "full", ...over.shift },
})

const shift = (over: Partial<StaffingShift> = {}): StaffingShift => ({
  id: "shift-1", roleName: "Bar", label: "Bar", date: "2026-05-02", startTime: "18:00", endTime: "22:00",
  capacity: 2, active: 1, waiting: 0, closed: false, ...over,
})

describe("eventSummary", () => {
  it("counts distinct volunteers, splits first-time vs returning", () => {
    const registrations = [
      reg({ id: "r1", volunteerId: "vol-1" }),
      reg({ id: "r2", volunteerId: "vol-2", shift: { id: "shift-2" } }),
    ]
    const returning = new Set(["vol-1"])
    const summary = eventSummary(registrations, returning, [shift(), shift({ id: "shift-2" })], [], TZ)
    expect(summary.distinctVolunteers).toBe(2)
    expect(summary.returningCount).toBe(1)
    expect(summary.firstTimeCount).toBe(1)
  })

  it("flags full check-in usage when every confirmed shift has a presence", () => {
    const registrations = [reg({ id: "r1" }), reg({ id: "r2", shift: { id: "shift-2" } })]
    const summary = eventSummary(registrations, new Set(), [shift(), shift({ id: "shift-2" })], [], TZ)
    expect(summary.shiftsConfirmed).toBe(2)
    expect(summary.shiftsWithPresence).toBe(2)
    expect(summary.shiftsWithoutPresence).toBe(0)
    expect(summary.checkInUsage).toBe("full")
  })

  it("flags partial check-in usage: presences saisies pour 1 créneau sur 2", () => {
    const registrations = [reg({ id: "r1", checkedInAt: new Date("2026-05-02T19:00:00Z") }), reg({ id: "r2", checkedInAt: null, shift: { id: "shift-2" } })]
    const summary = eventSummary(registrations, new Set(), [shift(), shift({ id: "shift-2" })], [], TZ)
    expect(summary.checkInUsage).toBe("partial")
    expect(summary.shiftsWithPresence).toBe(1)
    expect(summary.shiftsWithoutPresence).toBe(1)
  })

  it("flags no check-in usage at all when nothing was recorded", () => {
    const summary = eventSummary([reg({ checkedInAt: null })], new Set(), [shift()], [], TZ)
    expect(summary.checkInUsage).toBe("none")
  })

  it("is 'none' with no confirmed shift at all", () => {
    const summary = eventSummary([], new Set(), [], [], TZ)
    expect(summary.checkInUsage).toBe("none")
    expect(summary.distinctVolunteers).toBe(0)
  })

  it("planned is the total (attested + unattested), attested its subset (owner decision, #557)", () => {
    const registrations = [reg({ id: "r1", checkedInAt: new Date("2026-05-02T19:00:00Z") }), reg({ id: "r2", checkedInAt: null, shift: { id: "shift-2" } })]
    const summary = eventSummary(registrations, new Set(), [shift(), shift({ id: "shift-2" })], [], TZ)
    expect(summary.attestedMinutes).toBe(240)
    expect(summary.plannedMinutes).toBe(480)
  })

  it("attested equals planned, not 0 h, when every confirmed shift has a presence", () => {
    const registrations = [reg({ id: "r1" }), reg({ id: "r2", shift: { id: "shift-2" } })]
    const summary = eventSummary(registrations, new Set(), [shift(), shift({ id: "shift-2" })], [], TZ)
    expect(summary.plannedMinutes).toBe(480)
    expect(summary.attestedMinutes).toBe(480)
  })

  it("reuses staffing.ts for the fill rate overall, per role and the underfilled list", () => {
    const shifts = [shift({ id: "s-bar", roleName: "Bar", active: 1, capacity: 2 }), shift({ id: "s-caisse", roleName: "Caisse", active: 3, capacity: 3 })]
    const summary = eventSummary([reg({ shift: { id: "s-bar" } })], new Set(), shifts, [], TZ)
    expect(summary.fillOverall).toEqual({ filled: 4, capacity: 5 })
    expect(summary.fillByRole.sort((a, b) => a.roleName.localeCompare(b.roleName))).toEqual([
      { roleName: "Bar", filled: 1, capacity: 2 },
      { roleName: "Caisse", filled: 3, capacity: 3 },
    ])
    expect(summary.underfilled.map((s) => s.id)).toEqual(["s-bar"])
  })
})
