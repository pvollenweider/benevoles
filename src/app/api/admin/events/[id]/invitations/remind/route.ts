// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { memberInvitePayload } from "@/lib/notification-helpers"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import { adminActor, logEvent } from "@/lib/event-log"
import { z } from "zod"
import { linkToken } from "@/lib/token-vault"
import { validationError } from "@/lib/api-error"
import { REMIND_COOLDOWN_MS, SEND_TRANSACTION_OPTIONS, emailedWithin, inviteEmailDedupeKey, sendCutoff } from "@/lib/invitation-sending"
import { outstandingInviteEmails } from "@/lib/invitation-outbox"

const schema = z.object({
  message: z.string().max(500).optional(),
})

/**
 * Re-sends the invitation email to every invited volunteer who has not yet registered to the
 * event. Reuses the existing token (no duplicate row). Through the outbox (#1105): over a sending
 * limit the emails wait and leave in waves, and each one shows in « Emails envoyés ». Anyone
 * invited or reminded less than 48 h ago is skipped (src/lib/invitation-sending.ts), claimed with
 * a conditional update in the transaction that queues the emails, so a double click or two
 * reminders close together never email the same person twice.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id: eventId } = await params
  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) return validationError(parsed.error)

  const event = await db.event.findFirst({
    where: { id: eventId },
    include: { organization: { select: { name: true, slug: true } } },
  })
  if (!event) return NextResponse.json({ error: "Événement non trouvé" }, { status: 404 })

  const invites = await db.memberInvite.findMany({
    where: { eventId },
    include: { volunteer: true },
  })

  const volunteerEmails = invites
    .map((i) => i.volunteer.email)
    .filter((e): e is string => !!e)

  const registeredEmails = new Set(
    volunteerEmails.length
      ? (
          await db.registration.findMany({
            where: {
              eventId,
              status: "active",
              volunteer: { email: { in: volunteerEmails } },
            },
            select: { volunteer: { select: { email: true } } },
          })
        ).map((r) => r.volunteer.email).filter((e): e is string => !!e)
      : [],
  )

  const now = new Date()
  // Left out because they answered « pas disponible » (#558), counted apart from the result.
  let declinedSkipped = 0
  // Invited or reminded less than 48 h ago (#1105).
  let recentlySkipped = 0
  const candidates: typeof invites = []
  for (const invite of invites) {
    const v = invite.volunteer
    if (!v.email || !v.active) continue
    if (registeredEmails.has(v.email)) continue
    if (invite.declinedAt) { declinedSkipped++; continue }
    if (emailedWithin(invite, now, REMIND_COOLDOWN_MS)) { recentlySkipped++; continue }
    candidates.push(invite)
  }

  const eventDate = event.startDate.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })
  const cutoff = sendCutoff(now, REMIND_COOLDOWN_MS)
  const { outboxIds, claimed } = candidates.length === 0
    ? { outboxIds: [] as string[], claimed: 0 }
    : await db.$transaction(async (tx) => {
        // An earlier invitation email still waiting in the outbox: no second copy behind it.
        const outstanding = await outstandingInviteEmails(tx, event.organizationId, new Map(candidates.map((i) => [i.id, i.volunteer.email])))
        // The claim: only rows still last emailed before the cutoff. A concurrent reminder that got
        // there first has moved them past it, and they are left out here.
        const mine = new Set(
          (await tx.memberInvite.updateManyAndReturn({
            where: {
              id: { in: candidates.filter((i) => !outstanding.has(i.id)).map((i) => i.id) },
              sentAt: { lt: cutoff },
              OR: [{ lastRemindedAt: null }, { lastRemindedAt: { lt: cutoff } }],
            },
            data: { lastRemindedAt: now },
            select: { id: true },
          })).map((r) => r.id),
        )
        const payloads = candidates.filter((i) => mine.has(i.id)).map((invite) => memberInvitePayload({
          to: invite.volunteer.email!,
          memberName: invite.volunteer.firstName,
          organizationName: event.organization.name,
          eventTitle: event.title,
          eventDate,
          eventLocation: event.location,
          orgSlug: event.organization.slug,
          eventSlug: event.slug,
          message: parsed.data.message ?? null,
          token: linkToken.reveal(invite),
          volunteerId: invite.volunteer.id,
          organizationId: event.organizationId,
        }, inviteEmailDedupeKey(invite.id, now)))
        const ids = await enqueueNotifications(payloads, tx, { organizationId: event.organizationId })
        return { outboxIds: ids, claimed: mine.size }
      }, SEND_TRANSACTION_OPTIONS)
  recentlySkipped += candidates.length - claimed
  deliverAfterResponse(outboxIds)

  if (outboxIds.length > 0) {
    // One entry per reminder batch, with its count: the confirmation says the action is logged.
    await logEvent({
      eventId,
      actor: adminActor(guard.session),
      action: "memberinvite.reminded",
      entityType: "Event",
      entityId: eventId,
      changes: { recipients: { from: null, to: outboxIds.length } },
    })
  }

  // `sent` kept for a page loaded before this version: it now means « queued ».
  return NextResponse.json({ queued: outboxIds.length, sent: outboxIds.length, declinedSkipped, recentlySkipped })
}
