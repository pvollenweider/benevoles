// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { OrgScopedPrisma } from "./prisma-org"
import { hasUpcomingShift, practicalInfoGaps, reviewChecks, type ReviewCheck } from "./event-wizard"
import { parseNotificationSettings } from "./notification-settings"
import { LIVE_STATUSES } from "./registration-capacity"
import { staffingSummary } from "./staffing"
import { orgTimeZone } from "./time-zone"

/**
 * The pre-publication checklist of an event (#401), read with the organisation-scoped client:
 * shown by the review page (step 3 of the creation) and by the overview while the event is a draft.
 */
export async function loadReviewChecks(db: OrgScopedPrisma, id: string, now: Date = new Date()) {
  const event = await db.event.findFirst({
    where: { id },
    select: {
      id: true, title: true, slug: true, startDate: true, endDate: true, location: true, confirmationMessage: true, publicInstructions: true, publicStatus: true,
      latitude: true, longitude: true, dayContactName: true, dayContactPhone: true, remindersEnabled: true, registrationsOpen: true, registrationOpensAt: true, registrationClosesAt: true,
      shiftRosterEnabled: true,
      organization: { select: { slug: true, timeZone: true, publicationApprovedAt: true, notificationSettings: true } },
      shifts: {
        where: { status: { not: "cancelled" } },
        select: {
          id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, capacity: true, status: true,
          locationDetails: true, contactName: true, contactPhone: true, latitude: true, longitude: true,
          registrations: { where: { status: { in: [...LIVE_STATUSES] } }, select: { status: true } },
        },
      },
      _count: { select: { sectorLeaders: true } },
    },
  })
  if (!event) return null

  const timeZone = orgTimeZone(event.organization)
  const shifts = event.shifts.map((s) => ({
    id: s.id, roleName: s.roleName, label: s.label, date: s.date.toISOString().slice(0, 10),
    startTime: s.startTime, endTime: s.endTime, capacity: s.capacity, closed: s.status === "closed",
    active: s.registrations.filter((r) => r.status === "active").length,
    waiting: s.registrations.filter((r) => r.status === "waiting" || r.status === "offered").length,
    requested: s.registrations.filter((r) => r.status === "requested").length,
  }))
  const checks: ReviewCheck[] = reviewChecks({
    id: event.id, title: event.title,
    startDate: event.startDate.toISOString().slice(0, 10), endDate: event.endDate.toISOString().slice(0, 10),
    location: event.location, confirmationMessage: event.confirmationMessage, publicInstructions: event.publicInstructions,
    publicStatus: event.publicStatus,
    shiftCount: event.shifts.length,
    roleCount: new Set(event.shifts.map((s) => s.roleName)).size,
    capacity: event.shifts.reduce((n, s) => n + s.capacity, 0),
    leaderCount: event._count.sectorLeaders,
    practicalInfo: practicalInfoGaps(event.shifts, event),
    registration: { registrationsOpen: event.registrationsOpen, opensAt: event.registrationOpensAt, closesAt: event.registrationClosesAt, timeZone, now },
    reminders: {
      eventEnabled: event.remindersEnabled,
      organization: parseNotificationSettings(event.organization.notificationSettings).reminders,
      upcomingShifts: hasUpcomingShift(shifts, now, timeZone),
    },
    // Leaders don't matter to the coverage line: only the totals and the incomplete shifts are read.
    coverage: staffingSummary(shifts, []),
  })
  return { event, checks }
}
