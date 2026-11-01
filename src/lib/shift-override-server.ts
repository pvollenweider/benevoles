// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { OCCUPYING_STATUSES } from "./registration-capacity"
import { guardShiftPlacement, shiftOverrideBody, type OverrideVia, type ShiftOverrideNeed } from "./shift-override"

/**
 * The full or closed shift check (AUTHZ-15), server only; the rules are in src/lib/shift-override.ts.
 * Called inside the write's transaction, after the shifts are locked (lockShifts), so the status,
 * places and spots read here are those of the commit.
 */

// The org-scoped client's transaction or the raw one: both read shifts and registrations alike.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

type ShiftRow = { id: string; roleName: string; label: string; date: Date; startTime: string; endTime: string; status: string; capacity: number }
type Need = ShiftOverrideNeed & { roleName: string; label: string; date: string; startTime: string; endTime: string }

/** A cancelled shift among those chosen: nothing is written. */
export class ShiftCancelledError extends Error {
  constructor(readonly label: string) {
    super("Shift cancelled")
  }
}

/** A full or closed shift without its confirmation (or with a stale one): nothing is written. */
export class ShiftOverrideError extends Error {
  constructor(readonly needs: Need[]) {
    super("Shift override missing")
  }
  body() {
    return shiftOverrideBody(this.needs)
  }
}

/**
 * Judges each shift for one more person. `subjectOf` gives the key's subject per shift (the person
 * for a manual add, the registration for an acceptance or a restore); `exceptRegistrationIds`
 * leaves out the registration being accepted or restored, so it never counts against itself.
 * Returns the confirmations used, for the event log; throws on a cancelled shift or a missing key.
 */
export async function checkShiftOverrides(
  tx: Db,
  via: OverrideVia,
  shiftIds: readonly string[],
  subjectOf: (shiftId: string) => string,
  given: readonly string[],
  opts: { exceptRegistrationIds?: readonly string[] } = {},
): Promise<Map<string, ShiftOverrideNeed>> {
  if (shiftIds.length === 0) return new Map()
  const rows: ShiftRow[] = await tx.shift.findMany({
    where: { id: { in: [...shiftIds] } },
    select: { id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, status: true, capacity: true },
  })
  // One count per shift: a manual add takes at most a person's programme (MAX_SHIFTS).
  const occupiedOf = new Map<string, number>()
  for (const id of shiftIds) {
    occupiedOf.set(id, await tx.registration.count({
      where: {
        shiftId: id,
        status: { in: [...OCCUPYING_STATUSES] },
        ...(opts.exceptRegistrationIds?.length ? { id: { notIn: [...opts.exceptRegistrationIds] } } : {}),
      },
    }))
  }
  const confirmed = new Map<string, ShiftOverrideNeed>()
  const missing: Need[] = []
  const accepted = new Set(given)
  for (const id of shiftIds) {
    const row = rows.find((r) => r.id === id)
    if (!row) continue
    const guard = guardShiftPlacement(via, subjectOf(id), { id, status: row.status, capacity: row.capacity, occupied: occupiedOf.get(id) ?? 0 })
    if (guard.kind === "cancelled") throw new ShiftCancelledError(row.label || row.roleName)
    if (guard.kind !== "confirm") continue
    if (accepted.has(guard.need.key)) confirmed.set(id, guard.need)
    else missing.push({ ...guard.need, roleName: row.roleName, label: row.label, date: row.date.toISOString().slice(0, 10), startTime: row.startTime, endTime: row.endTime })
  }
  if (missing.length > 0) throw new ShiftOverrideError(missing)
  return confirmed
}
