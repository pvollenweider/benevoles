// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The one implementation of a volunteer withdrawing their own registration (DELETE on the
 * personal page). Shared by /api/public/registrations/[token] (the event link) and
 * /api/public/mes-inscriptions/[token] (the organisation-wide link, #1429): the deadline, the
 * conditional update, the event log, the waitlist promotion and the two emails are decided here,
 * never copied per route. Routes only resolve the link, check the organisation and rate-limit.
 *
 * The caller must have read the registration for the authenticated volunteer and organisation;
 * this module never accepts an id on its own.
 */

import { prisma } from "./prisma"
import { promoteNextInWaitlist } from "./waitlist"
import { logEvent } from "./event-log"
import { reportError } from "./report-error"
import { OCCUPYING_STATUSES } from "./registration-capacity"
import { planVolunteerWithdraw } from "./volunteer-withdraw"
import { queueWithdrawalNotifications } from "./withdrawal-notifications"
import { queueWithdrawalConfirmation } from "./withdrawal-confirmation"
import { deliverAfterResponse } from "./notifications/outbox"
import { cancelRefusedError, isLateWithdrawal, selfCancelState, shiftStartsAt, type SelfCancelReason } from "./cancel-deadline"
import { endSwapsAfter } from "./shift-swap-server"

export type WithdrawableRegistration = {
  id: string
  eventId: string
  shiftId: string
  volunteerId: string
  status: string
  shift: { id: string; roleName: string; label: string; date: Date; startTime: string; endTime: string; capacity: number }
  event: {
    id: string
    title: string
    organizationId: string
    cancelDeadlineDays: number | null
    cancelDeadlineHours: number | null
    organization: { slug: string; timeZone: string | null }
  }
  volunteer: { firstName: string; lastName: string; email: string | null }
}

export type VolunteerWithdrawOutcome =
  | { kind: "withdrawn" }
  /** Someone else settled it first (double click, organizer decision, offer expiring). */
  | { kind: "already_settled" }
  /** Past the event's deadline or the shift's start: nothing was changed. */
  | { kind: "refused"; reason: SelfCancelReason; error: string }

/**
 * Applies one withdrawal. The caller resolves the registration through the link's own
 * (volunteer, organisation) scope and rejects an unknown one before calling.
 */
export async function withdrawRegistration(input: {
  registration: WithdrawableRegistration
  message: string | null
  now: Date
  timeZone: string
}): Promise<VolunteerWithdrawOutcome> {
  const { registration, message, now, timeZone } = input
  const plan = planVolunteerWithdraw(registration.status)
  if (!plan) return { kind: "already_settled" }

  // Never once the shift has started, nor past the event's earlier deadline for a confirmed place
  // (#946). The source of truth: the page may have been loaded before the deadline.
  const cancel = selfCancelState({ status: registration.status, shift: registration.shift, setting: registration.event, timeZone, now })
  if (!cancel.allowed) return { kind: "refused", reason: cancel.reason, error: cancelRefusedError(cancel.reason) }

  // Conditional on still being in the status read above (#264): a double click would otherwise
  // cancel twice, log twice and trigger two waitlist promotions for a single freed spot. Same
  // for a request the organizer is deciding on, an offer being confirmed or expiring, or a
  // waitlist entry being offered a spot right now: whichever runs first wins, the other finds
  // it settled.
  const { count } = await prisma.registration.updateMany({
    where: { id: registration.id, status: registration.status },
    data: { status: "cancelled" },
  })
  if (count === 0) return { kind: "already_settled" }

  // A swap request built on this place can no longer happen (#1174): ended, the other person told.
  await endSwapsAfter(prisma, { registrationIds: [registration.id] }, "registration_gone", { type: "volunteer", id: registration.volunteerId }, now)

  const cancelLogId = await logEvent({
    eventId: registration.eventId,
    actor: { type: "volunteer", id: registration.volunteerId },
    action: "registration.cancelled",
    entityType: "Registration",
    entityId: registration.id,
    // shiftId unchanged: recorded so the narrative can still name the shift — see
    // describeChanges's shiftId filter in event-log-narrative.ts. The optional message never
    // goes in `changes`: it must not end up in the event log (#559).
    changes: { status: { from: registration.status, to: "cancelled" }, shiftId: { from: registration.shiftId, to: registration.shiftId } },
  })

  // Only a withdrawal that held a spot (place, request, offered spot) hands it to the next
  // person on the waitlist. Leaving the waitlist frees nothing: the entries behind move up.
  let waitlistTookSpot = false
  if (plan.releasesSpot) {
    waitlistTookSpot = await promoteNextInWaitlist(registration.shiftId, cancelLogId ?? undefined).catch((e) => { reportError("waitlist.promote")(e); return false })
  }

  // Tells the organization's admins and the role's sector leaders (#559): only for a confirmed
  // place or a pending request. Best-effort: a failure here must not undo the withdrawal just
  // recorded, already answered to the volunteer as settled.
  if (plan.notifiesOrganizers) {
    try {
      const occupied = await prisma.registration.count({ where: { shiftId: registration.shiftId, status: { in: [...OCCUPYING_STATUSES] } } })
      // Grouped (#869): withdrawals of the event within a few minutes make one email per person.
      // Less than 24 hours before the start (#946): sent at once, not grouped.
      const late = isLateWithdrawal(shiftStartsAt(registration.shift, timeZone), now)
      const dueIds = await queueWithdrawalNotifications({
        registrationId: registration.id,
        event: registration.event,
        shift: registration.shift,
        volunteerName: `${registration.volunteer.firstName} ${registration.volunteer.lastName}`,
        message,
        waitlistTookSpot,
        placesMissing: Math.max(registration.shift.capacity - occupied, 0),
        late,
        timeZone,
      }, now)
      deliverAfterResponse(dueIds)
    } catch (e) {
      reportError("withdrawal.notify")(e)
    }
  }

  // Says back to the volunteer what was just done from their link (#809): if the link is in
  // someone else's hands, they learn it and can tell the organisation. Grouped (#1190): several
  // withdrawals of the event in a row make one email listing them. Best-effort too.
  if (registration.volunteer.email) {
    try {
      const outboxIds = await queueWithdrawalConfirmation({
        registrationId: registration.id,
        previousStatus: registration.status,
        event: registration.event,
        shift: registration.shift,
        volunteer: { id: registration.volunteerId, firstName: registration.volunteer.firstName, lastName: registration.volunteer.lastName, email: registration.volunteer.email },
        timeZone,
      }, now)
      deliverAfterResponse(outboxIds)
    } catch (e) {
      reportError("withdrawal.confirm")(e)
    }
  }

  return { kind: "withdrawn" }
}
