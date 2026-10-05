// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { OrgScopedPrisma } from "./prisma-org"
import { LIVE_STATUSES } from "./registration-capacity"
import { reservedRoles } from "./role-reservation"
import { staffingSummary } from "./staffing"
import type { EventShiftRef, InviteRef, LiveRegistration, OpenShift, PoolMember } from "./open-shifts"

/**
 * What « Chercher des bénévoles » (#566) reads, for the page and the send alike: the event, its
 * underfilled shifts (« Où manque-t-il du monde ? », #394), the organization's members, their live
 * registrations and invitations on this event. Everything through the organization-scoped client.
 */
export async function loadOpenShiftsContext(db: OrgScopedPrisma, eventId: string) {
  const event = await db.event.findFirst({
    where: { id: eventId },
    select: {
      id: true, title: true, slug: true, organizationId: true,
      publicStatus: true, registrationsOpen: true, registrationOpensAt: true, registrationClosesAt: true,
      organization: { select: { name: true, slug: true, timeZone: true } },
      shifts: {
        where: { status: { not: "cancelled" } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        select: {
          id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, capacity: true, status: true, reservedTags: true,
          registrations: { where: { status: { in: [...LIVE_STATUSES] } }, select: { volunteerId: true, status: true } },
        },
      },
    },
  })
  if (!event) return null

  const [volunteers, invites] = await Promise.all([
    // Merged records (#600) are tombstones, not members.
    db.volunteer.findMany({
      where: { mergedIntoId: null },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true, active: true, tags: true, availabilityPeriods: true, availabilityNote: true },
    }),
    db.memberInvite.findMany({ where: { eventId }, select: { volunteerId: true, declinedAt: true } }),
  ])

  const eventShifts: EventShiftRef[] = event.shifts.map((s) => ({
    id: s.id, roleName: s.roleName, label: s.label, date: s.date.toISOString().slice(0, 10), startTime: s.startTime, endTime: s.endTime,
  }))
  const summary = staffingSummary(
    event.shifts.map((s) => ({
      id: s.id, roleName: s.roleName, label: s.label, date: s.date.toISOString().slice(0, 10),
      startTime: s.startTime, endTime: s.endTime, capacity: s.capacity, closed: s.status === "closed",
      active: s.registrations.filter((r) => r.status === "active").length,
      waiting: s.registrations.filter((r) => r.status === "waiting" || r.status === "offered").length,
      requested: s.registrations.filter((r) => r.status === "requested").length,
    })),
    [],
  )
  // Reserved roles (#470): one set of tags per role, whichever shift carries it.
  const reserved = reservedRoles(event.shifts)
  // Underfilled shifts in time order: the order the email and the picker read best in.
  const openShifts: OpenShift[] = summary.underfilled
    .map((s) => ({ id: s.id, roleName: s.roleName, label: s.label, date: s.date, startTime: s.startTime, endTime: s.endTime, placesLeft: s.missing, reservedTags: reserved.get(s.roleName) ?? [] }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.roleName.localeCompare(b.roleName, "fr"))

  const members: PoolMember[] = volunteers.map((v) => ({
    id: v.id, firstName: v.firstName, lastName: v.lastName, hasEmail: !!v.email?.trim(), active: v.active, tags: v.tags,
    availabilityPeriods: v.availabilityPeriods, availabilityNote: v.availabilityNote,
  }))
  const registrations: LiveRegistration[] = event.shifts.flatMap((s) => s.registrations.map((r) => ({ volunteerId: r.volunteerId, shiftId: s.id, status: r.status })))
  const inviteRefs: InviteRef[] = invites.map((i) => ({ volunteerId: i.volunteerId, declined: !!i.declinedAt }))
  const tags = [...new Set(volunteers.flatMap((v) => v.tags))].sort((a, b) => a.localeCompare(b, "fr"))

  return { event, eventShifts, openShifts, members, registrations, invites: inviteRefs, tags, emails: new Map(volunteers.map((v) => [v.id, v.email])) }
}
