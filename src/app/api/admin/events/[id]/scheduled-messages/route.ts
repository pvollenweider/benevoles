// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { rateLimit } from "@/lib/rate-limit"
import { adminActor, logEvent } from "@/lib/event-log"
import { MESSAGE_RATE_LIMIT } from "@/lib/targeted-message"
import { buildTargetedMessage } from "@/lib/targeted-message-build"
import { templateProblems } from "@/lib/message-template"
import { formatScheduledFor, scheduledInstant, scheduleProblem, scheduleSchema } from "@/lib/scheduled-message"
import { orgTimeZone } from "@/lib/time-zone"

/**
 * POST /api/admin/events/[id]/scheduled-messages (#1019): schedules a targeted message for a date
 * and time in the organisation's time zone. Only the intent is stored (audience selector, text,
 * push option); the outbox cron computes the recipients and sends it when due. Past times, an
 * archived event, a shift of another event and unknown template variables are refused here, and
 * checked again when it goes.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db, organizationId } = guard
  const { id } = await params

  const parsed = scheduleSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error, { useIssueMessage: true })
  const { audience, subject, message, push, date, time } = parsed.data

  const event = await db.event.findFirst({
    where: { id },
    select: { id: true, title: true, slug: true, organizationId: true, publicStatus: true, organization: { select: { name: true, slug: true, timeZone: true } } },
  })
  if (!event) return NextResponse.json({ error: "Événement non trouvé" }, { status: 404 })
  if (event.publicStatus === "archived") return NextResponse.json({ error: "Cet événement est archivé : aucun message ne peut y être programmé." }, { status: 400 })

  const timeZone = orgTimeZone(event.organization)
  const now = new Date()
  const problem = scheduleProblem({ date, time }, timeZone, now)
  if (problem) return NextResponse.json({ error: problem.message, field: problem.field }, { status: 400 })

  if (audience.kind === "shift") {
    const shift = await db.shift.findFirst({ where: { id: audience.shiftId, eventId: id, status: { not: "cancelled" } }, select: { id: true } })
    if (!shift) return NextResponse.json({ error: "Créneau introuvable dans cet événement." }, { status: 400 })
  }
  const problems = templateProblems(`${subject}\n${message}`, audience.kind)
  if (problems.length > 0) return NextResponse.json({ error: problems.join(" ") }, { status: 400 })

  // Shared with the immediate sends: a stuck button can't flood the queue for later either.
  const rl = await rateLimit(`org:${organizationId}`, "targeted-message", MESSAGE_RATE_LIMIT, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de messages envoyés ou programmés cette heure. Réessayez plus tard." }, { status: 429 })

  // The label of the audience and today's count, for the list and the log; the recipients
  // themselves are computed again when it goes.
  const { recipients, label } = await buildTargetedMessage(db, event, audience, subject, message)
  const scheduledFor = scheduledInstant(date, time, timeZone)
  const created = await db.scheduledMessage.create({
    data: {
      organizationId,
      eventId: id,
      authorId: guard.session.user?.id ?? null,
      authorName: guard.session.user?.name || guard.session.user?.email || "Organisateur",
      subject,
      message,
      audience,
      audienceLabel: label,
      push: !!push,
      scheduledFor,
    },
    select: { id: true },
  })

  const when = `${formatScheduledFor(scheduledFor, timeZone, now)} (${timeZone})`
  await logEvent({
    eventId: id,
    actor: adminActor(guard.session),
    action: "message.scheduled",
    entityType: "Event",
    entityId: id,
    changes: {
      audience: { from: null, to: label },
      subject: { from: null, to: subject },
      scheduledFor: { from: null, to: when },
    },
  })

  return NextResponse.json({ id: created.id, scheduledFor: scheduledFor.toISOString(), when, audience: label, recipients: recipients.length }, { status: 201 })
}
