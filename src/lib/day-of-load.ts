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

/** The event's own dates, always read: the page's header needs them. */
export type DayOfEventBase = { id: string; startDate: Date; endDate: Date }

/** The registration window (#463), so « Ajouter un besoin » can say why the send is blocked (#1304). */
export type DayOfRegistrationWindow = { publicStatus: string; registrationsOpen: boolean; registrationOpensAt: Date | null; registrationClosesAt: Date | null; overlapsAllowed: boolean }

export type DayOfLoaded = DayOfSnapshot & {
  event: DayOfEventBase & DayOfRegistrationWindow
  timeZone: string
}

/** The same snapshot for a page that never renders « Ajouter un besoin »: no registration window read. */
export type DayOfLoadedBase = DayOfSnapshot & {
  event: DayOfEventBase
  timeZone: string
}

/**
 * Null when the event is not one of this organization's. `shiftWhere` narrows the shifts to some
 * postes (the « Secteur » filter, #1170, src/lib/sector-filter-data.ts); `{}` reads them all.
 * `options.registrationWindow: false` leaves the registration window columns out of the query: a
 * front-desk page renders no « Ajouter un besoin » and must not serialise what the day-of GET does
 * not return (#1142).
 */
export async function loadDayOf(db: OrgScopedPrisma, eventId: string, now: Date, shiftWhere?: { roleName?: { in: string[] } }, options?: { registrationWindow?: true }): Promise<DayOfLoaded | null>
export async function loadDayOf(db: OrgScopedPrisma, eventId: string, now: Date, shiftWhere: { roleName?: { in: string[] } } | undefined, options: { registrationWindow: false }): Promise<DayOfLoadedBase | null>
export async function loadDayOf(
  db: OrgScopedPrisma,
  eventId: string,
  now: Date,
  shiftWhere: { roleName?: { in: string[] } } = {},
  options: { registrationWindow?: boolean } = {},
): Promise<DayOfLoaded | DayOfLoadedBase | null> {
  const withRegistrationWindow = options.registrationWindow !== false
  const range = dayOfDateRange(now)
  const event = await db.event.findFirst({
    where: { id: eventId },
    select: {
      id: true, startDate: true, endDate: true,
      ...(withRegistrationWindow
        ? { publicStatus: true, registrationsOpen: true, registrationOpensAt: true, registrationClosesAt: true, overlapsAllowed: true }
        : {}),
      organization: { select: { timeZone: true } },
      shifts: {
        where: { status: { not: "cancelled" }, date: { gte: range.from, lte: range.to }, ...shiftWhere },
        select: {
          id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, capacity: true, displayOrder: true,
          contactName: true, contactPhone: true,
          // Confirmed people only: check-in and absence apply to them (#399, #1141), as on the registrations list.
          registrations: {
            where: { status: "active" },
            select: { id: true, phone: true, checkedInAt: true, attendanceStatus: true, volunteer: { select: { firstName: true, lastName: true, phone: true } } },
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
        attendanceStatus: r.attendanceStatus ?? null,
      }))
      .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr")),
  }))
  const clock = now.toLocaleTimeString("fr-CH", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  const baseEvent: DayOfEventBase = { id: event.id, startDate: event.startDate, endDate: event.endDate }
  // Present only when selected above: the role's page leaves these columns unread.
  const registration = event as Partial<DayOfRegistrationWindow>
  const loadedEvent: DayOfEventBase & Partial<DayOfRegistrationWindow> = withRegistrationWindow
    ? {
        ...baseEvent,
        publicStatus: registration.publicStatus!,
        registrationsOpen: registration.registrationsOpen!,
        registrationOpensAt: registration.registrationOpensAt ?? null,
        registrationClosesAt: registration.registrationClosesAt ?? null,
        overlapsAllowed: registration.overlapsAllowed ?? false,
      }
    : baseEvent
  return {
    event: loadedEvent as DayOfLoaded["event"],
    timeZone,
    board: dayOfBoard(shifts, now, timeZone),
    today: localDay(now, timeZone),
    refreshedAt: fmtHour(clock),
  }
}
