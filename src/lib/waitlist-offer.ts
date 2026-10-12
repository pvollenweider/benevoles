// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { WAITLIST_OFFER_HOURS } from "./waitlist-copy"

/**
 * How long a spot offered from the waitlist stays reserved (#946). Pure: read by
 * promoteNextInWaitlist and its tests.
 *
 * - The answer window is WAITLIST_OFFER_HOURS (24 h), but never runs past the shift's start: a spot
 *   offered on the eve of a shift expires when the shift starts.
 * - A spot freed less than WAITLIST_OFFER_MIN_LEAD_MS (1 hour) before the start is not offered at
 *   all: nobody would have time to read the email and get there. The organisers already know (the
 *   withdrawal is « de dernière minute ») and find someone themselves.
 */
export const WAITLIST_OFFER_MIN_LEAD_MS = 60 * 60 * 1000

/** When an offer made at `now` expires, or null when the shift starts too soon to offer it. */
export function waitlistOfferExpiry(now: Date, shiftStart: Date): Date | null {
  const lead = shiftStart.getTime() - now.getTime()
  if (lead < WAITLIST_OFFER_MIN_LEAD_MS) return null
  return new Date(Math.min(now.getTime() + WAITLIST_OFFER_HOURS * 60 * 60 * 1000, shiftStart.getTime()))
}
