// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { cancelPolicySentence } from "@/lib/cancel-deadline"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ORG_LIFECYCLE_SELECT, orgLinksOpen } from "@/lib/org-lifecycle"
import { orgUnavailableResponse } from "@/lib/org-lifecycle-response"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { logEvent } from "@/lib/event-log"
import { registrationToken } from "@/lib/token-vault"
import { deliverAfterResponse, enqueueNotifications } from "@/lib/notifications/outbox"
import { pickShiftInfo } from "@/lib/shift-info"
import { lockShifts } from "@/lib/registration-capacity"
import { checkDutyChange, lockVolunteerRows, lockWorkloadShared, readWorkloadGate, workloadRefusalBody, WorkloadRefusalError } from "@/lib/workload-guard"

/**
 * Accepts a spot offered from the waitlist. POST only (#1044): the offer email's link opens a
 * read-only page (/waitlist/[token]/confirm) whose « Prendre la place » button sends this request,
 * so a mail scanner or a link preview that follows the link, or runs its scripts, accepts nothing.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(getClientIp(_req), "waitlist-confirm", 10, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 })

  const { token } = await params

  const reg = await prisma.registration.findFirst({
    where: { ...registrationToken.where(token), status: "offered" },
    include: {
      volunteer: true,
      shift: true,
      event: { include: { organization: { select: { slug: true, ...ORG_LIFECYCLE_SELECT } } } },
    },
  })

  if (!reg) {
    return NextResponse.json({ error: "Lien invalide, déjà confirmé ou expiré." }, { status: 404 })
  }
  if (!orgLinksOpen(reg.event.organization)) return orgUnavailableResponse()

  if (reg.waitingExpiresAt && reg.waitingExpiresAt < new Date()) {
    return NextResponse.json({ error: "Ce lien a expiré. La place a été proposée à quelqu'un d'autre." }, { status: 410 })
  }

  // Conditional on the offer still standing (#264): a double confirm (double click, link
  // prefetch + click) must not confirm twice, and an offer the cron just expired can't be taken.
  // The confirmation email is stored in the same transaction (#352).
  // On a « Sur validation » shift (#484) the offered spot becomes a request: the spot stays held,
  // the organizer still decides.
  let next: "requested" | "active" = reg.shift.requiresApproval ? "requested" : "active"
  let outboxIds: string[] | null
  try {
    outboxIds = await prisma.$transaction(async (tx) => {
      // Workload protection (#1171): taking the place creates a commitment. Locks in the global order
      // (workload, shift, volunteer); the shift's hours and approval mode are read again under them.
      await lockWorkloadShared(tx, reg.eventId)
      const gate = await readWorkloadGate(tx, reg.eventId)
      if (gate.kind !== "off") {
        await lockShifts(tx, [reg.shiftId])
        await lockVolunteerRows(tx, [reg.volunteerId])
        const shift = await tx.shift.findFirst({ where: { id: reg.shiftId }, select: { id: true, date: true, startTime: true, endTime: true, requiresApproval: true } })
        if (!shift) return null
        next = shift.requiresApproval ? "requested" : "active"
        const verdict = await checkDutyChange(tx, gate, reg.eventId, reg.volunteerId, { add: [shift] })
        if (!verdict.ok) throw new WorkloadRefusalError(verdict, reg.volunteerId)
      }
      const { count } = await tx.registration.updateMany({
        where: {
          id: reg.id,
          status: "offered",
          OR: [{ waitingExpiresAt: null }, { waitingExpiresAt: { gte: new Date() } }],
        },
        data: {
          status: next,
          waitingPosition: null,
          waitingOfferedAt: null,
          waitingExpiresAt: null,
        },
      })
      if (count === 0) return null
      const shift = {
        label: reg.shift.label,
        date: reg.shift.date.toLocaleDateString("fr-FR"),
        startTime: reg.shift.startTime,
        endTime: reg.shift.endTime,
      }
      if (next === "requested") {
        return enqueueNotifications([{
          kind: "registration_requested",
          organizationId: reg.event.organizationId,
          volunteerId: reg.volunteerId,
          dedupeKey: `waitlist_requested:${reg.id}`,
          recipient: { email: reg.volunteer.email, name: reg.volunteer.firstName },
          data: { volunteerName: reg.volunteer.firstName, eventTitle: reg.event.title, shifts: [shift], editToken: token, orgSlug: reg.event.organization.slug },
        }], tx)
      }
      return enqueueNotifications([{
        kind: "registration_confirmation",
        organizationId: reg.event.organizationId,
        volunteerId: reg.volunteerId,
        dedupeKey: `waitlist_confirmed:${reg.id}`,
        recipient: { email: reg.volunteer.email, name: reg.volunteer.firstName },
        data: {
          volunteerName: reg.volunteer.firstName,
          eventTitle: reg.event.title,
          shifts: [{ ...shift, ...pickShiftInfo(reg.shift, reg.event) }],
          editToken: token,
          orgSlug: reg.event.organization.slug,
          cancelNotice: cancelPolicySentence(reg.event),
        },
      }], tx)
    })
  } catch (e) {
    // Their own offer, from their own link: the details are theirs. The offer stays until it expires
    // or is declined; nothing changed.
    if (e instanceof WorkloadRefusalError) {
      return NextResponse.json(workloadRefusalBody(e.verdict, "Tu ne peux pas prendre cette place : les pauses et limites de charge de cet événement ne seraient pas respectées."), { status: 409 })
    }
    throw e
  }
  if (!outboxIds) {
    return NextResponse.json({ error: "Lien invalide, déjà confirmé ou expiré." }, { status: 404 })
  }

  // Link back to the offer that made this possible, itself already linked to whatever
  // cancellation freed the spot — closes the causal chain for narrative mode.
  const offerLog = await prisma.eventLog.findFirst({
    where: { entityType: "Registration", entityId: reg.id, action: "registration.waitlist_offered" },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  })

  await logEvent({
    eventId: reg.eventId,
    actor: { type: "volunteer", id: reg.volunteerId },
    action: "registration.waitlist_confirmed",
    entityType: "Registration",
    entityId: reg.id,
    changes: { status: { from: "offered", to: next } },
    causedByLogId: offerLog?.id,
  })

  deliverAfterResponse(outboxIds)

  return NextResponse.json({ success: true, editToken: token, requested: next === "requested" })
}
