// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { OrgScopedPrisma } from "./prisma-org"
import type { Tx } from "./registration-capacity"

/**
 * The organiser's hour targets per person and event (#1172, EventVolunteerTarget), server only: what
 * a proposal aims at for each person (C04: fairness against each one's commitment, not equal hours).
 * A target is a wish, never a limit. Saved in one transaction, all or nothing, each row bound to the
 * revision the organiser saw; `null` removes it.
 */

/** Largest target accepted: 30 days of duty, far above any event's own maximum. */
export const MAX_TARGET_MINUTES = 30 * 24 * 60
export const MAX_TARGETS_PER_SAVE = 300

export type TargetRow = { volunteerId: string; targetMinutes: number; revision: number }

export async function listTargets(db: OrgScopedPrisma, eventId: string): Promise<TargetRow[] | null> {
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true } })
  if (!event) return null
  return db.eventVolunteerTarget.findMany({ where: { eventId }, select: { volunteerId: true, targetMinutes: true, revision: true }, orderBy: { volunteerId: "asc" } })
}

export type TargetChange = { volunteerId: string; targetMinutes: number | null; revision?: number | null }

export type SaveTargetsResult = { ok: true; saved: number; removed: number } | { ok: false; status: 400 | 404 | 409; error: string }

export async function saveTargets(db: OrgScopedPrisma, input: { eventId: string; organizationId: string; changes: TargetChange[]; actorId: string | null }): Promise<SaveTargetsResult> {
  const ids = input.changes.map((c) => c.volunteerId)
  if (new Set(ids).size !== ids.length) return { ok: false, status: 400, error: "Une personne figure deux fois." }
  if (input.changes.some((c) => c.targetMinutes != null && (!Number.isInteger(c.targetMinutes) || c.targetMinutes < 0 || c.targetMinutes > MAX_TARGET_MINUTES))) {
    return { ok: false, status: 400, error: "Un objectif d'heures doit être un nombre de minutes entre 0 et 30 jours." }
  }
  try {
    return await saveInTransaction(db, input, ids)
  } catch (e) {
    // Two first saves for the same person at once: the second meets the unique key.
    if ((e as { code?: string }).code === "P2002") return { ok: false, status: 409, error: "Des objectifs d'heures ont changé depuis l'ouverture de la page : rechargez-la." }
    throw e
  }
}

async function saveInTransaction(db: OrgScopedPrisma, input: { eventId: string; organizationId: string; changes: TargetChange[]; actorId: string | null }, ids: string[]): Promise<SaveTargetsResult> {
  return db.$transaction(async (raw) => {
    const tx = raw as unknown as Tx
    const event = await tx.event.findFirst({ where: { id: input.eventId }, select: { id: true } })
    if (!event) return { ok: false as const, status: 404 as const, error: "Événement introuvable." }
    const members = await tx.volunteer.findMany({ where: { id: { in: ids }, organizationId: input.organizationId, active: true, erasedAt: null, mergedIntoId: null }, select: { id: true } })
    if (members.length !== ids.length) return { ok: false as const, status: 404 as const, error: "Une personne n'est pas membre actif de l'organisation." }
    const rows = await tx.eventVolunteerTarget.findMany({ where: { eventId: input.eventId, volunteerId: { in: ids } }, select: { id: true, volunteerId: true, revision: true } })
    const rowOf = new Map(rows.map((r) => [r.volunteerId, r]))
    if (input.changes.some((c) => c.revision != null && (rowOf.get(c.volunteerId)?.revision ?? 0) !== c.revision)) {
      return { ok: false as const, status: 409 as const, error: "Des objectifs d'heures ont changé depuis l'ouverture de la page : rechargez-la." }
    }
    let saved = 0, removed = 0
    for (const c of [...input.changes].sort((a, b) => (a.volunteerId < b.volunteerId ? -1 : 1))) {
      const row = rowOf.get(c.volunteerId)
      if (c.targetMinutes == null) {
        if (row) { await tx.eventVolunteerTarget.deleteMany({ where: { id: row.id, eventId: input.eventId } }); removed++ }
        continue
      }
      if (row) await tx.eventVolunteerTarget.updateMany({ where: { id: row.id, eventId: input.eventId }, data: { targetMinutes: c.targetMinutes, updatedById: input.actorId, revision: { increment: 1 } } })
      else await tx.eventVolunteerTarget.create({ data: { eventId: input.eventId, volunteerId: c.volunteerId, targetMinutes: c.targetMinutes, updatedById: input.actorId } })
      saved++
    }
    return { ok: true as const, saved, removed }
  })
}
