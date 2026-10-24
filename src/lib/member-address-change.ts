// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * What an organiser's correction of a member's email address does to the member's links (pure
 * rules; the transaction is src/lib/member-address-revocation.ts).
 *
 * Personal links (one per registration, the calendar address derived from it) and invitation
 * links were emailed to the old address. Once the organiser says that address is not the
 * member's, whoever reads that inbox must lose access: every one of those links gets a new token.
 * The member then receives at the new address what they need to carry on: their personal link
 * for each upcoming event where they hold a place, and each invitation still waiting for an
 * answer. Nothing queued for the old address is redirected: it is cancelled.
 *
 * Adding an address to a member who had none renews nothing: no link was ever emailed.
 */

const norm = (email: string | null | undefined) => (email ?? "").trim().toLowerCase()

/** True when the member had an address and it is replaced by another one or removed. */
export function addressCorrected(before: string | null | undefined, after: string | null | undefined): boolean {
  return norm(before) !== "" && norm(before) !== norm(after)
}

/** A registration of the member, as read for the renewal. */
export type RenewedRegistration = { id: string; eventId: string; status: string; createdAt: Date; eventEndDate: Date }
/** An invitation of the member, as read for the renewal. */
export type RenewedInvite = { id: string; eventId: string; usedAt: Date | null; declinedAt: Date | null; eventEndDate: Date }

/** Same horizon as « J'ai perdu mon lien » (src/app/api/public/registrations/link/route.ts). */
export const UPCOMING_GRACE_MS = 24 * 60 * 60 * 1000

const LIVE = new Set(["active", "waiting", "offered", "requested"])

/**
 * Which new links go to the new address: one personal link per upcoming event where the member
 * still holds a live registration (the newest one; they all open the same page), and every
 * invitation not answered yet, for an upcoming event where they hold no live registration (their
 * personal link already covers that event). Empty when the member has no address any more or is
 * deactivated for the invitations, which only go to active members.
 */
export function linksToResend(
  input: { newEmail: string | null | undefined; active: boolean; registrations: RenewedRegistration[]; invites: RenewedInvite[] },
  now: Date,
): { registrationIds: string[]; inviteIds: string[] } {
  if (!norm(input.newEmail)) return { registrationIds: [], inviteIds: [] }
  const horizon = now.getTime() - UPCOMING_GRACE_MS
  const newestByEvent = new Map<string, RenewedRegistration>()
  for (const r of input.registrations) {
    if (!LIVE.has(r.status) || r.eventEndDate.getTime() < horizon) continue
    const seen = newestByEvent.get(r.eventId)
    if (!seen || r.createdAt.getTime() > seen.createdAt.getTime()) newestByEvent.set(r.eventId, r)
  }
  const inviteIds = !input.active ? [] : input.invites
    .filter((i) => !i.usedAt && !i.declinedAt && i.eventEndDate.getTime() >= horizon && !newestByEvent.has(i.eventId))
    .map((i) => i.id)
  return { registrationIds: [...newestByEvent.values()].map((r) => r.id), inviteIds }
}
