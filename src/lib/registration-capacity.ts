// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { prisma } from "./prisma"

/**
 * Shared rules for placing registrations on a shift under concurrency (#264).
 *
 * Every decision that depends on how many people already hold a spot (register as active vs
 * waitlist, which waitlist position, whether a freed spot can be offered) runs inside an
 * interactive transaction that first locks the shift rows with `lockShifts` — so two requests
 * racing for the last spot are serialized per shift instead of both reading "one spot left".
 * Duplicate live registrations are additionally blocked by the partial unique index
 * Registration_shift_volunteer_live_key; `isUniqueViolation` maps it to a clean 409.
 */

export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

/** Statuses of a registration that still exists from the volunteer's point of view. */
export const LIVE_STATUSES = ["active", "waiting", "offered", "requested"] as const

/**
 * Statuses that hold a spot out of `capacity`. "offered" counts: the spot is reserved for the
 * waitlisted volunteer until they confirm or the offer expires, so a new sign-up can't take it.
 * "requested" counts too (#484): a request waiting for the organizer's decision keeps its spot,
 * so the last place can't collect unlimited requests; a refusal frees it.
 */
export const OCCUPYING_STATUSES = ["active", "offered", "requested"] as const

/**
 * Registrations that commit the volunteer to the shift's hours, for the overlap check: a
 * confirmed place or a pending request (#484). The waitlist doesn't: it isn't a place yet.
 */
export const COMMITTED_STATUSES = ["active", "requested"] as const

/**
 * Row-locks the given shifts until the end of the transaction. Ordered by id so two
 * transactions locking overlapping sets always acquire them in the same order (no deadlock).
 */
export async function lockShifts(tx: Pick<Tx, "$queryRaw">, shiftIds: string[]): Promise<void> {
  if (shiftIds.length === 0) return
  await tx.$queryRaw`SELECT id FROM "Shift" WHERE id = ANY(${shiftIds}::text[]) ORDER BY id FOR UPDATE`
}

export type Placement =
  | { status: "active" }
  | { status: "requested" }
  | { status: "waiting"; waitingPosition: number }
  | { status: "full" }

/** Where a new registration goes, given the shift's state read under lock. */
export function planPlacement(input: {
  capacity: number
  occupied: number
  waitlistEnabled: boolean
  maxWaitingPosition: number | null
  /** The shift is « Sur validation » (#484): a free spot becomes a request, not a place. */
  requiresApproval?: boolean
}): Placement {
  if (input.occupied < input.capacity) return { status: input.requiresApproval ? "requested" : "active" }
  if (!input.waitlistEnabled) return { status: "full" }
  return { status: "waiting", waitingPosition: (input.maxWaitingPosition ?? 0) + 1 }
}

/** Whether a freed spot can be offered to the next person on the waitlist. */
export function canOfferSpot(input: { capacity: number; occupied: number; shiftStatus: string }): boolean {
  return input.shiftStatus !== "cancelled" && input.occupied < input.capacity
}

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002"
}

export class ShiftFullError extends Error {
  constructor(readonly shiftId: string, readonly label: string) {
    super(`Shift ${shiftId} is full`)
  }
}
