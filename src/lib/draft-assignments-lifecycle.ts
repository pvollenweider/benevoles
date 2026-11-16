// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { MERGE_STAMP } from "./draft-assignments"
import type { Tx } from "./registration-capacity"

/**
 * Draft assignments (#1146, lot C) in the member operations, server only and light on imports (the
 * merge transaction loads it). Erasure and the past-event anonymisation delete the rows themselves
 * (src/lib/member-erasure-transaction.ts, src/lib/past-event-anonymisation.ts).
 */

/**
 * A member merge (#600), in its transaction with both Volunteer rows locked: the absorbed record's
 * drafts move to the kept one. A pending draft whose shift the kept record already has a pending
 * draft on is discarded (the kept one stays); every moved pending draft loses its review and its
 * acknowledgement (another person's answer judged it), so it is « à revoir ». Published and
 * discarded rows move as they are (provenance). Returns how many were discarded.
 */
export async function mergeDraftAssignments(tx: Tx, keepId: string, absorbId: string): Promise<{ moved: number; discarded: number }> {
  const absorbed = await tx.draftAssignment.findMany({ where: { volunteerId: absorbId }, select: { id: true, shiftId: true, status: true }, orderBy: { id: "asc" } })
  if (absorbed.length === 0) return { moved: 0, discarded: 0 }
  const keptPending = new Set((await tx.draftAssignment.findMany({ where: { volunteerId: keepId, status: "draft" }, select: { shiftId: true } })).map((d) => d.shiftId))
  let discarded = 0
  const now = new Date()
  for (const d of absorbed) {
    if (d.status !== "draft") {
      await tx.draftAssignment.update({ where: { id: d.id }, data: { volunteerId: keepId } })
      continue
    }
    const collides = keptPending.has(d.shiftId)
    if (collides) discarded++
    await tx.draftAssignment.update({
      where: { id: d.id },
      data: {
        volunteerId: keepId, availabilityStamp: MERGE_STAMP, ackKey: null, acknowledgedAt: null, acknowledgedById: null, revision: { increment: 1 },
        ...(collides ? { status: "discarded", discardedAt: now } : {}),
      },
    })
    if (!collides) keptPending.add(d.shiftId)
  }
  return { moved: absorbed.length, discarded }
}
