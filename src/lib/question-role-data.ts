// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Reads for a question's poste (#984, part 3), server side, through the request's org-scoped
 * client. Apart from question-role.ts, which the editor imports in the browser.
 */
type ShiftReader = {
  shift: { findMany: (args: { where: { eventId: string; status: { not: string } }; select: { roleName: true }; distinct: ["roleName"] }) => Promise<{ roleName: string }[]> }
}

/** The event's postes: the role names of its live shifts. */
export async function liveRoleNames(db: ShiftReader, eventId: string): Promise<string[]> {
  const shifts = await db.shift.findMany({ where: { eventId, status: { not: "cancelled" } }, select: { roleName: true }, distinct: ["roleName"] })
  return shifts.map((s) => s.roleName)
}
