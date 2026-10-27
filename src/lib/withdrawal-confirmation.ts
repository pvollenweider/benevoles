// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The volunteer's own confirmation of a withdrawal made from their personal link (#809), grouped
 * (#1190): several withdrawals of one event in a row make one email listing them, sent once none
 * was added for the digest delay, instead of one email each (the sixth of a burst hit the
 * per-address cap of public emails, src/lib/notifications/send-limits.ts, and was dropped).
 *
 * Every line stays: a re-registration or an organiser's restoration on the same shift before the
 * email leaves does not remove it. Each line is an action with its time, still true afterwards,
 * and the email is a security notice (« Ce n'était pas toi ? »): hiding a withdrawal because the
 * place is held again would hide a use of the link by someone else.
 */

import { digestDelayMs, queueDigestItem } from "./notifications/digest"
import { withdrawalConfirmation, withdrawalMoment } from "./volunteer-withdraw"
import { WITHDRAWAL_DIGEST_DELAY_MS } from "./withdrawal-notifications"

export type WithdrawalConfirmationInput = {
  registrationId: string
  /** The status the registration had: what the line says was done. */
  previousStatus: string
  event: { id: string; title: string; organizationId: string }
  shift: { roleName: string; label: string; date: Date; startTime: string; endTime: string }
  volunteer: { id: string; firstName: string; lastName: string; email: string }
  timeZone: string
}

/** One line of the email: what was done, when, on which shift. */
export type WithdrawalConfirmationItem = {
  what: string
  when: string
  shift: { roleName: string; label: string; date: string; startTime: string; endTime: string }
}

/** Same group, same email: one per volunteer and event. */
export function withdrawalConfirmationGroupKey(eventId: string, volunteerId: string): string {
  return `registration_withdrawn:${eventId}:${volunteerId}`
}

/** The parts of the email shared by the group, and the line of this withdrawal. Pure. */
export function withdrawalConfirmationParts(input: WithdrawalConfirmationInput, now: Date): {
  base: { volunteerName: string; eventTitle: string }
  item: WithdrawalConfirmationItem
} {
  const { shift } = input
  return {
    base: { volunteerName: `${input.volunteer.firstName} ${input.volunteer.lastName}`, eventTitle: input.event.title },
    item: {
      what: withdrawalConfirmation(input.previousStatus),
      when: withdrawalMoment(now, input.timeZone),
      shift: { roleName: shift.roleName, label: shift.label, date: shift.date.toISOString().slice(0, 10), startTime: shift.startTime, endTime: shift.endTime },
    },
  }
}

/**
 * Queues the line in the volunteer's pending email for this event, or starts one. Keyed by the
 * registration: a retried or double-clicked withdrawal adds its line once (the route's conditional
 * update already makes it the only run). Returns the ids due now (only without a delay,
 * DIGEST_DELAY_SECONDS=0), for the caller to deliver.
 */
export async function queueWithdrawalConfirmation(input: WithdrawalConfirmationInput, now: Date = new Date()): Promise<string[]> {
  const { base, item } = withdrawalConfirmationParts(input, now)
  const dueId = await queueDigestItem({
    kind: "registration_withdrawn",
    groupKey: withdrawalConfirmationGroupKey(input.event.id, input.volunteer.id),
    recipient: { email: input.volunteer.email, name: base.volunteerName },
    organizationId: input.event.organizationId,
    volunteerId: input.volunteer.id,
    base,
    item,
    itemKey: input.registrationId,
    now,
    delayMs: digestDelayMs(WITHDRAWAL_DIGEST_DELAY_MS),
  })
  return dueId ? [dueId] : []
}
