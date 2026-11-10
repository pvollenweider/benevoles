// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect, vi } from "vitest"
import {
  declinedAtFor,
  declinedShiftsOf,
  hasDeclinedShift,
  shiftDeclineApiPath,
  shiftDeclineDay,
  shiftDeclineHours,
  shiftDeclinePagePath,
  shiftDeclineReason,
  shiftDeclineSecretFromSegment,
  shiftDeclineShiftName,
  shiftDeclineState,
  shiftDeclineUnavailableMessage,
  type ShiftDeclineShift,
} from "../shift-declines"
import { clearShiftDeclines } from "../shift-decline-clear"

const now = new Date("2026-07-01T12:00:00Z")
const shift = (over: Partial<ShiftDeclineShift> = {}): ShiftDeclineShift => ({
  id: "s1", eventId: "e1", roleName: "Bar", label: "Bar soir", date: "2026-07-04",
  startTime: "22:00", endTime: "02:00", status: "open", capacity: 3, active: 1, ...over,
})
const future = new Date("2026-07-04T20:00:00Z")

describe("« Je ne peux pas » — the answer for one shift (#1303)", () => {
  const declines = [
    { volunteerId: "v1", shiftId: "s1", declinedAt: new Date("2026-06-20T10:00:00Z") },
    { volunteerId: "v1", shiftId: "s2", declinedAt: "2026-06-21T10:00:00Z" },
    { volunteerId: "v2", shiftId: "s1", declinedAt: new Date("2026-06-22T10:00:00Z") },
  ]

  it("reads one answer per member and per shift, never another member's", () => {
    expect(hasDeclinedShift(declines, "v1", "s1")).toBe(true)
    expect(hasDeclinedShift(declines, "v1", "s2")).toBe(true)
    expect(hasDeclinedShift(declines, "v1", "s3")).toBe(false)
    expect(hasDeclinedShift(declines, "v2", "s2")).toBe(false)
    expect(declinedAtFor(declines, "v1", "s2")).toEqual(new Date("2026-06-21T10:00:00Z"))
  })

  it("lists only the selected shifts, with their dates", () => {
    expect(declinedShiftsOf(declines, "v1", ["s1", "s3"])).toEqual([{ shiftId: "s1", declinedAt: new Date("2026-06-20T10:00:00Z") }])
  })

  it("says « A répondu non le … » with the answer's date", () => {
    expect(shiftDeclineReason(new Date("2026-06-20T10:00:00Z"))).toBe("A répondu non le 20 juin 2026")
  })

  it("opens each shift; the answer is about that shift only", () => {
    expect(shiftDeclineState({ shift: shift(), registrations: [], declinedAt: null, startsAt: future, now })).toEqual({ kind: "open" })
    expect(shiftDeclineState({ shift: shift(), registrations: [], declinedAt: new Date("2026-06-20T10:00:00Z"), startsAt: future, now }))
      .toEqual({ kind: "declined", declinedAt: new Date("2026-06-20T10:00:00Z") })
    expect(shiftDeclineState({ shift: shift(), registrations: [{ shiftId: "s1", status: "waiting" }], declinedAt: null, startsAt: future, now }))
      .toEqual({ kind: "registered", status: "waiting" })
  })

  it("refuses a cancelled, full, past or already held shift, with a clear message", () => {
    const cases = [
      [shiftDeclineState({ shift: shift({ status: "cancelled" }), registrations: [], declinedAt: null, startsAt: future, now }), "Ce créneau a été annulé."],
      [shiftDeclineState({ shift: shift({ active: 3 }), registrations: [], declinedAt: null, startsAt: future, now }), "Ce créneau est complet."],
      [shiftDeclineState({ shift: shift(), registrations: [], declinedAt: null, startsAt: new Date("2026-06-30T20:00:00Z"), now }), "Ce créneau est passé."],
      [shiftDeclineState({ shift: shift(), registrations: [{ shiftId: "s1", status: "active" }], declinedAt: null, startsAt: future, now }), "Tu as déjà une inscription sur ce créneau."],
      [{ kind: "deleted" as const }, "Ce créneau n'existe plus."],
    ] as const
    for (const [state, message] of cases) expect(shiftDeclineUnavailableMessage(state)).toBe(message)
    expect(shiftDeclineUnavailableMessage({ kind: "open" })).toBeNull()
  })

  it("formats the shift as the email and the page name it", () => {
    expect(shiftDeclineShiftName({ roleName: "Bar", label: "Bar soir" })).toBe("Bar (Bar soir)")
    expect(shiftDeclineShiftName({ roleName: "Bar", label: "Bar" })).toBe("Bar")
    expect(shiftDeclineDay("2026-07-04")).toBe("samedi 4 juillet")
    expect(shiftDeclineHours({ startTime: "22:00", endTime: "02:00" })).toBe("de 22h à 2h, jusqu'au lendemain")
  })

  it("builds the confirmation page and the POST paths without a new secret", () => {
    expect(shiftDeclinePagePath("invitation", "tok-1", "s1")).toBe("/ne-peux-pas/invitation/tok-1/s1")
    expect(shiftDeclinePagePath("registration", "tok-2", "s2")).toBe("/ne-peux-pas/inscription/tok-2/s2")
    expect(shiftDeclineApiPath("invitation", "tok-1", "s1")).toBe("/api/public/member-invite/tok-1/shift-declines/s1")
    expect(shiftDeclineApiPath("registration", "tok-2", "s2")).toBe("/api/public/registrations/tok-2/shift-declines/s2")
    expect(shiftDeclineSecretFromSegment("invitation")).toBe("invitation")
    expect(shiftDeclineSecretFromSegment("inscription")).toBe("registration")
    expect(shiftDeclineSecretFromSegment("autre")).toBeNull()
  })
})

describe("clearShiftDeclines", () => {
  it("deletes the answers for the shifts taken, in the caller's transaction", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 })
    expect(await clearShiftDeclines({ shiftDecline: { deleteMany } }, "v1", ["s1", "s2", "s1"])).toBe(2)
    expect(deleteMany).toHaveBeenCalledWith({ where: { volunteerId: "v1", shiftId: { in: ["s1", "s2"] } } })
    expect(await clearShiftDeclines({ shiftDecline: { deleteMany } }, "v1", [])).toBe(0)
    expect(deleteMany).toHaveBeenCalledTimes(1)
  })
})
