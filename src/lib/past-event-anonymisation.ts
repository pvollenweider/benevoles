// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Anonymisation of past events (#813, phase 2), run by the nightly cleanup with
 * `PAST_EVENT_RETENTION=enforce`. For each event ended more than 3 years ago:
 * 1. its registrations lose their comment and phone, get a personal link nobody is sent, and move
 *    to an anonymous record (« Bénévole effacé », no email or phone, `erasedAt` set): one per member
 *    and per batch, with no link back to the member, so the hours, the attendance and the distinct
 *    volunteers of the event summary (#557) stay right;
 * 2. its answers to questions, member invites and sector leaders are deleted;
 * 3. its log entries made by a volunteer point to that anonymous record instead;
 * 4. the event itself stays (title, dates, shifts, totals), marked `personalDataAnonymizedAt`.
 * The member records stay: a member whose whole history was old is listed to the organisation as
 * « sans participation depuis 3 ans », to deactivate or erase if it wants, never erased here.
 *
 * Server only (Prisma, node:crypto through the token vault): the raw client, as every scheduled
 * job, so the work never counts as the organisation's own activity (#811). The rules are in
 * src/lib/past-event-retention.ts.
 */

import { prisma } from "./prisma"
import { generateToken } from "./utils"
import { registrationToken } from "./token-vault"
import { ERASED_REGISTRATION_DATA, erasedVolunteerData } from "./member-erasure"
import { pastEventCutoff, type PastEventBatchCounts } from "./past-event-retention"
import { loadSummaryRecipients } from "./delivery-summary-data"
import { deliverAfterResponse, enqueueNotifications } from "./notifications/outbox"
import { orgTimeZone } from "./time-zone"

/** Events of an organisation the rule concerns today: ended before the cutoff, not done yet. */
export function concernedEventsWhere(organizationId: string, now: Date) {
  return { organizationId, endDate: { lt: pastEventCutoff(now) }, personalDataAnonymizedAt: null }
}

/** Organisations the rule may act on: active and not suspended (a suspended one keeps its data for the inquiry). */
export async function loadPastEventOrganizations(now: Date) {
  const orgs = await prisma.organization.findMany({
    where: { active: true, suspendedAt: null, events: { some: { endDate: { lt: pastEventCutoff(now) }, personalDataAnonymizedAt: null } } },
    select: { id: true, name: true, pastEventNoticeAt: true, pastEventBatchAt: true },
    orderBy: { name: "asc" },
  })
  const counts = await prisma.event.groupBy({
    by: ["organizationId"],
    where: { organizationId: { in: orgs.map((o) => o.id) }, endDate: { lt: pastEventCutoff(now) }, personalDataAnonymizedAt: null },
    _count: { _all: true },
  })
  const byOrg = new Map(counts.map((c) => [c.organizationId, c._count._all]))
  return orgs.map((o) => ({ ...o, concernedEvents: byOrg.get(o.id) ?? 0 }))
}

/**
 * Anonymises one event, in one transaction. `anonymousIds` maps a member to the anonymous record
 * of this batch: shared across the batch's events, so a member who came to two old events is one
 * anonymous volunteer in both. Registrations already on an erased record (an erased member, or an
 * earlier batch) are left as they are: nothing identifies them any more.
 */
export async function anonymisePastEvent(
  eventId: string,
  organizationId: string,
  anonymousIds: Map<string, string>,
  now: Date,
): Promise<Omit<PastEventBatchCounts, "events">> {
  return prisma.$transaction(async (tx) => {
    const registrations = await tx.registration.findMany({
      where: { eventId, volunteer: { erasedAt: null } },
      select: { id: true, volunteerId: true },
    })
    let anonymousRecords = 0
    for (const volunteerId of new Set(registrations.map((r) => r.volunteerId))) {
      if (anonymousIds.has(volunteerId)) continue
      const anon = await tx.volunteer.create({ data: { organizationId, ...erasedVolunteerData(now) }, select: { id: true } })
      anonymousIds.set(volunteerId, anon.id)
      anonymousRecords++
    }
    for (const r of registrations) {
      await tx.registration.update({
        where: { id: r.id },
        data: { volunteerId: anonymousIds.get(r.volunteerId)!, ...ERASED_REGISTRATION_DATA, ...registrationToken.data(generateToken()) },
      })
    }
    // The person's own log entries (a cancellation from their link) would still name them.
    for (const volunteerId of new Set(registrations.map((r) => r.volunteerId))) {
      await tx.eventLog.updateMany({ where: { eventId, actorType: "volunteer", actorId: volunteerId }, data: { actorId: anonymousIds.get(volunteerId)! } })
    }
    const answers = await tx.questionAnswer.deleteMany({ where: { eventId } })
    const invites = await tx.memberInvite.deleteMany({ where: { eventId } })
    const sectorLeaders = await tx.sectorLeader.deleteMany({ where: { eventId } })
    await tx.event.update({ where: { id: eventId }, data: { personalDataAnonymizedAt: now } })
    const counts = { registrations: registrations.length, anonymousRecords, answers: answers.count, invites: invites.count, sectorLeaders: sectorLeaders.count }
    await tx.eventLog.create({
      data: {
        eventId,
        actorType: "system",
        actorId: null,
        action: "event.personal_data_anonymized",
        entityType: "Event",
        entityId: eventId,
        changes: { registrations: { from: counts.registrations, to: counts.registrations }, answers: { from: counts.answers, to: 0 }, invites: { from: counts.invites, to: 0 }, sectorLeaders: { from: counts.sectorLeaders, to: 0 } },
      },
    })
    return counts
  }, { maxWait: 10_000, timeout: 60_000 })
}

/** One monthly batch: every concerned event of the organisation, then the batch date. */
export async function runPastEventBatch(organizationId: string, now: Date): Promise<PastEventBatchCounts> {
  const events = await prisma.event.findMany({ where: concernedEventsWhere(organizationId, now), select: { id: true }, orderBy: { endDate: "asc" } })
  const anonymousIds = new Map<string, string>()
  const total: PastEventBatchCounts = { events: 0, registrations: 0, anonymousRecords: 0, answers: 0, invites: 0, sectorLeaders: 0 }
  for (const e of events) {
    const c = await anonymisePastEvent(e.id, organizationId, anonymousIds, now)
    total.events++
    total.registrations += c.registrations
    total.anonymousRecords += c.anonymousRecords
    total.answers += c.answers
    total.invites += c.invites
    total.sectorLeaders += c.sectorLeaders
  }
  await prisma.organization.update({ where: { id: organizationId }, data: { pastEventBatchAt: now } })
  return total
}

/**
 * The one notice to the organisation's active administrators, 30 days before its first batch,
 * then `pastEventNoticeAt`. Set even when nobody can receive it (no active administrator): the
 * personal data is not kept longer for want of a reader.
 */
export async function sendPastEventNotice(
  organizationId: string,
  observation: { registrations: number; membersOnlyOld: number } | null,
  firstBatchOn: Date,
  now: Date,
): Promise<void> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { name: true, timeZone: true } })
  const events = await prisma.event.findMany({
    where: concernedEventsWhere(organizationId, now),
    select: { title: true, endDate: true },
    orderBy: { endDate: "desc" },
  })
  const recipients = await loadSummaryRecipients(organizationId)
  const data = {
    organizationName: org.name,
    firstBatchOn: firstBatchOn.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: orgTimeZone(org) }),
    // An event's dates are calendar days stored at midnight UTC.
    events: events.map((e) => ({ title: e.title, ended: e.endDate.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) })),
    registrations: observation?.registrations ?? 0,
    membersOnlyOld: observation?.membersOnlyOld ?? 0,
  }
  const ids = await prisma.$transaction(async (tx) => {
    const outboxIds = await enqueueNotifications(
      recipients.map((r) => ({
        kind: "past_event_notice" as const,
        recipient: { email: r.email, name: r.name },
        organizationId,
        dedupeKey: `past_event_notice:${organizationId}:${r.email}`,
        data,
      })),
      tx,
      { organizationId },
    )
    await tx.organization.update({ where: { id: organizationId }, data: { pastEventNoticeAt: now } })
    return outboxIds
  })
  deliverAfterResponse(ids)
}
