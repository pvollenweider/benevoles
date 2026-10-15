// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { roleOverlapAllowed } from "./shift-overlap"

type ShiftReader = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shift: { findMany(args: any): Promise<{ roleName: string; overlapAllowed: boolean }[]> }
}

/**
 * The role's « Cumulable avec un autre créneau » option (#986), read from its live shifts on the
 * event, for a shift created in the role or moved to it: the new shift takes the role's value, so
 * the option stays the role's. A role without live shift yet (new, or deleted then recreated) has
 * it off. Server only; the caller passes its org-scoped client.
 */
export async function roleOverlapSetting(db: ShiftReader, eventId: string, roleName: string): Promise<boolean> {
  const shifts = await db.shift.findMany({
    where: { eventId, roleName, status: { not: "cancelled" } },
    select: { roleName: true, overlapAllowed: true },
  })
  return roleOverlapAllowed(shifts, roleName)
}
