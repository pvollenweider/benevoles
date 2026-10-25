// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { OrgScopedPrisma } from "./prisma-org"
import { LIVE_STATUSES } from "./registration-capacity"
import { reservedRoles } from "./role-reservation"
import { assignedOnlyRoles } from "./role-assignment"
import { spokenStaffingState, staffingStateText, staffingSummary } from "./staffing"
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
          id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, capacity: true, minVolunteers: true, status: true, reservedTags: true, minAge: true, overlapAllowed: true, assignedOnly: true,
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
      select: { id: true, firstName: true, lastName: true, email: true, active: true, tags: true, availabilityPeriods: true, availabilityNote: true, birthDate: true },
    }),
    db.memberInvite.findMany({ where: { eventId }, select: { volunteerId: true, declinedAt: true } }),
  ])

  const eventShifts: EventShiftRef[] = event.shifts.map((s) => ({
    id: s.id, roleName: s.roleName, label: s.label, date: s.date.toISOString().slice(0, 10), startTime: s.startTime, endTime: s.endTime, overlapAllowed: s.overlapAllowed,
  }))
  const summary = staffingSummary(
    event.shifts.map((s) => ({
      id: s.id, roleName: s.roleName, label: s.label, date: s.date.toISOString().slice(0, 10),
      startTime: s.startTime, endTime: s.endTime, capacity: s.capacity, minVolunteers: s.minVolunteers, closed: s.status === "closed",
      active: s.registrations.filter((r) => r.status === "active").length,
      waiting: s.registrations.filter((r) => r.status === "waiting" || r.status === "offered").length,
      requested: s.registrations.filter((r) => r.status === "requested").length,
    })),
    [],
  )
  const minAgeOf = new Map(event.shifts.map((s) => [s.id, s.minAge]))
  const overlapAllowedOf = new Map(event.shifts.map((s) => [s.id, s.overlapAllowed]))
  // Reserved roles (#470): one set of tags per role, whichever shift carries it.
  const reserved = reservedRoles(event.shifts)
  // Roles assigned by the organisation only (#1145): never proposed to members, who could not take
  // them; counted, so the page says where they went.
  const assignedOnly = assignedOnlyRoles(event.shifts)
  const assignedOnlyLeftOut = summary.underfilled.filter((s) => assignedOnly.has(s.roleName)).length
  // Underfilled shifts in time order: the order the email and the picker read best in.
  const openShifts: OpenShift[] = summary.underfilled
    .filter((s) => !assignedOnly.has(s.roleName))
    .map((s) => ({ id: s.id, roleName: s.roleName, label: s.label, date: s.date, startTime: s.startTime, endTime: s.endTime, placesLeft: s.missing, reservedTags: reserved.get(s.roleName) ?? [], minAge: minAgeOf.get(s.id) ?? null, overlapAllowed: overlapAllowedOf.get(s.id) ?? false,
      // The state against the minimum (#949), for the organizer's list only: never in the email.
      staffingState: staffingStateText(s, s.state ?? "open"), spokenStaffingState: spokenStaffingState(s, s.state ?? "open") }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.roleName.localeCompare(b.roleName, "fr"))

  const members: PoolMember[] = volunteers.map((v) => ({
    id: v.id, firstName: v.firstName, lastName: v.lastName, hasEmail: !!v.email?.trim(), active: v.active, tags: v.tags,
    availabilityPeriods: v.availabilityPeriods, availabilityNote: v.availabilityNote,
    birthDate: v.birthDate ? v.birthDate.toISOString().slice(0, 10) : null,
  }))
  const registrations: LiveRegistration[] = event.shifts.flatMap((s) => s.registrations.map((r) => ({ volunteerId: r.volunteerId, shiftId: s.id, status: r.status })))
  const inviteRefs: InviteRef[] = invites.map((i) => ({ volunteerId: i.volunteerId, declined: !!i.declinedAt }))
  const tags = [...new Set(volunteers.flatMap((v) => v.tags))].sort((a, b) => a.localeCompare(b, "fr"))

  return { event, eventShifts, openShifts, assignedOnlyLeftOut, members, registrations, invites: inviteRefs, tags, emails: new Map(volunteers.map((v) => [v.id, v.email])) }
}
