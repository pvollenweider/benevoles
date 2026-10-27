// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { rateLimit } from "@/lib/rate-limit"
import { render } from "@/lib/notifications/templates"
import { deliverAfterResponse, enqueueBatch } from "@/lib/notifications/outbox"
import { adminActor, logEvent } from "@/lib/event-log"
import { messagePushPayload, messageSchema, MESSAGE_RATE_LIMIT } from "@/lib/targeted-message"
import { buildTargetedMessage, sectorAudienceAvailable, SECTOR_AUDIENCE_NOT_FOUND } from "@/lib/targeted-message-build"
import { renderVariables, templateProblems } from "@/lib/message-template"
import { eventPublicUrl } from "@/lib/urls"
import { pushDeviceCount, sendTargetedPush } from "@/lib/push"
import { after } from "next/server"
import { loadAddressStatuses } from "@/lib/delivery-outcomes-data"
import { addressHash } from "@/lib/notifications/smtp-outcome"
import { env } from "@/lib/env"

/**
 * POST /api/admin/events/[id]/message (#396): a subject and a message to the volunteers of the
 * event, of a role, of a shift, or on the waitlist. `dryRun` returns the recipient count and a
 * preview rendered for the first recipient; otherwise one email per person goes through the
 * outbox and the send is logged.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard
  const { id } = await params

  const parsed = messageSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error, { useIssueMessage: true })
  const { audience, subject, message, dryRun, push } = parsed.data

  const event = await db.event.findFirst({
    where: { id },
    select: { id: true, title: true, slug: true, organizationId: true, organization: { select: { name: true, slug: true } } },
  })
  if (!event) return NextResponse.json({ error: "Événement non trouvé" }, { status: 404 })

  if (audience.kind === "shift") {
    const shift = await db.shift.findFirst({ where: { id: audience.shiftId, eventId: id }, select: { id: true } })
    if (!shift) return NextResponse.json({ error: "Créneau introuvable dans cet événement." }, { status: 400 })
  }
  if (audience.kind === "sector" && !(await sectorAudienceAvailable(db, id, audience.sectorId))) {
    return NextResponse.json({ error: SECTOR_AUDIENCE_NOT_FOUND }, { status: 400 })
  }

  const { recipients, label, declinedExcluded, sectorGone, vars, payloadFor: buildPayload } = await buildTargetedMessage(db, event, audience, subject, message)
  // Archived between the check above and this read: the same refusal, never another audience.
  if (sectorGone) return NextResponse.json({ error: SECTOR_AUDIENCE_NOT_FOUND }, { status: 400 })
  type Target = (typeof recipients)[number]

  // Template variables (#482): refused before anything is sent when unknown or out of place, then
  // replaced per recipient. The history keeps the text as written, variables included.
  const problems = templateProblems(`${subject}\n${message}`, audience.kind)
  if (problems.length > 0) return NextResponse.json({ error: problems.join(" ") }, { status: 400 })
  const payloadFor = (r: Target, batchId: string) => buildPayload(r, `message:${batchId}:${r.volunteerId}`)

  if (dryRun) {
    const preview = recipients[0]
      ? render({ ...payloadFor(recipients[0], "preview"), data: { ...payloadFor(recipients[0], "preview").data, editToken: recipients[0].editToken ? "apercu" : undefined, signupUrl: recipients[0].signupUrl ? eventPublicUrl(event.organization.slug, event.slug) : undefined } })
      : null
    // Warn only, never block (#599, owner decision 2026-10-04): how many of these recipients have
    // an address to verify, so the confirmation step can say so before sending anyway.
    const addressStatuses = await loadAddressStatuses(
      event.organizationId,
      recipients.map((r) => ({ id: r.volunteerId, addressHash: r.email ? addressHash(r.email, env.AUTH_SECRET) : null })),
    )
    const addressesToVerify = recipients.filter((r) => addressStatuses.get(r.volunteerId)?.kind === "to_verify").length
    return NextResponse.json({
      recipients: recipients.length,
      // Invited without a shift (#481): how many are only on the waitlist, to adapt the text,
      // and how many were left out because they declined (#558).
      ...(audience.kind === "invited_without_shift" ? { waitlistOnly: recipients.filter((r) => r.waitlistOnly).length, declinedExcluded } : {}),
      // Devices of these recipients that would get the push (#468); counted whatever the option.
      pushDevices: await pushDeviceCount(recipients.map((r) => r.volunteerId)),
      audience: label,
      preview: preview && { subject: preview.subject, html: preview.html },
      addressesToVerify,
    })
  }

  if (recipients.length === 0) return NextResponse.json({ error: "Personne à qui écrire dans cette sélection." }, { status: 400 })

  // Per organization, all events together: a typo'd audience or a stuck button can't flood.
  const rl = await rateLimit(`org:${organizationId}`, "targeted-message", MESSAGE_RATE_LIMIT, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de messages envoyés cette heure. Réessayez plus tard." }, { status: 429 })

  const batchId = crypto.randomUUID()
  const pushDevices = push ? await pushDeviceCount(recipients.map((r) => r.volunteerId)) : 0
  // The history row (#467) and its emails are stored together: no message without its trace.
  let historyId: string | null = null
  const outboxIds = await db.$transaction(async (tx) => {
    const history = await tx.targetedMessage.create({
      data: {
        organizationId,
        eventId: id,
        authorId: guard.session.user?.id ?? null,
        authorName: guard.session.user?.name || guard.session.user?.email || "Organisateur",
        subject,
        message,
        audienceLabel: label,
        recipientCount: recipients.length,
        pushRequested: !!push,
        pushDevices,
      },
      select: { id: true },
    })
    historyId = history.id
    // Its « envoi groupé » (#1101) too: the history row keeps the text, the batch the delivery.
    return enqueueBatch(recipients.map((r) => payloadFor(r, batchId)), tx, { organizationId, targetedMessageId: history.id, batch: { kind: "targeted_message", eventId: id, actorId: guard.session.user?.id ?? null } })
  })
  deliverAfterResponse(outboxIds)

  // The push only complements the email (#468): sent after the response, to each recipient's own
  // devices, opening their personal page (the waitlist has none: the event page). A push failure
  // never touches the emails; its outcome is counted on the history row.
  if (push && pushDevices > 0 && historyId) {
    const messageId = historyId
    const targets = recipients.map((r) => ({
      volunteerId: r.volunteerId,
      ...messagePushPayload(renderVariables(subject, vars(r)), renderVariables(message, vars(r))),
      url: r.editToken ? `/my/${r.editToken}` : r.signupUrl ? (() => { const u = new URL(r.signupUrl!); return u.pathname + u.search })() : `/${event.slug}`,
    }))
    after(() => sendTargetedPush(messageId, targets, { ...messagePushPayload(subject, message), tag: `message-${messageId}` }).then(() => undefined))
  }

  await logEvent({
    eventId: id,
    actor: adminActor(guard.session),
    action: "message.sent",
    entityType: "Event",
    entityId: id,
    changes: {
      audience: { from: null, to: label },
      recipients: { from: null, to: recipients.length },
      subject: { from: null, to: subject },
    },
  })

  return NextResponse.json({
    sent: recipients.length,
    audience: label,
    pushDevices,
    ...(audience.kind === "invited_without_shift" ? { declinedExcluded } : {}),
  })
}
