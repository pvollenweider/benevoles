// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { clearShiftDeclines } from "./shift-decline-clear"
import { cancelPolicySentence } from "./cancel-deadline"
import { z } from "zod"
import type { OrgScopedPrisma } from "./prisma-org"
import { logEvent, type LogActor } from "./event-log"
import { collectNotifications, deliverAfterResponse, enqueueNotifications } from "./notifications/outbox"
import { queueAddedShiftsConfirmation } from "./notifications/added-shifts-confirmation"
import { notifySectorLeadersOfSignup } from "./sector-leaders"
import { promoteNextInWaitlist } from "./waitlist"
import { reportError } from "./report-error"
import { lockShifts } from "./registration-capacity"
import { checkDutyChange, lockVolunteerRows, lockWorkloadShared, readWorkloadGate, workloadRefusalBody, WorkloadRefusalError } from "./workload-guard"
import { AvailabilityAckError, availabilityAckBody, checkAvailabilityAcks, logAvailabilityAcks, readAvailabilityGate } from "./availability-assist-data"
import { checkShiftOverrides, ShiftCancelledError, ShiftOverrideError } from "./shift-override-server"
import { cancelledShiftMessage, overrideLogValue, type ShiftOverrideBody, type ShiftOverrideNeed } from "./shift-override"

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
  /**
   * Dated availability (#1146, lot B): accepting a request on hours the person said they are not
   * available for needs this acknowledgement (src/lib/availability-assist.ts availabilityAckKey),
   * bound to their answer's revision and the shift's hours. Never a way past the workload protection.
   */
  availabilityAck: z.array(z.string().max(400)).max(1).optional(),
  /**
   * Accepting on a full or closed shift (AUTHZ-15): the organiser's confirmation, bound to the
   * request, the shift's status, places and the spots held by others (src/lib/shift-override.ts).
   */
  shiftOverride: z.array(z.string().max(400)).max(1).optional(),
})
export type Decision = z.infer<typeof decisionSchema>

export const decidedStatus = (decision: Decision["decision"]) => (decision === "accept" ? "active" : "refused")

export type DecisionResult =
  | { ok: true; status: "active" | "refused" }
  | { ok: false; httpStatus: 404 | 409; error: string; code?: "workload"; workload?: string[] }
  | { ok: false; httpStatus: 409; error: string; code: "availability"; outside: ReturnType<typeof availabilityAckBody>["outside"] }
  | { ok: false; httpStatus: 409; error: string; code: "shift_cancelled" }
  | ({ ok: false; httpStatus: 409 } & ShiftOverrideBody)

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
  let outboxIds: string[] | null
  // The confirmation used (AUTHZ-15), for the event log.
  let override: ShiftOverrideNeed | undefined
  try {
    outboxIds = await db.$transaction(async (tx) => {
      // Workload protection (#1171): accepting turns the request into a place. The request already
      // counted, but it is judged again as added, under the locks (workload, shift, volunteer): an
      // approval never turns a violation into a valid plan. Then dated availability (#1146, lot B),
      // on an event that uses it: hours the person said they are not available for need the
      // organiser's acknowledgement, judged on the answer and the shift's hours read under the same
      // locks. An event without either takes no extra lock.
      let acknowledged: Awaited<ReturnType<typeof checkAvailabilityAcks>> = []
      if (status === "active") {
        await lockWorkloadShared(tx, reg.eventId)
        const gate = await readWorkloadGate(tx, reg.eventId)
        const availability = await readAvailabilityGate(tx, reg.eventId)
        // The shift is always locked (AUTHZ-15): its status and spots are judged below.
        await lockShifts(tx, [reg.shiftId])
        // The member's row is always locked: the workload protection and the dated availability
        // read it, and the grouped confirmation below needs the same lock as the volunteer's own
        // sign-ups (lockSignupVolunteer) so two accepts, or an accept and a sign-up, find the same
        // pending email instead of starting two. Order stays workload → shifts → people.
        await lockVolunteerRows(tx, [reg.volunteerId])
        if (gate.kind !== "off") {
          const shift = await tx.shift.findFirst({ where: { id: reg.shiftId }, select: { id: true, date: true, startTime: true, endTime: true, mealOnTheGo: true, placeId: true } })
          if (shift) {
            const verdict = await checkDutyChange(tx, gate, reg.eventId, reg.volunteerId, { add: [shift] }, { exceptRegistrationIds: [id] })
            if (!verdict.ok) throw new WorkloadRefusalError(verdict, reg.volunteerId)
          }
        }
        // A cancelled shift refuses; a full or closed one needs the confirmation. The request's own
        // spot is left out: only the places held by others count.
        override = (await checkShiftOverrides(tx, "accept", [reg.shiftId], () => id, input.shiftOverride ?? [], { exceptRegistrationIds: [id] })).get(reg.shiftId)
        if (availability.inUse) acknowledged = await checkAvailabilityAcks(tx, availability, reg.eventId, reg.volunteerId, [reg.shiftId], input.availabilityAck ?? [])
      }
      const { count } = await tx.registration.updateMany({ where: { id, status: "requested" }, data: { status } })
      if (count === 0) return null
      // A request accepted is the person taking the shift: a « Je ne peux pas » answer for it goes (#1303).
      if (status === "active") await clearShiftDeclines(tx, reg.volunteerId, [reg.shiftId])
      // The acknowledgement's evidence commits with the acceptance (#1146, lot B).
      await logAvailabilityAcks(tx, { eventId: reg.eventId, actor, via: "accept", acks: acknowledged, registrationOf: () => id })
      const outbox = collectNotifications()
      let groupedDueId: string | null = null
      if (status === "active") {
        // The confirmation is grouped with the volunteer's other confirmations on this event:
        // an organizer accepting several requests of one person in a row sends one email listing
        // them, instead of one email per request, the last ones dropped by the per-address cap of
        // public emails (src/lib/notifications/send-limits.ts). What the email lists is read again
        // when it leaves, so a place withdrawn meanwhile is not announced. A request's « Demande
        // reçue » already carried the personal link (buildSignupNotifications, and the waitlist
        // confirmation), so waiting for the group loses nothing.
        // A member without an address has no confirmation to send: the outbox skips those rows too.
        groupedDueId = reg.volunteer.email
          ? await queueAddedShiftsConfirmation(tx, {
              volunteerId: reg.volunteerId,
              organizationId: reg.event.organizationId,
              recipient: { email: reg.volunteer.email, name },
              data: {
                volunteerName: name,
                eventTitle: reg.event.title,
                orgSlug: reg.event.organization.slug,
                confirmationMessage: reg.event.confirmationMessage ?? undefined,
                cancelNotice: cancelPolicySentence(reg.event),
                eventId: reg.eventId,
              },
              registrationIds: [id],
              now: new Date(),
            })
          : null
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
          volunteerId: reg.volunteerId,
          organizationId: reg.event.organizationId,
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
      const ids = await enqueueNotifications(outbox.payloads, tx, { organizationId: reg.event.organizationId })
      // Without a digest delay (DIGEST_DELAY_SECONDS=0) the grouped row is due at once: deliver it
      // after the response, as the public sign-up route does (#1191).
      if (groupedDueId) ids.push(groupedDueId)
      return ids
    })
  } catch (e) {
    if (e instanceof ShiftCancelledError) return { ok: false, httpStatus: 409, error: cancelledShiftMessage(), code: "shift_cancelled" }
    if (e instanceof ShiftOverrideError) return { ok: false, httpStatus: 409, ...e.body() }
    if (e instanceof AvailabilityAckError) return { ok: false, httpStatus: 409, ...availabilityAckBody(e, name, "accept") }
    if (e instanceof WorkloadRefusalError) {
      const body = workloadRefusalBody(e.verdict, `Acceptation impossible : le programme de ${name} ne respecterait plus les pauses et limites de charge de cet événement.`)
      return { ok: false, httpStatus: 409, ...body }
    }
    throw e
  }
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
      ...(override ? { shiftOverride: { from: null, to: overrideLogValue(override) } } : {}),
    },
  })

  deliverAfterResponse(outboxIds)
  if (status === "refused") {
    await promoteNextInWaitlist(reg.shiftId, logId ?? undefined).catch(reportError("waitlist.promote"))
  }
  return { ok: true, status }
}
