// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The one business rule of publication: an event with no live shift can't be published, the
 * volunteers would have nothing to choose. Checked by the API (create, edit, publish toggle), so
 * every interface gets the same 409 whatever path it takes.
 */

export const PUBLISH_WITHOUT_SHIFT_ERROR =
  "Impossible de publier un événement sans créneau : ajoutez au moins un créneau, puis publiez."

type ShiftCounter = { shift: { count: (args: { where: { eventId: string; status: { not: string } } }) => Promise<number> } }

/** Why the event can't be published now, or null. */
export async function publishBlocker(db: ShiftCounter, eventId: string): Promise<string | null> {
  const live = await db.shift.count({ where: { eventId, status: { not: "cancelled" } } })
  return live > 0 ? null : PUBLISH_WITHOUT_SHIFT_ERROR
}

/** Whether a status change is a publication (draft or archived → published). */
export function isPublishing(before: string | null | undefined, after: string | undefined): boolean {
  return after === "published" && before !== "published"
}
