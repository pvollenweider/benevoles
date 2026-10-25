// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Reads the « Jour J » board of an event through the org-scoped client (#561), for the page and
 * for the refresh route the page polls (#1141): one query, the same facts both ways. Server only.
 */

import type { OrgScopedPrisma } from "./prisma-org"
import { orgTimeZone } from "./time-zone"
import { contactPhone } from "./contact-phone"
import { fmtHour } from "./registrations-list"
import { dayOfBoard, dayOfDateRange, localDay, type DayOfBoard, type DayOfShift } from "./day-of"

export type DayOfSnapshot = {
  board: DayOfBoard
  /** "YYYY-MM-DD" in the organization's zone. */
  today: string
  /** « 14h05 »: when this board was read, in the organization's zone. */
  refreshedAt: string
}

export type DayOfLoaded = DayOfSnapshot & {
  event: { id: string; startDate: Date; endDate: Date }
  timeZone: string
}

/** Null when the event is not one of this organization's. */
export async function loadDayOf(db: OrgScopedPrisma, eventId: string, now: Date): Promise<DayOfLoaded | null> {
  const range = dayOfDateRange(now)
  const event = await db.event.findFirst({
    where: { id: eventId },
    select: {
      id: true, startDate: true, endDate: true,
      organization: { select: { timeZone: true } },
      shifts: {
        where: { status: { not: "cancelled" }, date: { gte: range.from, lte: range.to } },
        select: {
          id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, capacity: true, displayOrder: true,
          contactName: true, contactPhone: true,
          // Confirmed people only: check-in applies to them (#399), as on the registrations list.
          registrations: {
            where: { status: "active" },
            select: { id: true, phone: true, checkedInAt: true, volunteer: { select: { firstName: true, lastName: true, phone: true } } },
          },
        },
      },
    },
  })
  if (!event) return null

  const timeZone = orgTimeZone(event.organization)
  const shifts: DayOfShift[] = event.shifts.map((s) => ({
    id: s.id, roleName: s.roleName, label: s.label, date: s.date.toISOString().slice(0, 10),
    startTime: s.startTime, endTime: s.endTime, capacity: s.capacity, displayOrder: s.displayOrder,
    contactName: s.contactName, contactPhone: s.contactPhone,
    people: s.registrations
      .map((r) => ({
        registrationId: r.id,
        firstName: r.volunteer.firstName,
        lastName: r.volunteer.lastName,
        phone: contactPhone(r),
        checkedInAt: r.checkedInAt?.toISOString() ?? null,
      }))
      .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr")),
  }))
  const clock = now.toLocaleTimeString("fr-CH", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  return {
    event: { id: event.id, startDate: event.startDate, endDate: event.endDate },
    timeZone,
    board: dayOfBoard(shifts, now, timeZone),
    today: localDay(now, timeZone),
    refreshedAt: fmtHour(clock),
  }
}
