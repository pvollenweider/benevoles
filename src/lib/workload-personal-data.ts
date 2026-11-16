// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { committedDuty, lockVolunteerRows, lockWorkloadShared, readWorkloadGate } from "./workload-guard"
import { checkPersonalLimits, parsePersonalLayers, storedPersonalLayers, stricterLimits, type PersonalLayers } from "./workload-personal"
import { evaluateWorkload, newFindings, workloadFindingMessage, type PolicyProblem } from "./workload-policy"

/**
 * A person's own workload limits on one event (#1171, lot 2), server only: read, set and remove,
 * from the organiser's card or the person's link. Locks (Codex): the event's shared workload lock,
 * then the person's Volunteer row, then the limit is read and their schedule judged; never a shift
 * lock afterwards. Two layers: the organisation's and the person's own; each side sets or removes
 * only its layer, the stricter of the two applies, so an organiser never loosens what the person
 * asked for (Codex). Tightening limits that the person's current programme would break is refused
 * with the findings (like turning protection on); removing a layer is always possible.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export type PersonalLimitRow = { volunteerId: string; name: string; layers: PersonalLayers }

/** The people of the event with their own limits, by name (organisers only). */
export async function listPersonalLimits(db: Db, eventId: string): Promise<PersonalLimitRow[]> {
  const rows: { volunteerId: string; values: unknown; volunteer: { firstName: string; lastName: string } }[] = await db.eventVolunteerLimit.findMany({
    where: { eventId },
    select: { volunteerId: true, values: true, volunteer: { select: { firstName: true, lastName: true } } },
  })
  return rows
    .flatMap((r) => {
      const layers = parsePersonalLayers(r.values)
      return layers.admin || layers.volunteer ? [{ volunteerId: r.volunteerId, name: `${r.volunteer.firstName} ${r.volunteer.lastName}`.trim(), layers }] : []
    })
    .sort((a, b) => a.name.localeCompare(b.name, "fr"))
}

/** One person's limits on the event, layer by layer. */
export async function readPersonalLayers(db: Db, eventId: string, volunteerId: string): Promise<PersonalLayers> {
  const row = await db.eventVolunteerLimit.findFirst({ where: { eventId, volunteerId }, select: { values: true } })
  return parsePersonalLayers(row?.values)
}

export type PersonalSetResult =
  | { ok: true; layers: PersonalLayers; changed: boolean }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string; problems?: PolicyProblem[]; workload?: string[] }

export const PERSONAL_NEEDS_PROTECTION = "Les limites personnelles demandent que la protection des pauses et de la charge soit activée sur cet événement."

/**
 * Sets (`input`) or removes (`null`) one layer of a person's limits: `by` says whose. The person
 * must hold a place or a request on the event (the organiser's list and the link both come from one).
 */
export async function setPersonalLimits(db: Db, eventId: string, volunteerId: string, input: unknown | null, by: "admin" | "volunteer"): Promise<PersonalSetResult> {
  return db.$transaction(async (tx: Db): Promise<PersonalSetResult> => {
    await lockWorkloadShared(tx, eventId)
    const gate = await readWorkloadGate(tx, eventId)
    await lockVolunteerRows(tx, [volunteerId])
    const volunteer = await tx.volunteer.findFirst({ where: { id: volunteerId, erasedAt: null, mergedIntoId: null }, select: { birthDate: true } })
    const held = volunteer ? await committedDuty(tx, eventId, volunteerId) : []
    if (!volunteer || held.length === 0) return { ok: false, status: 404, error: "Personne introuvable sur cet événement." }
    const stored = await tx.eventVolunteerLimit.findFirst({ where: { eventId, volunteerId }, select: { values: true } })
    const layers = parsePersonalLayers(stored?.values)
    const prev = stricterLimits(layers.admin, layers.volunteer)

    const write = async (next: PersonalLayers) => {
      const values = storedPersonalLayers(next)
      if (!values) await tx.eventVolunteerLimit.deleteMany({ where: { eventId, volunteerId } })
      else await tx.eventVolunteerLimit.upsert({ where: { eventId_volunteerId: { eventId, volunteerId } }, create: { eventId, volunteerId, values, updatedBy: by }, update: { values, updatedBy: by } })
    }

    if (input === null) {
      if (!layers[by]) return { ok: true, layers, changed: false }
      const next = { ...layers, [by]: null }
      await write(next)
      return { ok: true, layers: next, changed: true }
    }

    if (gate.kind !== "on") return { ok: false, status: 409, error: PERSONAL_NEEDS_PROTECTION }
    const checked = checkPersonalLimits(input, gate.policy)
    if (!checked.ok) return { ok: false, status: 400, error: checked.problems[0].message, problems: checked.problems }
    const nextLayers = { ...layers, [by]: checked.limits }
    const next = stricterLimits(nextLayers.admin, nextLayers.volunteer)
    // Refused while the current programme would break them (new or worse findings), like a tightening.
    const duty = held.map(({ id, date, startTime, endTime, mealOnTheGo, placeId, placeName }) => ({ id, date, startTime, endTime, mealOnTheGo, placeId, placeName }))
    const added = newFindings(
      evaluateWorkload(duty, gate.policy, { birthDate: volunteer.birthDate, personal: prev }),
      evaluateWorkload(duty, gate.policy, { birthDate: volunteer.birthDate, personal: next }),
    )
    if (added.length > 0) {
      return {
        ok: false, status: 409,
        error: "Ces limites ne sont pas respectées par le programme actuel : rien n'a été enregistré. Il faut d'abord retirer ou déplacer des missions.",
        workload: added.map((f) => workloadFindingMessage(f, gate.policy)),
      }
    }
    await write(nextLayers)
    return { ok: true, layers: nextLayers, changed: JSON.stringify(layers[by]) !== JSON.stringify(checked.limits) }
  })
}
