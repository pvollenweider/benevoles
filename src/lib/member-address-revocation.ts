// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { generateToken } from "./utils"
import { linkToken, registrationToken } from "./token-vault"
import { enqueueNotifications, openPayload } from "./notifications/outbox"
import type { NotificationPayload } from "./notifications/types"
import { memberInvitePayload } from "./notification-helpers"
import { inviteEmailDedupeKey } from "./invitation-sending"
import { hashToken } from "./token-hash"
import { MEMBER_ADDRESS_CHANGED_REASON } from "./outbox-address-changed-reason"
import { LIVE_STATUSES, type Tx } from "./registration-capacity"
import { linksToResend, memberLinkPayload } from "./member-address-change"
import { endSwapsIn } from "./shift-swap-server"

/**
 * The renewal of a member's links when an organiser corrects their address (rules in
 * src/lib/member-address-change.ts), inside the transaction of the change, the Volunteer row
 * locked by the caller:
 *  1. every registration and every invitation of the member gets a new token: the links emailed
 *     to the old address (personal page, calendar subscription derived from it, invitation) stop
 *     working, whatever their status, as in the bulk regeneration (#542);
 *  2. the member's push subscriptions go: they were set up with one of those links, and a
 *     reminder push carries the personal link;
 *  3. the emails still waiting for the member, or for the old address without a member, are
 *     cancelled, not redirected (the delivery check, src/lib/outbox-recipient-check.ts, catches
 *     one queued concurrently);
 *  4. the new links are queued for the new address, in the same transaction: the personal link of
 *     each upcoming event where the member holds a place, and each invitation still unanswered.
 * Returns what changed, and the outbox ids to deliver once the transaction has committed.
 */
export async function renewMemberLinks(tx: Tx, input: {
  organizationId: string
  volunteer: { id: string; firstName: string; lastName: string; active: boolean }
  oldEmail: string
  newEmail: string | null
  now: Date
}): Promise<{ registrations: number; invites: number; pushSubscriptions: number; cancelled: number; outboxIds: string[] }> {
  const { organizationId, volunteer, newEmail, now } = input
  const eventSelect = {
    select: { title: true, slug: true, startDate: true, endDate: true, location: true, organizationId: true, organization: { select: { name: true, slug: true } } },
  } as const
  const registrations = await tx.registration.findMany({
    where: { volunteerId: volunteer.id },
    select: { id: true, eventId: true, status: true, createdAt: true, editTokenHash: true, event: eventSelect },
  })
  const invites = await tx.memberInvite.findMany({
    where: { volunteerId: volunteer.id },
    select: { id: true, eventId: true, usedAt: true, declinedAt: true, tokenHash: true, event: eventSelect },
  })

  // 1. New tokens, kept in clear for the emails below (sealed in the outbox payload).
  const tokens = new Map<string, string>()
  for (const r of registrations) {
    const token = generateToken()
    tokens.set(r.id, token)
    await tx.registration.update({ where: { id: r.id }, data: registrationToken.data(token) })
  }
  for (const i of invites) {
    const token = generateToken()
    tokens.set(i.id, token)
    await tx.memberInvite.update({ where: { id: i.id }, data: linkToken.data(token) })
  }

  // 2. Devices subscribed with an old link.
  const { count: pushSubscriptions } = await tx.pushSubscription.deleteMany({ where: { volunteerId: volunteer.id } })

  // 3. Before queuing anything new (the new emails are pending rows of this member too): the
  // pending emails of the member, by member id, or by one of the old links for a row without one.
  // Never by address alone: the same person may also be an administrator, whose own emails
  // (password reset, digests) have nothing to do with the member's address.
  const oldLinks = { registrationHashes: new Set(registrations.map((r) => r.editTokenHash)), inviteHashes: new Set(invites.map((i) => i.tokenHash)) }
  const candidates = await tx.notificationOutbox.findMany({ where: { organizationId, status: "pending" }, select: { id: true, payload: true } })
  const toCancel: string[] = []
  for (const row of candidates) {
    let payload: NotificationPayload
    try { payload = openPayload(row.payload) } catch { continue } // unreadable (key rotated away): left to its own retry path
    if (memberLinkPayload(payload, volunteer.id, oldLinks, hashToken)) toCancel.push(row.id)
  }
  if (toCancel.length) {
    await tx.notificationOutbox.updateMany({ where: { id: { in: toCancel }, status: "pending" }, data: { status: "cancelled", lastError: MEMBER_ADDRESS_CHANGED_REASON } })
  }
  const cancelled = toCancel

  // 4. The new links, to the new address.
  const plan = linksToResend({
    newEmail,
    active: volunteer.active,
    registrations: registrations.map((r) => ({ id: r.id, eventId: r.eventId, status: r.status, createdAt: r.createdAt, eventEndDate: r.event.endDate })),
    invites: invites.map((i) => ({ id: i.id, eventId: i.eventId, usedAt: i.usedAt, declinedAt: i.declinedAt, eventEndDate: i.event.endDate })),
  }, now)
  const payloads: NotificationPayload[] = []
  const name = `${volunteer.firstName} ${volunteer.lastName}`.trim()
  if (newEmail) {
    for (const r of registrations.filter((x) => plan.registrationIds.includes(x.id))) {
      payloads.push({
        kind: "registration_link_resend",
        organizationId: r.event.organizationId,
        volunteerId: volunteer.id,
        recipient: { email: newEmail, name },
        data: { volunteerName: name, eventTitle: r.event.title, orgSlug: r.event.organization.slug, editToken: tokens.get(r.id)! },
      })
    }
    for (const i of invites.filter((x) => plan.inviteIds.includes(x.id))) {
      payloads.push(memberInvitePayload({
        to: newEmail,
        memberName: volunteer.firstName,
        organizationName: i.event.organization.name,
        eventTitle: i.event.title,
        eventDate: i.event.startDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
        eventLocation: i.event.location,
        orgSlug: i.event.organization.slug,
        eventSlug: i.event.slug,
        message: null,
        token: tokens.get(i.id)!,
        volunteerId: volunteer.id,
        organizationId: i.event.organizationId,
      }, inviteEmailDedupeKey(i.id, now)))
    }
  }
  const outboxIds = payloads.length ? await enqueueNotifications(payloads, tx) : []
  const resentEvents = registrations.filter((r) => plan.registrationIds.includes(r.id)).map((r) => r.eventId)
  if (resentEvents.length) {
    await tx.registration.updateMany({
      where: { volunteerId: volunteer.id, eventId: { in: resentEvents }, status: { in: [...LIVE_STATUSES] } },
      data: { linkEmailedAt: now },
    })
  }
  if (plan.inviteIds.length && newEmail) {
    await tx.memberInvite.updateMany({ where: { id: { in: plan.inviteIds } }, data: { lastRemindedAt: now } })
  }

  // An agreement given from an old link is not renewed by itself (#1174 E18): swap requests end.
  await endSwapsIn(tx, { volunteerIds: [volunteer.id] }, "link_revoked", { type: "system" }, now)

  return { registrations: registrations.length, invites: invites.length, pushSubscriptions, cancelled: cancelled.length, outboxIds }
}
