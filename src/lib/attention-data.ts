// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { leaderRoleNamesOf } from "./leader-scope"
import type { OrgScopedPrisma } from "./prisma-org"
import { attentionItems, INVITE_NUDGE_DAYS, type AttentionItem } from "./attention"
import { orgTimeZone } from "./time-zone"
import { workloadByPerson, workloadModeOf } from "./workload-view"
import { selectInvitedWithoutShift } from "./targeted-message"
import { loadOrganizationsWithNewAddressesToVerify } from "./delivery-summary-data"
import { daysAgo, RETENTION_DAYS } from "./retention"
import { isMilestoneOverdue } from "./milestones"

/** The workload facts of one event (#465, #1171): who is counted, and in which mode. */
function workloadAttention(e: { registrations: { volunteerId: string; status: string; shift: { id: string; date: Date; startTime: string; endTime: string } }[]; organization: { timeZone: string | null }; workloadProtectionEnabled: boolean; workloadPolicy: unknown }) {
  const mode = workloadModeOf(e, orgTimeZone(e.organization))
  return { overloadedVolunteers: workloadByPerson(e.registrations, mode).size, workloadMode: mode.kind }
}

/** Facts for « Ce qui demande votre attention » (#372), read with the organization-scoped client;
 * with `eventId`, one event's only (its overview page's « À traiter »).
 * `organizationId` is also needed as such (not just through `db`): DeliveryOutcome isn't a tenant
 * model of the org-scoped client (#598), so its own loader takes the id explicitly (#599). */
export async function loadAttention(db: OrgScopedPrisma, organizationId: string, now: Date = new Date(), options: { eventId?: string } = {}): Promise<AttentionItem[]> {
  const { eventId } = options
  const inviteCutoff = new Date(now.getTime() - INVITE_NUDGE_DAYS * 24 * 60 * 60 * 1000)
  const [events, offers, addressSummary] = await Promise.all([
    db.event.findMany({
      where: { publicStatus: "published", ...(eventId ? { id: eventId } : {}) },
      select: {
        id: true, title: true, startDate: true, endDate: true,
        shifts: {
          where: { status: { not: "cancelled" } },
          select: { date: true, capacity: true, minVolunteers: true, roleName: true, sectorId: true, updatedAt: true, _count: { select: { registrations: { where: { status: "active" } } } } },
        },
        sectorLeaders: { select: { roleName: true, sectorId: true } },
        sectors: { select: { id: true, archivedAt: true } },
        // `dueDate < now` only narrows the read: a milestone is late once its due day is over in
        // the organisation's zone (isMilestoneOverdue, the event page's rule too, #985).
        milestones: {
          where: { done: false, dueDate: { lt: now } },
          orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
          select: { title: true, dueDate: true, done: true, owner: { select: { name: true } } },
        },
        // Invited more than INVITE_NUDGE_DAYS ago; those with a confirmed shift or who declined
        // are left out below (#481, #558).
        memberInvites: { where: { sentAt: { lt: inviteCutoff } }, select: { volunteerId: true, sentAt: true, declinedAt: true, volunteer: { select: { email: true } } } },
        // Firm places, and pending requests for a protected event (#1171); waitlist entries and offers
        // may never become shifts (#465).
        registrations: {
          where: { status: { in: ["active", "requested"] }, shift: { status: { not: "cancelled" } } },
          select: { volunteerId: true, status: true, shift: { select: { id: true, date: true, startTime: true, endTime: true } } },
        },
        organization: { select: { timeZone: true } },
        workloadProtectionEnabled: true,
        workloadPolicy: true,
        _count: { select: { registrations: { where: { status: "requested", shift: { status: { not: "cancelled" } } } } } },
      },
    }),
    db.registration.findMany({
      where: { status: "offered", event: { publicStatus: "published" }, ...(eventId ? { eventId } : {}) },
      select: { eventId: true, waitingExpiresAt: true },
    }),
    // Full retention window, not just the last 24h (the daily summary email's own window, #599):
    // the dashboard shows every address still "to verify", however long ago it was flagged.
    // Org-wide, not one event's: left out of an event's own list.
    eventId ? Promise.resolve([]) : loadOrganizationsWithNewAddressesToVerify(daysAgo(now, RETENTION_DAYS.deliveryOutcome), now, organizationId),
  ])

  return attentionItems({
    now,
    events: events.map((e) => ({
      id: e.id, title: e.title, startDate: e.startDate, endDate: e.endDate,
      shifts: e.shifts.map((s) => ({ date: s.date, capacity: s.capacity, minVolunteers: s.minVolunteers, roleName: s.roleName, active: s._count.registrations })),
      // A poste with its own leader or its sector's (#1169).
      leaderRoles: leaderRoleNamesOf(e.sectorLeaders, e.shifts, e.sectors),
      overdueMilestones: e.milestones
        .filter((m) => isMilestoneOverdue(m, now, orgTimeZone(e.organization)))
        .map((m) => ({ title: m.title, ownerName: m.owner?.name ?? null })),
      unansweredInvites: selectInvitedWithoutShift(e.memberInvites, e.registrations.filter((r) => r.status === "active")).length,
      ...workloadAttention(e),
      pendingRequests: e._count.registrations,
    })),
    offers: offers.map((o) => ({ eventId: o.eventId, expiresAt: o.waitingExpiresAt })),
    addressesToVerifyCount: addressSummary[0]?.members.length ?? 0,
  })
}
