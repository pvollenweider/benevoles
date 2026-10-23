// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Rules for sending member invitations and reminders (#1105). Pure: no DB, the caller gives `now`.
 *
 * These emails go through the outbox, so over a sending limit they wait instead of failing. What
 * keeps them from going twice:
 *   - a reminder (« Relancer les invités sans réponse ») skips anyone invited or reminded less than
 *     REMIND_COOLDOWN_MS ago: the last email is `lastRemindedAt`, or `sentAt` (the first
 *     invitation) when nothing was sent since. Two reminders close together, a double click, or a
 *     reminder right after the invitation never email the same person twice;
 *   - a new invitation of someone already invited is re-sent, as before, unless their invitation
 *     went less than RESEND_GUARD_MS ago (a double click or a retried request);
 *   - the manual reminder (« Envoyer le rappel ») goes at most once per RESEND_GUARD_MS per event.
 * Each of these is claimed with a conditional update in the same transaction as the outbox rows,
 * so two requests at the same instant cannot both claim the same person. The dedupe key carries
 * the claim's instant: one outbox row per claim, never two for the same one.
 */

export const REMIND_COOLDOWN_MS = 48 * 60 * 60 * 1000
export const RESEND_GUARD_MS = 5 * 60 * 1000

/** When the invitation email last went to this person: the last re-send, else the first invitation. */
export function lastInvitationEmailAt(invite: { sentAt: Date | string; lastRemindedAt?: Date | string | null }): Date {
  const sent = new Date(invite.sentAt)
  if (!invite.lastRemindedAt) return sent
  const reminded = new Date(invite.lastRemindedAt)
  return reminded > sent ? reminded : sent
}

/** True when the invitation email went less than `windowMs` ago: a reminder now would repeat it. */
export function emailedWithin(invite: { sentAt: Date | string; lastRemindedAt?: Date | string | null }, now: Date, windowMs: number = REMIND_COOLDOWN_MS): boolean {
  return now.getTime() - lastInvitationEmailAt(invite).getTime() < windowMs
}

/** The instant before which the last email must be for a new one to go. */
export function sendCutoff(now: Date, windowMs: number): Date {
  return new Date(now.getTime() - windowMs)
}

/** Outbox key of one invitation email: the invite and the instant of the claim that sends it. */
export function inviteEmailDedupeKey(inviteId: string, claimedAt: Date): string {
  return `member_invite:${inviteId}:${claimedAt.getTime()}`
}

/** Outbox key of one manual reminder email: the event, the person and the instant of the claim. */
export function manualReminderDedupeKey(eventId: string, volunteerId: string, claimedAt: Date): string {
  return `manual_reminder:${eventId}:${volunteerId}:${claimedAt.getTime()}`
}

/**
 * An email claimed earlier can still be waiting in the outbox (held by a sending limit, up to a
 * day for the bulk daily cap): the windows above count from the claim, not from delivery. So a new
 * claim also skips anyone whose previous invitation email, or the event's previous manual
 * reminder, is still pending or being sent: no second copy is queued behind the first.
 */
export const OUTSTANDING_OUTBOX_STATUSES = ["pending", "sending"] as const
export const INVITE_EMAIL_KEY_PREFIX = "member_invite:"
export function manualReminderKeyPrefix(eventId: string): string {
  return `manual_reminder:${eventId}:`
}

/** The invites whose invitation email is still in the outbox, from the outstanding rows' keys. */
export function invitesWithEmailOutstanding(dedupeKeys: (string | null)[]): Set<string> {
  const ids = new Set<string>()
  for (const key of dedupeKeys) {
    if (!key?.startsWith(INVITE_EMAIL_KEY_PREFIX)) continue
    const inviteId = key.slice(INVITE_EMAIL_KEY_PREFIX.length).split(":")[0]
    if (inviteId) ids.add(inviteId)
  }
  return ids
}

/** Prisma's 5 s default is too short for a long list queued in one transaction (500 invitations). */
export const SEND_TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const
