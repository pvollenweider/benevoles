// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Database side of follow-up questions (#1016), server-only: the event's active questions as the
 * rules read them, and the positions rewritten so every follow-up sits right after its parent.
 * Always through the org-scoped client and for one event: a parent of another event or another
 * organisation is never found.
 */
import type { OrgScopedPrisma as OrgDb } from "./prisma-org"
import { normalisedOrder } from "./question-follow-up"

export const followUpSelect = { id: true, label: true, type: true, options: true, parentId: true, showIfValues: true, position: true } as const

/** The event's active questions, in their current order, with what the follow-up rules read. */
export function activeQuestions(db: OrgDb, eventId: string) {
  return db.eventQuestion.findMany({ where: { eventId, archivedAt: null }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: followUpSelect })
}

/**
 * Rewrites the positions of the event's active questions: `ids` in that order (or the current one),
 * each follow-up moved right after its parent. Only the rows whose position changes are written.
 */
export async function normalisePositions(db: OrgDb, eventId: string, ids?: string[]): Promise<void> {
  const active = await activeQuestions(db, eventId)
  const byId = new Map(active.map((q) => [q.id, q]))
  const ordered = ids ? ids.map((id) => byId.get(id)).filter((q): q is (typeof active)[number] => !!q) : active
  const order = normalisedOrder(ordered)
  const writes = order.map((id, position) => ({ id, position })).filter((w) => byId.get(w.id)!.position !== w.position)
  if (writes.length === 0) return
  await db.$transaction(writes.map((w) => db.eventQuestion.update({ where: { id: w.id }, data: { position: w.position } })))
}
