// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The factual state of a member invitation (#558), derived from facts that already exist on
 * `MemberInvite` and the volunteer's registrations — never stored redundantly:
 *   - "registered": the member has an active registration on the event. Takes priority over a
 *     past decline (someone who changed their mind without re-visiting the link, or an admin
 *     who signed them up by hand, is registered — not "not available").
 *   - "not_available": `declinedAt` is set and there is no active registration.
 *   - "no_answer": neither of the above. Whether the link was opened (`usedAt`) doesn't change
 *     this state; it's only shown as a detail (see the admin list).
 *
 * Pure: no DB, no dates beyond what's given.
 */
export type InviteState = "registered" | "not_available" | "no_answer"

export function inviteState(input: { declinedAt: Date | string | null; hasActiveRegistration: boolean }): InviteState {
  if (input.hasActiveRegistration) return "registered"
  if (input.declinedAt) return "not_available"
  return "no_answer"
}

/** « Sans réponse » (admin filter and relaunch/audience exclusion, #558): no active registration, not declined. */
export function isNoAnswer(input: { declinedAt: Date | string | null; hasActiveRegistration: boolean }): boolean {
  return inviteState(input) === "no_answer"
}

export type InviteStateCounts = { total: number; registered: number; notAvailable: number; noAnswer: number }

/** The four counters shown at the top of the invitations page; they always add up to `total`. */
export function inviteStateCounts(invites: { declinedAt: Date | string | null; hasActiveRegistration: boolean }[]): InviteStateCounts {
  let registered = 0
  let notAvailable = 0
  let noAnswer = 0
  for (const i of invites) {
    const state = inviteState(i)
    if (state === "registered") registered++
    else if (state === "not_available") notAvailable++
    else noAnswer++
  }
  return { total: invites.length, registered, notAvailable, noAnswer }
}
