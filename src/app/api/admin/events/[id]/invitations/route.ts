// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { memberInvitePayload } from "@/lib/notification-helpers"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import { INVITE_EMAIL_KEY_PREFIX, OUTSTANDING_OUTBOX_STATUSES, RESEND_GUARD_MS, SEND_TRANSACTION_OPTIONS, inviteEmailDedupeKey, invitesWithEmailOutstanding, sendCutoff } from "@/lib/invitation-sending"
import { adminActor, logEvent } from "@/lib/event-log"
import { z } from "zod"
import { randomBytes } from "crypto"
import { linkToken } from "@/lib/token-vault"
import { validationError } from "@/lib/api-error"
import { inviteState, inviteStateCounts } from "@/lib/invite-state"

const postSchema = z.object({
  volunteerIds: z.array(z.string()).min(1).max(500),
  message: z.string().max(500).optional(),
})

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params

  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  const invites = await db.memberInvite.findMany({
    where: { eventId },
    include: {
      volunteer: {
        select: { id: true, firstName: true, lastName: true, email: true, tags: true, active: true },
      },
    },
    orderBy: { sentAt: "desc" },
  })

  // Pull the active registrations for the same volunteers on this event so
  // the UI can show "registered" vs "no answer".
  const volunteerIds = invites.map((i) => i.volunteerId)
  const volunteerEmails = invites
    .map((i) => i.volunteer.email)
    .filter((e): e is string => !!e)

  const registrationsByEmail = volunteerEmails.length
    ? await db.registration.findMany({
        where: {
          eventId,
          status: "active",
          volunteer: { email: { in: volunteerEmails } },
        },
        include: {
          volunteer: { select: { email: true } },
          shift: { select: { id: true, label: true, roleName: true, startTime: true, endTime: true } },
        },
      })
    : []

  const regsByEmail = new Map<string, typeof registrationsByEmail>()
  for (const r of registrationsByEmail) {
    const key = r.volunteer.email
    if (!key) continue
    if (!regsByEmail.has(key)) regsByEmail.set(key, [])
    regsByEmail.get(key)!.push(r)
  }

  const hasActiveRegistration = (i: (typeof invites)[number]) => !!i.volunteer.email && (regsByEmail.get(i.volunteer.email)?.length ?? 0) > 0
  const summary = inviteStateCounts(invites.map((i) => ({ declinedAt: i.declinedAt, hasActiveRegistration: hasActiveRegistration(i) })))

  return NextResponse.json({
    summary,
    invites: invites.map((i) => ({
      id: i.id,
      sentAt: i.sentAt,
      usedAt: i.usedAt,
      declinedAt: i.declinedAt,
      state: inviteState({ declinedAt: i.declinedAt, hasActiveRegistration: hasActiveRegistration(i) }),
      volunteer: i.volunteer,
      registrations:
        i.volunteer.email
          ? (regsByEmail.get(i.volunteer.email) ?? []).map((r) => ({
              shiftId: r.shift.id,
              label: r.shift.label,
              roleName: r.shift.roleName,
              startTime: r.shift.startTime,
              endTime: r.shift.endTime,
            }))
          : [],
    })),
    volunteerIds,
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params
  const body = await req.json()
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)

  const event = await db.event.findFirst({
    where: { id: eventId },
    include: { organization: { select: { name: true, slug: true } } },
  })
  if (!event) return NextResponse.json({ error: "Événement non trouvé" }, { status: 404 })

  // Only consider volunteers that belong to this org.
  const volunteers = await db.volunteer.findMany({
    where: { id: { in: parsed.data.volunteerIds }, active: true },
  })

  if (volunteers.length === 0) {
    return NextResponse.json({ error: "Aucun membre valide à inviter" }, { status: 400 })
  }

  const now = new Date()
  const eventDate = event.startDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
  const guardCutoff = sendCutoff(now, RESEND_GUARD_MS)
  const ids = volunteers.map((v) => v.id)
  const byId = new Map(volunteers.map((v) => [v.id, v]))

  // Through the outbox (#1105): over a sending limit the emails wait and leave in waves instead of
  // failing, and each one shows in « Emails envoyés ». New invitations, the claim of the re-sent
  // ones and their emails commit together.
  const { created, recentlySkipped, outboxIds } = await db.$transaction(async (tx) => {
    // Clear tokens only in memory (the email needs them); the DB keeps hash + encrypted copy (#290).
    // skipDuplicates: an invitation created meanwhile (a double click) is kept, and treated as existing.
    const tokens = new Map(ids.map((id) => [id, randomBytes(24).toString("hex")]))
    const created = await tx.memberInvite.createManyAndReturn({
      data: ids.map((volunteerId) => ({ eventId, volunteerId, ...linkToken.data(tokens.get(volunteerId)!) })),
      skipDuplicates: true,
      select: { id: true, volunteerId: true },
    })
    const createdIds = new Set(created.map((c) => c.volunteerId))
    // Already invited and reachable: a member without an address gets nothing, and isn't claimed.
    const existingIds = ids.filter((id) => !createdIds.has(id) && byId.get(id)!.email)
    // Someone already invited gets the invitation again, as before, unless it went less than
    // RESEND_GUARD_MS ago or is still waiting in the outbox: a double click or a retried request
    // never emails them twice.
    const outstanding = existingIds.length === 0 ? new Set<string>() : invitesWithEmailOutstanding((await tx.notificationOutbox.findMany({
      where: { organizationId: event.organizationId, status: { in: [...OUTSTANDING_OUTBOX_STATUSES] }, dedupeKey: { startsWith: INVITE_EMAIL_KEY_PREFIX } },
      select: { dedupeKey: true },
    })).map((r) => r.dedupeKey))
    const resent = existingIds.length === 0 ? [] : await tx.memberInvite.updateManyAndReturn({
      where: {
        eventId,
        volunteerId: { in: existingIds },
        id: { notIn: [...outstanding] },
        sentAt: { lt: guardCutoff },
        OR: [{ lastRemindedAt: null }, { lastRemindedAt: { lt: guardCutoff } }],
      },
      data: { lastRemindedAt: now },
      select: { id: true, volunteerId: true, ...linkToken.select },
    })
    const toEmail = [
      ...created.map((c) => ({ id: c.id, volunteerId: c.volunteerId, token: tokens.get(c.volunteerId)! })),
      ...resent.map((r) => ({ id: r.id, volunteerId: r.volunteerId, token: linkToken.reveal(r) })),
    ]
    const payloads = toEmail.flatMap((invite) => {
      const volunteer = byId.get(invite.volunteerId)!
      if (!volunteer.email) return []
      return [memberInvitePayload({
        to: volunteer.email,
        memberName: volunteer.firstName,
        organizationName: event.organization.name,
        eventTitle: event.title,
        eventDate,
        eventLocation: event.location,
        orgSlug: event.organization.slug,
        eventSlug: event.slug,
        message: parsed.data.message ?? null,
        token: invite.token,
        volunteerId: volunteer.id,
        organizationId: event.organizationId,
      }, inviteEmailDedupeKey(invite.id, now))]
    })
    const outboxIds = await enqueueNotifications(payloads, tx, { organizationId: event.organizationId })
    const recentlySkipped = existingIds.length - resent.length
    return { created, recentlySkipped, outboxIds }
  }, SEND_TRANSACTION_OPTIONS)
  deliverAfterResponse(outboxIds)

  for (const invite of created) {
    await logEvent({
      eventId,
      actor: adminActor(guard.session),
      action: "memberinvite.sent",
      entityType: "MemberInvite",
      entityId: invite.id,
    })
  }

  return NextResponse.json({
    invitedNew: created.length,
    skippedExisting: volunteers.length - created.length,
    emailsQueued: outboxIds.length,
    // Kept for a page loaded before this version: it now means « queued ».
    emailsSent: outboxIds.length,
    recentlySkipped,
    membersWithoutEmail: volunteers.filter((v) => !v.email).length,
  }, { status: 201 })
}
