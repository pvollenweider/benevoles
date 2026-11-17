// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * How often the public sign-up runs its transaction again when the state it read before it moved
 * meanwhile (the member found lost the address, or a concurrent request created the member).
 */
export const SIGNUP_ATTEMPTS = 3

/**
 * What the public sign-up does after a duplicate key, once its transaction rolled back:
 * - `already_registered`: the address's member exists and this request proves the address;
 * - `retry`: the member exists (a concurrent request created it between this request's read and
 *   its write) and attempts remain: run again with that member, so the usual path decides, the
 *   same as for any request without proof of the address (recorded, or a notice to the owner);
 * - `notice`: the same, attempts spent: the owner is told by email;
 * - `refuse`: no member holds the address, the duplicate is of another kind.
 */
export type UniqueViolationStep = "already_registered" | "retry" | "notice" | "refuse"

export function uniqueViolationStep(o: { ownerFound: boolean; ownsEmail: boolean; attempt: number }): UniqueViolationStep {
  if (!o.ownerFound) return "refuse"
  if (o.ownsEmail) return "already_registered"
  return o.attempt < SIGNUP_ATTEMPTS ? "retry" : "notice"
}
