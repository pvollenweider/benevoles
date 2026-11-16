// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Taking a shift removes a « Je ne peux pas » answer for it (#1303): there is no separate undo,
 * and the search list must stop showing the reason. Called in the same transaction that creates
 * or reactivates a live registration, so the two commit together. Returns the number of answers
 * removed (0 in the ordinary case).
 *
 * No Prisma import: the caller passes its transaction client, and the pure domain modules that
 * call it stay testable without a database.
 */
export type ShiftDeclineDeleteDb = {
  shiftDecline: {
    deleteMany: (args: { where: { volunteerId: string; shiftId: { in: string[] } } }) => Promise<{ count: number }>
  }
}

export async function clearShiftDeclines(
  db: ShiftDeclineDeleteDb,
  volunteerId: string,
  shiftIds: readonly string[],
): Promise<number> {
  const ids = [...new Set(shiftIds)]
  if (ids.length === 0) return 0
  const { count } = await db.shiftDecline.deleteMany({ where: { volunteerId, shiftId: { in: ids } } })
  return count
}
