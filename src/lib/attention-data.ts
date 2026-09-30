// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { OrgScopedPrisma } from "./prisma-org"
import { attentionItems, INVITE_NUDGE_DAYS, type AttentionItem } from "./attention"
import { orgTimeZone } from "./time-zone"
import { workloadByVolunteer } from "./workload"
import { selectInvitedWithoutShift } from "./targeted-message"

/** Facts for « Ce qui demande votre attention » (#372), read with the organization-scoped client. */
export async function loadAttention(db: OrgScopedPrisma, now: Date = new Date()): Promise<AttentionItem[]> {
  const inviteCutoff = new Date(now.getTime() - INVITE_NUDGE_DAYS * 24 * 60 * 60 * 1000)
  const [events, offers] = await Promise.all([
    db.event.findMany({
      where: { publicStatus: "published" },
      select: {
        id: true, title: true, startDate: true, endDate: true,
        shifts: {
          where: { status: { not: "cancelled" } },
          select: { date: true, capacity: true, roleName: true, _count: { select: { registrations: { where: { status: "active" } } } } },
        },
        sectorLeaders: { select: { roleName: true } },
        milestones: { where: { done: false, dueDate: { lt: now } }, select: { id: true } },
        // Invited more than INVITE_NUDGE_DAYS ago; those with a confirmed shift are left out below (#481).
        memberInvites: { where: { sentAt: { lt: inviteCutoff } }, select: { volunteerId: true, sentAt: true, volunteer: { select: { email: true } } } },
        // Firm places only: waitlist entries and offers may never become shifts (#465).
        registrations: {
          where: { status: "active", shift: { status: { not: "cancelled" } } },
          select: { volunteerId: true, status: true, shift: { select: { id: true, date: true, startTime: true, endTime: true } } },
        },
        organization: { select: { timeZone: true } },
      },
    }),
    db.registration.findMany({
      where: { status: "offered", event: { publicStatus: "published" } },
      select: { eventId: true, waitingExpiresAt: true },
    }),
  ])

  return attentionItems({
    now,
    events: events.map((e) => ({
      id: e.id, title: e.title, startDate: e.startDate, endDate: e.endDate,
      shifts: e.shifts.map((s) => ({ date: s.date, capacity: s.capacity, roleName: s.roleName, active: s._count.registrations })),
      leaderRoles: e.sectorLeaders.map((l) => l.roleName),
      overdueMilestones: e.milestones.length,
      unansweredInvites: selectInvitedWithoutShift(e.memberInvites, e.registrations).length,
      overloadedVolunteers: workloadByVolunteer(e.registrations, orgTimeZone(e.organization)).size,
    })),
    offers: offers.map((o) => ({ eventId: o.eventId, expiresAt: o.waitingExpiresAt })),
  })
}
