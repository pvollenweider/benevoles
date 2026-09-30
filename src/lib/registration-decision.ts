// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import type { OrgScopedPrisma } from "./prisma-org"
import { logEvent, type LogActor } from "./event-log"
import { registrationToken } from "./token-vault"
import { pickShiftInfo } from "./shift-info"
import { collectNotifications, deliverAfterResponse, enqueueNotifications } from "./notifications/outbox"
import { notifySectorLeadersOfSignup } from "./sector-leaders"
import { promoteNextInWaitlist } from "./waitlist"
import { reportError } from "./report-error"

/**
 * Sign-up approval (#484): the organizer accepts or refuses a request on a « Sur validation »
 * shift. The request already holds its spot, so accepting only turns it into a place; refusing
 * frees the spot, which then goes to the waitlist like any freed spot.
 */

export const REFUSAL_NOTE_MAX = 1000

export const decisionSchema = z.object({
  decision: z.enum(["accept", "refuse"]),
  // Optional, sent only with a refusal: the email gives no reason unless the organizer writes one.
  note: z.string().trim().max(REFUSAL_NOTE_MAX).optional().nullable(),
})
export type Decision = z.infer<typeof decisionSchema>

export const decidedStatus = (decision: Decision["decision"]) => (decision === "accept" ? "active" : "refused")

export type DecisionResult =
  | { ok: true; status: "active" | "refused" }
  | { ok: false; httpStatus: 404 | 409; error: string }

export const ALREADY_SETTLED = "Cette demande a déjà été traitée ou annulée. Rechargez la page."

export async function decideRequest(db: OrgScopedPrisma, actor: LogActor, id: string, input: Decision): Promise<DecisionResult> {
  const reg = await db.registration.findFirst({
    where: { id },
    include: {
      volunteer: true,
      shift: true,
      event: { include: { organization: { select: { slug: true } } } },
    },
  })
  if (!reg) return { ok: false, httpStatus: 404, error: "Non trouvé" }
  if (reg.status !== "requested") return { ok: false, httpStatus: 409, error: ALREADY_SETTLED }

  const status = decidedStatus(input.decision)
  const note = input.decision === "refuse" ? input.note?.trim() || null : null
  const name = `${reg.volunteer.firstName} ${reg.volunteer.lastName}`

  // Conditional on the request still standing: the volunteer may withdraw it, or another
  // organizer decide, at the same moment. The decision and its email commit together (#352).
  const outboxIds = await db.$transaction(async (tx) => {
    const { count } = await tx.registration.updateMany({ where: { id, status: "requested" }, data: { status } })
    if (count === 0) return null
    const outbox = collectNotifications()
    if (status === "active") {
      await outbox.send({
        kind: "registration_confirmation",
        recipient: { email: reg.volunteer.email, name },
        dedupeKey: `registration_accepted:${id}`,
        data: {
          volunteerName: name,
          eventTitle: reg.event.title,
          shifts: [{
            label: reg.shift.label,
            date: reg.shift.date.toLocaleDateString("fr-FR"),
            startTime: reg.shift.startTime,
            endTime: reg.shift.endTime,
            ...pickShiftInfo(reg.shift, reg.event),
          }],
          editToken: registrationToken.reveal(reg),
          orgSlug: reg.event.organization.slug,
          confirmationMessage: reg.event.confirmationMessage ?? undefined,
        },
      })
      await notifySectorLeadersOfSignup({
        eventId: reg.eventId,
        eventTitle: reg.event.title,
        orgSlug: reg.event.organization.slug,
        volunteerName: name,
        shift: reg.shift,
      }, outbox.send)
    } else {
      await outbox.send({
        kind: "registration_refused",
        recipient: { email: reg.volunteer.email, name },
        dedupeKey: `registration_refused:${id}`,
        data: {
          volunteerName: name,
          eventTitle: reg.event.title,
          shiftLabel: reg.shift.label,
          note,
          orgSlug: reg.event.organization.slug,
          eventSlug: reg.event.slug,
        },
      })
    }
    return enqueueNotifications(outbox.payloads, tx, { organizationId: reg.event.organizationId })
  })
  if (!outboxIds) return { ok: false, httpStatus: 409, error: ALREADY_SETTLED }

  const logId = await logEvent({
    eventId: reg.eventId,
    actor,
    action: status === "active" ? "registration.accepted" : "registration.refused",
    entityType: "Registration",
    entityId: id,
    // Whether a note was written, never its text: the log is read by the whole team.
    changes: {
      status: { from: "requested", to: status },
      shiftId: { from: reg.shiftId, to: reg.shiftId },
      ...(note ? { note: { from: null, to: "(rempli)" } } : {}),
    },
  })

  deliverAfterResponse(outboxIds)
  if (status === "refused") {
    await promoteNextInWaitlist(reg.shiftId, logId ?? undefined).catch(reportError("waitlist.promote"))
  }
  return { ok: true, status }
}
