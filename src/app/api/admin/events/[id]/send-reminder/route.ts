// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import type { NotificationPayload } from "@/lib/notifications/types"
import { RESEND_GUARD_MS, manualReminderDedupeKey, sendCutoff } from "@/lib/invitation-sending"
import { registrationToken } from "@/lib/token-vault"

/**
 * POST /api/admin/events/[id]/send-reminder
 *
 * Queues one email per volunteer who has at least one active registration
 * on the event. Each email contains the admin's custom reminder message
 * (Event.reminderMessage) followed by the volunteer's own shifts.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard

  const { id } = await params

  const event = await db.event.findFirst({
    where: { id },
    include: { organization: { select: { name: true, slug: true } } },
  })
  if (!event) return NextResponse.json({ error: "Non trouvé" }, { status: 404 })

  // Defense in depth: re-scope the registration lookup explicitly via
  // event.organizationId so a route bug can't leak another org's data.
  const regs = await db.registration.findMany({
    where: {
      eventId: id,
      status: "active",
      event: { organizationId: event.organizationId },
    },
    include: { volunteer: true, shift: true },
    orderBy: [{ shift: { date: "asc" } }, { shift: { startTime: "asc" } }],
  })

  if (regs.length === 0) {
    return NextResponse.json({ error: "Aucun bénévole inscrit" }, { status: 400 })
  }

  // Group registrations by volunteer (one email per person, even if
  // they have several shifts). Use the volunteer.id as key so we don't
  // depend on a single editToken per volunteer.
  type Bundle = {
    volunteer: typeof regs[number]["volunteer"]
    editToken: string
    shifts: typeof regs[number]["shift"][]
  }
  const byVolunteer = new Map<string, Bundle>()
  for (const r of regs) {
    let bundle = byVolunteer.get(r.volunteerId)
    if (!bundle) {
      bundle = { volunteer: r.volunteer, editToken: registrationToken.reveal(r), shifts: [] }
      byVolunteer.set(r.volunteerId, bundle)
    }
    bundle.shifts.push(r.shift)
  }

  // Through the outbox (#1105): over a sending limit the emails wait and leave in waves instead of
  // failing, and each one shows in « Emails envoyés ». The event's stamp is the claim: a second
  // reminder less than RESEND_GUARD_MS later (a double click, a retried request) is refused, so no
  // one gets it twice. The stamp and the emails commit together.
  const now = new Date()
  const cutoff = sendCutoff(now, RESEND_GUARD_MS)
  const outboxIds = await db.$transaction(async (tx) => {
    const { count } = await tx.event.updateMany({
      where: { id, OR: [{ reminderSentAt: null }, { reminderSentAt: { lt: cutoff } }] },
      data: { reminderSentAt: now },
    })
    if (count === 0) return null
    const payloads: NotificationPayload[] = []
    for (const bundle of byVolunteer.values()) {
      if (!bundle.volunteer.email) continue
      payloads.push({
        kind: "manual_reminder",
        dedupeKey: manualReminderDedupeKey(id, bundle.volunteer.id, now),
        recipient: { email: bundle.volunteer.email, name: bundle.volunteer.firstName },
        volunteerId: bundle.volunteer.id,
        organizationId: event.organizationId,
        data: {
          volunteerName: bundle.volunteer.firstName,
          organizationName: event.organization.name,
          orgSlug: event.organization.slug,
          eventTitle: event.title,
          customMessage: event.reminderMessage ?? "",
          shifts: bundle.shifts.map((s) => ({
            label: s.label,
            date: s.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }),
            startTime: s.startTime,
            endTime: s.endTime,
            roleName: s.roleName,
          })),
          editToken: bundle.editToken,
        },
      })
    }
    return enqueueNotifications(payloads, tx, { organizationId: event.organizationId })
  })
  if (outboxIds === null) {
    return NextResponse.json({ error: "Ce rappel a déjà été lancé il y a moins de 5 minutes. Il n'est pas renvoyé, pour que personne ne le reçoive deux fois." }, { status: 409 })
  }
  deliverAfterResponse(outboxIds)

  // `sent` kept for a page loaded before this version: it now means « queued ».
  return NextResponse.json({ queued: outboxIds.length, sent: outboxIds.length, totalVolunteers: byVolunteer.size })
}
