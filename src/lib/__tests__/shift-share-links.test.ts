// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { describe, it, expect } from "vitest"
import { localDateTimeToUtc } from "../time-zone"
import {
  parseShiftShareCode,
  shiftShareBooking,
  shiftShareLinkUrl,
  shiftShareRegistrationsText,
  shiftShareView,
} from "../shift-share-links"

// Share link for one shift (#1386), decision (b): the shift must be open, not started and have a
// free place; the event's window applies unless the link accepts after close, never before it opens.
const TZ = "Europe/Zurich"
const published = { publicStatus: "published", registrationsOpen: true }

/** An instant built from the organisation's calendar day and wall-clock time, like the app does. */
const zurich = (day: string, time: string) => localDateTimeToUtc(new Date(`${day}T00:00:00Z`), time, TZ)

const shift = (over: Record<string, unknown> = {}) => ({
  status: "open",
  date: new Date("2026-06-01T00:00:00Z"),
  startTime: "18:00",
  endTime: "20:00",
  capacity: 3,
  ...over,
})

const booking = (over: {
  event?: Record<string, unknown>
  shift?: Record<string, unknown>
  occupied?: number
  acceptsAfterClose?: boolean
  now?: Date
} = {}) => shiftShareBooking({
  event: { ...published, ...over.event },
  shift: shift(over.shift),
  occupied: over.occupied ?? 0,
  acceptsAfterClose: over.acceptsAfterClose ?? false,
  now: over.now ?? zurich("2026-06-01", "12:00"),
  timeZone: TZ,
})

describe("shiftShareBooking", () => {
  it("is bookable while the window is open, the shift not started and a place free", () => {
    expect(booking()).toEqual({ bookable: true })
    expect(booking({ occupied: 2 })).toEqual({ bookable: true })
  })

  it("follows the closing date: refused without the checkbox, bookable with it (option b)", () => {
    const closesAt = zurich("2026-06-01", "17:00")
    const now = zurich("2026-06-01", "17:30")
    expect(booking({ event: { registrationClosesAt: closesAt }, now })).toEqual({ bookable: false, reason: "window_closed" })
    expect(booking({ event: { registrationClosesAt: closesAt }, now, acceptsAfterClose: true })).toEqual({ bookable: true })
  })

  it("follows registrations turned off: refused without the checkbox, bookable with it", () => {
    expect(booking({ event: { registrationsOpen: false } })).toEqual({ bookable: false, reason: "window_closed" })
    expect(booking({ event: { registrationsOpen: false }, acceptsAfterClose: true })).toEqual({ bookable: true })
  })

  it("never opens an event whose registrations have not opened yet, checkbox or not", () => {
    const event = { registrationOpensAt: zurich("2026-06-02", "10:00") }
    const now = zurich("2026-06-01", "12:00")
    expect(booking({ event, now })).toEqual({ bookable: false, reason: "not_yet" })
    expect(booking({ event, now, acceptsAfterClose: true })).toEqual({ bookable: false, reason: "not_yet" })
    // Even with the switch off, a future opening date is never bypassed.
    expect(booking({ event: { ...event, registrationsOpen: false }, now, acceptsAfterClose: true })).toEqual({ bookable: false, reason: "not_yet" })
  })

  it("never opens an unpublished event", () => {
    expect(booking({ event: { publicStatus: "draft" }, acceptsAfterClose: true })).toEqual({ bookable: false, reason: "not_published" })
    expect(booking({ event: { publicStatus: "archived" } })).toEqual({ bookable: false, reason: "not_published" })
  })

  it("refuses a full shift, even with the checkbox: a link never sends anyone to the waitlist", () => {
    expect(booking({ occupied: 3 })).toEqual({ bookable: false, reason: "full" })
    expect(booking({ occupied: 4, acceptsAfterClose: true, event: { registrationsOpen: false } })).toEqual({ bookable: false, reason: "full" })
  })

  it("refuses a shift that has started, at the exact start instant", () => {
    expect(booking({ now: zurich("2026-06-01", "17:59") })).toEqual({ bookable: true })
    expect(booking({ now: zurich("2026-06-01", "18:00") })).toEqual({ bookable: false, reason: "started" })
    expect(booking({ now: zurich("2026-06-01", "19:00") })).toEqual({ bookable: false, reason: "started" })
  })

  it("refuses a closed or cancelled shift", () => {
    expect(booking({ shift: { status: "closed" } })).toEqual({ bookable: false, reason: "closed" })
    expect(booking({ shift: { status: "cancelled" } })).toEqual({ bookable: false, reason: "closed" })
  })

  it("decides around midnight Zurich with the organisation's day, not UTC", () => {
    // A night shift starting at 00:30 on 1 June, Zurich time: on 31 May at 23:00 Zurich it is still
    // to come, at 00:30 on 1 June it has started. UTC would put both on 31 May.
    const night = { shift: { date: new Date("2026-06-01T00:00:00Z"), startTime: "00:30", endTime: "04:00" } }
    expect(booking({ ...night, now: zurich("2026-05-31", "23:00") })).toEqual({ bookable: true })
    expect(booking({ ...night, now: zurich("2026-06-01", "00:29") })).toEqual({ bookable: true })
    expect(booking({ ...night, now: zurich("2026-06-01", "00:30") })).toEqual({ bookable: false, reason: "started" })
  })

  it("decides the closing date around midnight Zurich too", () => {
    const closesAt = zurich("2026-06-30", "23:59")
    const later = { shift: { date: new Date("2026-07-01T00:00:00Z") } }
    expect(booking({ ...later, event: { registrationClosesAt: closesAt }, now: zurich("2026-06-30", "23:58"), acceptsAfterClose: true })).toEqual({ bookable: true })
    expect(booking({ ...later, event: { registrationClosesAt: closesAt }, now: zurich("2026-07-01", "00:00"), acceptsAfterClose: true })).toEqual({ bookable: true })
    expect(booking({ ...later, event: { registrationClosesAt: closesAt }, now: zurich("2026-07-01", "00:00") })).toEqual({ bookable: false, reason: "window_closed" })
  })
})

describe("codes and URLs", () => {
  it("accepts only a group-link-shaped code, never a shift id", () => {
    expect(parseShiftShareCode("abcd2345")).toBe("abcd2345")
    expect(parseShiftShareCode(" ABCD2345 ")).toBe("abcd2345")
    expect(parseShiftShareCode("clx1234567890abcdefghij")).toBeNull()
    expect(parseShiftShareCode("abcd234")).toBeNull()
    expect(parseShiftShareCode("abcd234o")).toBeNull()
    expect(parseShiftShareCode(null)).toBeNull()
  })

  it("builds the event's URL with the shift code, keeping its query", () => {
    expect(shiftShareLinkUrl("http://localhost:3000/fete?org=club", "abcd2345"))
      .toBe("http://localhost:3000/fete?org=club&partage=abcd2345")
    expect(shiftShareLinkUrl("https://club.benevol.app/fete", "abcd2345"))
      .toBe("https://club.benevol.app/fete?partage=abcd2345")
  })
})

describe("shiftShareView", () => {
  it("narrows the page only for a bookable link", () => {
    expect(shiftShareView({ bookable: true }, "abcd2345", "s1")).toEqual({ kind: "bookable", code: "abcd2345", shiftId: "s1" })
  })

  it("shows the whole event with a notice when the shift is full, started or closed", () => {
    for (const reason of ["full", "started", "closed"] as const) {
      expect(shiftShareView({ bookable: false, reason }, "abcd2345", "s1")).toEqual({ kind: "unavailable" })
    }
  })

  it("shows the whole event with no notice while the window is closed or not open yet", () => {
    expect(shiftShareView({ bookable: false, reason: "window_closed" }, "abcd2345", "s1")).toEqual({ kind: "none" })
    expect(shiftShareView({ bookable: false, reason: "not_yet" }, "abcd2345", "s1")).toEqual({ kind: "none" })
    expect(shiftShareView({ bookable: false, reason: "not_published" }, "abcd2345", "s1")).toEqual({ kind: "none" })
  })
})

describe("shiftShareRegistrationsText", () => {
  it("counts the sign-ups the link brought, in French", () => {
    expect(shiftShareRegistrationsText(0)).toBe("Aucune inscription par ce lien pour l'instant")
    expect(shiftShareRegistrationsText(1)).toBe("1 inscription par ce lien")
    expect(shiftShareRegistrationsText(4)).toBe("4 inscriptions par ce lien")
  })
})
