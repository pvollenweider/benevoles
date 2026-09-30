// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { rateLimit } from "@/lib/rate-limit"
import { registrationToken } from "@/lib/token-vault"
import { render } from "@/lib/notifications/templates"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import type { NotificationPayload } from "@/lib/notifications/types"
import { adminActor, logEvent } from "@/lib/event-log"
import { fmtRange } from "@/lib/gantt-utils"
import { audienceLabel, messageSchema, selectRecipients, MESSAGE_RATE_LIMIT } from "@/lib/targeted-message"

const fmtDate = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })

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
  const { audience, subject, message, dryRun } = parsed.data

  const event = await db.event.findFirst({
    where: { id },
    select: { id: true, title: true, organizationId: true, organization: { select: { name: true, slug: true } } },
  })
  if (!event) return NextResponse.json({ error: "Événement non trouvé" }, { status: 404 })

  if (audience.kind === "shift") {
    const shift = await db.shift.findFirst({ where: { id: audience.shiftId, eventId: id }, select: { id: true } })
    if (!shift) return NextResponse.json({ error: "Créneau introuvable dans cet événement." }, { status: 400 })
  }

  const regs = await db.registration.findMany({
    where: { eventId: id, status: { in: ["active", "waiting", "offered"] } },
    include: { volunteer: true, shift: true },
    orderBy: [{ shift: { date: "asc" } }, { shift: { startTime: "asc" } }],
  })
  const recipients = selectRecipients(regs, audience)

  const shiftName = audience.kind === "shift"
    ? (() => { const s = regs.find((r) => r.shiftId === audience.shiftId)?.shift; return s ? `${s.label} (${fmtDate(s.date)}, ${fmtRange(s.startTime, s.endTime)})` : undefined })()
    : undefined
  const label = audienceLabel(audience, shiftName)

  const payloadFor = (r: (typeof recipients)[number], batchId: string): NotificationPayload => ({
    kind: "targeted_message",
    dedupeKey: `message:${batchId}:${r.volunteerId}`,
    recipient: { email: r.volunteer.email, name: r.volunteer.firstName },
    data: {
      volunteerName: r.volunteer.firstName,
      organizationName: event.organization.name,
      orgSlug: event.organization.slug,
      eventTitle: event.title,
      subject,
      message,
      shifts: audience.kind === "waitlist" ? [] : r.registrations.map((x) => ({
        label: x.shift.label, date: fmtDate(x.shift.date), startTime: x.shift.startTime, endTime: x.shift.endTime,
      })),
      // The personal page only opens live confirmed registrations: a waitlist entry's link
      // would land on « introuvable », so the waitlist gets no link at all.
      editToken: audience.kind === "waitlist" ? undefined : registrationToken.reveal(r.registrations[0]),
    },
  })

  if (dryRun) {
    const preview = recipients[0]
      ? render({ ...payloadFor(recipients[0], "preview"), data: { ...payloadFor(recipients[0], "preview").data, editToken: audience.kind === "waitlist" ? undefined : "apercu" } })
      : null
    return NextResponse.json({ recipients: recipients.length, audience: label, preview: preview && { subject: preview.subject, html: preview.html } })
  }

  if (recipients.length === 0) return NextResponse.json({ error: "Personne à qui écrire dans cette sélection." }, { status: 400 })

  // Per organization, all events together: a typo'd audience or a stuck button can't flood.
  const rl = await rateLimit(`org:${organizationId}`, "targeted-message", MESSAGE_RATE_LIMIT, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de messages envoyés cette heure. Réessayez plus tard." }, { status: 429 })

  const batchId = crypto.randomUUID()
  const outboxIds = await enqueueNotifications(recipients.map((r) => payloadFor(r, batchId)), undefined, { organizationId })
  deliverAfterResponse(outboxIds)

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

  return NextResponse.json({ sent: recipients.length, audience: label })
}
