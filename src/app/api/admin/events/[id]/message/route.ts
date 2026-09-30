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
import { audienceLabel, messagePushPayload, messageSchema, selectInvitedWithoutShift, selectRecipients, MESSAGE_RATE_LIMIT } from "@/lib/targeted-message"
import { linkToken } from "@/lib/token-vault"
import { renderVariables, templateProblems } from "@/lib/message-template"
import { eventPublicUrl } from "@/lib/urls"
import { pushDeviceCount, sendTargetedPush } from "@/lib/push"
import { after } from "next/server"

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

  const regs = await db.registration.findMany({
    where: { eventId: id, status: { in: ["active", "waiting", "offered"] } },
    include: { volunteer: true, shift: true },
    orderBy: [{ shift: { date: "asc" } }, { shift: { startTime: "asc" } }],
  })
  // One entry per person to write to, whatever the audience: their shifts in it, and the link the
  // email carries (personal page, or the invitation link for invited people without a shift, #481).
  type Target = { volunteerId: string; firstName: string; email: string | null; shifts: { label: string; date: string; startTime: string; endTime: string }[]; editToken?: string; signupUrl?: string; waitlistOnly?: boolean }
  let targets: Target[]
  if (audience.kind === "invited_without_shift") {
    const invites = await db.memberInvite.findMany({
      where: { eventId: id },
      select: { volunteerId: true, sentAt: true, tokenEnc: true, tokenLegacy: true, volunteer: { select: { firstName: true, email: true } } },
    })
    targets = selectInvitedWithoutShift(invites, regs).map(({ volunteerId, invite, waitlistOnly }) => {
      const url = new URL(eventPublicUrl(event.organization.slug, event.slug))
      const link = linkToken.reveal(invite)
      if (link) url.searchParams.set("token", link)
      return { volunteerId, firstName: invite.volunteer.firstName, email: invite.volunteer.email, shifts: [], signupUrl: url.toString(), waitlistOnly }
    })
  } else {
    targets = selectRecipients(regs, audience).map((r) => ({
      volunteerId: r.volunteerId,
      firstName: r.volunteer.firstName,
      email: r.volunteer.email,
      shifts: audience.kind === "waitlist" ? [] : r.registrations.map((x) => ({
        label: x.shift.label, date: fmtDate(x.shift.date), startTime: x.shift.startTime, endTime: x.shift.endTime,
      })),
      // The personal page only opens live confirmed registrations: a waitlist entry's link
      // would land on « introuvable », so the waitlist gets no link at all.
      editToken: audience.kind === "waitlist" ? undefined : registrationToken.reveal(r.registrations[0]),
    }))
  }
  const recipients = targets

  const shiftName = audience.kind === "shift"
    ? (() => { const s = regs.find((r) => r.shiftId === audience.shiftId)?.shift; return s ? `${s.label} (${fmtDate(s.date)}, ${fmtRange(s.startTime, s.endTime)})` : undefined })()
    : undefined
  const label = audienceLabel(audience, shiftName)

  // Template variables (#482): refused before anything is sent when unknown or out of place, then
  // replaced per recipient. The history keeps the text as written, variables included.
  const problems = templateProblems(`${subject}\n${message}`, audience.kind)
  if (problems.length > 0) return NextResponse.json({ error: problems.join(" ") }, { status: 400 })
  const roleOfAudience = audience.kind === "role" ? audience.roleName : audience.kind === "shift" ? regs.find((x) => x.shiftId === audience.shiftId)?.shift.roleName : undefined
  const vars = (r: Target) => ({ prénom: r.firstName, événement: event.title, poste: roleOfAudience, créneau: shiftName })

  const payloadFor = (r: Target, batchId: string): NotificationPayload => ({
    kind: "targeted_message",
    dedupeKey: `message:${batchId}:${r.volunteerId}`,
    recipient: { email: r.email, name: r.firstName },
    data: {
      volunteerName: r.firstName,
      organizationName: event.organization.name,
      orgSlug: event.organization.slug,
      eventTitle: event.title,
      subject: renderVariables(subject, vars(r)),
      message: renderVariables(message, vars(r)),
      shifts: r.shifts,
      editToken: r.editToken,
      signupUrl: r.signupUrl,
    },
  })

  if (dryRun) {
    const preview = recipients[0]
      ? render({ ...payloadFor(recipients[0], "preview"), data: { ...payloadFor(recipients[0], "preview").data, editToken: recipients[0].editToken ? "apercu" : undefined, signupUrl: recipients[0].signupUrl ? eventPublicUrl(event.organization.slug, event.slug) : undefined } })
      : null
    return NextResponse.json({
      recipients: recipients.length,
      // Invited without a shift (#481): how many are only on the waitlist, to adapt the text.
      ...(audience.kind === "invited_without_shift" ? { waitlistOnly: recipients.filter((r) => r.waitlistOnly).length } : {}),
      // Devices of these recipients that would get the push (#468); counted whatever the option.
      pushDevices: await pushDeviceCount(recipients.map((r) => r.volunteerId)),
      audience: label,
      preview: preview && { subject: preview.subject, html: preview.html },
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
        authorName: guard.session.user?.name || guard.session.user?.email || "Administrateur",
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
    return enqueueNotifications(recipients.map((r) => payloadFor(r, batchId)), tx, { organizationId, targetedMessageId: history.id })
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

  return NextResponse.json({ sent: recipients.length, audience: label, pushDevices })
}
