// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from "node:crypto"
import { usesAvailability, type AnswerForFit } from "./availability-assist"
import { readAnswersForFit, readAvailabilityGate } from "./availability-assist-data"
import { inputParts, type InputPart, type ProposalConfig } from "./proposal-config"
import { DEFAULT_PROPOSAL_BUDGET, PROPOSAL_INPUT_VERSION, type ProposalInput, type ProposalPerson, type ProposalShift } from "./proposal-input"
import type { OrgScopedPrisma } from "./prisma-org"
import { COMMITTED_STATUSES, LIVE_STATUSES, OCCUPYING_STATUSES, type Tx } from "./registration-capacity"
import { roleLimits } from "./role-limit"
import { reservedRoles } from "./role-reservation"
import { orgTimeZone } from "./time-zone"
import { WORKLOAD_EVENT_SELECT, workloadGateOf } from "./workload-guard"
import { parsePersonalLimits } from "./workload-personal"

/**
 * The assignment proposal (#1172), server only: the frozen input of a run, read from the rows of an
 * event through the organisation's scoped client (or a transaction of it), and its fingerprints.
 *
 * - Every live shift of the event is in the input (a person's fixed missions outside the scope still
 *   count for their workload and overlaps); only the configuration's shifts are open to fill.
 * - Fixed: committed registrations (active, requested) and every pending draft kept by the run;
 *   held places: occupying registrations (active, offered, requested) and those kept drafts;
 *   poste limits count every live registration.
 * - The replacement set: the earlier proposal drafts the run may replace, frozen at launch (pending,
 *   unlocked, source « proposal », on a shift of the scope). A frozen row is left out of the input only
 *   while it is still pending, unlocked and at its frozen revision; otherwise it is kept like any draft.
 * - Every selected person needs an explicit hour target (EventVolunteerTarget, 0 for « no target »):
 *   a missing one is never read as 0.
 */

type Db = OrgScopedPrisma | Tx

export type Replacement = { id: string; revision: number }[]

export type SnapshotResult =
  | { ok: true; input: ProposalInput; replacement: Replacement; hashes: Record<InputPart, string>; inputHash: string; organizationId: string }
  | { ok: false; status: 404 | 409; error: string; code: "not_found" | "not_in_use" | "shift_gone" | "person_gone" | "targets_missing" }

const sha = (s: string) => createHash("sha256").update(s).digest("hex")

/** The fingerprint of an input: one hash per part, and their combination. */
export function hashInput(input: ProposalInput): { hashes: Record<InputPart, string>; inputHash: string } {
  const parts = inputParts(input)
  const hashes = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, sha(v)])) as Record<InputPart, string>
  return { hashes, inputHash: sha(Object.keys(hashes).sort().map((k) => `${k}:${hashes[k as InputPart]}`).join("|")) }
}

const SHIFT_SELECT = {
  id: true, roleName: true, date: true, startTime: true, endTime: true, status: true, capacity: true, minVolunteers: true, overlapAllowed: true,
  minAge: true, reservedTags: true, maxPerVolunteer: true, mealOnTheGo: true, placeId: true, place: { select: { name: true } },
} as const

type ShiftRow = {
  id: string; roleName: string; date: Date; startTime: string; endTime: string; status: string; capacity: number; minVolunteers: number | null; overlapAllowed: boolean
  minAge: number | null; reservedTags: string[]; maxPerVolunteer: number | null; mealOnTheGo: boolean; placeId: string | null; place: { name: string } | null
}

/** The answer with its dates in order: the fingerprint never depends on the order rows came in. */
const sortedAnswer = (a: AnswerForFit | null): AnswerForFit | null =>
  a ? { ...a, days: [...a.days].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0)) } : null

const day = (d: Date | string) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10))

/**
 * Builds the input of a run on `eventId`. `replacement`: the frozen set of a run, or "compute" at
 * launch. `now` is the reference instant written in the input (shifts already over are not open).
 */
export async function buildProposalSnapshot(db: Db, eventId: string, config: ProposalConfig, replacement: Replacement | "compute", now: Date, opts: { ownDrafts?: boolean } = {}): Promise<SnapshotResult> {
  const event = await db.event.findFirst({
    where: { id: eventId },
    select: { id: true, organizationId: true, availabilityEnabled: true, availabilityAdoptedAt: true, organization: { select: { timeZone: true } }, ...WORKLOAD_EVENT_SELECT },
  })
  if (!event) return { ok: false, status: 404, error: "Événement introuvable.", code: "not_found" }
  const gate = await readAvailabilityGate(db as never, eventId)
  if (!usesAvailability(event) || !gate.inUse) return { ok: false, status: 409, error: "Cet événement ne recueille pas les disponibilités.", code: "not_in_use" }
  const workload = workloadGateOf(event)

  const shiftRows = await db.shift.findMany({ where: { eventId, status: { not: "cancelled" } }, select: SHIFT_SELECT, orderBy: { id: "asc" } }) as unknown as ShiftRow[]
  const live = new Set(shiftRows.map((s) => s.id))
  const scope = new Set(config.scope.shiftIds)
  if ([...scope].some((id) => !live.has(id)) || config.nightShiftIds.some((id) => !live.has(id)) || config.categories.some((k) => k.shiftIds.some((id) => !live.has(id)))) {
    return { ok: false, status: 409, error: "Un créneau choisi n'existe plus ou est annulé : rechargez la page.", code: "shift_gone" }
  }

  const people = await db.volunteer.findMany({
    where: { id: { in: config.scope.volunteerIds }, organizationId: event.organizationId, active: true, erasedAt: null, mergedIntoId: null },
    select: { id: true, birthDate: true, tags: true },
    orderBy: { id: "asc" },
  })
  if (people.length !== new Set(config.scope.volunteerIds).size) return { ok: false, status: 409, error: "Une personne choisie n'est plus membre actif de l'organisation : rechargez la page.", code: "person_gone" }
  const ids = people.map((p) => p.id)

  const [regs, drafts, answers, limits, targets] = await Promise.all([
    db.registration.findMany({ where: { eventId, status: { in: [...LIVE_STATUSES] } }, select: { volunteerId: true, shiftId: true, status: true }, orderBy: { id: "asc" } }),
    db.draftAssignment.findMany({ where: { eventId, status: "draft" }, select: { id: true, revision: true, shiftId: true, volunteerId: true, source: true, locked: true }, orderBy: { id: "asc" } }),
    readAnswersForFit(db as never, eventId, ids),
    db.eventVolunteerLimit.findMany({ where: { eventId, volunteerId: { in: ids } }, select: { volunteerId: true, values: true } }),
    db.eventVolunteerTarget.findMany({ where: { eventId, volunteerId: { in: ids } }, select: { volunteerId: true, targetMinutes: true } }),
  ])
  const targetOf = new Map(targets.map((t) => [t.volunteerId, t.targetMinutes]))
  const missing = ids.filter((id) => !targetOf.has(id)).length
  if (missing > 0) return { ok: false, status: 409, error: `Fixez un objectif d'heures pour chaque personne choisie (0 pour aucun objectif) : ${missing} n'en ${missing > 1 ? "ont" : "a"} pas.`, code: "targets_missing" }

  // The replacement set, and the drafts the run keeps.
  const frozen: Replacement = replacement === "compute"
    ? drafts.filter((d) => d.source === "proposal" && !d.locked && scope.has(d.shiftId)).map((d) => ({ id: d.id, revision: d.revision }))
    : replacement
  const frozenRevision = new Map(frozen.map((r) => [r.id, r.revision]))
  // `ownDrafts` (a written run's freshness): its own drafts stay its own, locked or reviewed since.
  const replaced = new Set(drafts.filter((d) => frozenRevision.has(d.id) && (opts.ownDrafts || (frozenRevision.get(d.id) === d.revision && !d.locked)) && d.source === "proposal").map((d) => d.id))
  const kept = drafts.filter((d) => !replaced.has(d.id) && live.has(d.shiftId))

  const held = new Map<string, number>()
  const fixedOf = new Map<string, Set<string>>()
  const liveOf = new Map<string, Set<string>>()
  const add = (m: Map<string, Set<string>>, k: string, v: string) => (m.get(k) ?? m.set(k, new Set()).get(k)!).add(v)
  for (const r of regs) {
    if (!live.has(r.shiftId)) continue
    if ((OCCUPYING_STATUSES as readonly string[]).includes(r.status)) held.set(r.shiftId, (held.get(r.shiftId) ?? 0) + 1)
    if ((COMMITTED_STATUSES as readonly string[]).includes(r.status)) add(fixedOf, r.volunteerId, r.shiftId)
    add(liveOf, r.volunteerId, r.shiftId)
  }
  for (const d of kept) {
    held.set(d.shiftId, (held.get(d.shiftId) ?? 0) + 1)
    add(fixedOf, d.volunteerId, d.shiftId)
    add(liveOf, d.volunteerId, d.shiftId)
  }

  const reserved = reservedRoles(shiftRows)
  const limitOf = roleLimits(shiftRows)
  const reserveOf = new Map(config.reserve.map((r) => [r.shiftId, r.count]))
  const night = new Set(config.nightShiftIds)
  const categoryOf = new Map(config.categories.flatMap((k) => k.shiftIds.map((id) => [id, k.key] as const)))
  const shifts: ProposalShift[] = shiftRows.map((s) => ({
    id: s.id, roleName: s.roleName, date: day(s.date), startTime: s.startTime, endTime: s.endTime, capacity: s.capacity, minVolunteers: s.minVolunteers,
    held: held.get(s.id) ?? 0, overlapAllowed: s.overlapAllowed, minAge: s.minAge, reservedTags: reserved.get(s.roleName) ?? [], maxPerVolunteer: limitOf.get(s.roleName) ?? null,
    mealOnTheGo: s.mealOnTheGo, placeId: s.placeId, placeName: s.place?.name ?? null, category: categoryOf.get(s.id) ?? null, night: night.has(s.id),
    reserve: Math.min(s.capacity, reserveOf.get(s.id) ?? 0), inScope: scope.has(s.id),
  }))

  const personalOf = new Map(limits.map((l) => [l.volunteerId, parsePersonalLimits(l.values)]))
  const prefsOf = new Map(config.preferences.map((p) => [p.volunteerId, p]))
  const input: ProposalInput = {
    version: PROPOSAL_INPUT_VERSION,
    eventId,
    now: now.toISOString(),
    timeZone: orgTimeZone(event.organization),
    availability: { timeZone: gate.timeZone, dates: [...gate.dates] },
    policy: workload.kind === "on" ? workload.policy : null,
    rotation: config.rotation,
    seed: config.seed,
    budget: { evaluations: config.budget?.evaluations ?? DEFAULT_PROPOSAL_BUDGET.evaluations, stagnation: DEFAULT_PROPOSAL_BUDGET.stagnation },
    shifts,
    people: people.map((p): ProposalPerson => ({
      id: p.id,
      birthDate: p.birthDate ? day(p.birthDate) : null,
      tags: [...p.tags].sort(),
      answer: sortedAnswer(answers.get(p.id) ?? null),
      fixedShiftIds: [...(fixedOf.get(p.id) ?? [])].sort(),
      liveShiftIds: [...(liveOf.get(p.id) ?? [])].sort(),
      personal: personalOf.get(p.id) ?? null,
      targetMinutes: targetOf.get(p.id)!,
      prefer: [...(prefsOf.get(p.id)?.prefer ?? [])].sort(),
      avoid: [...(prefsOf.get(p.id)?.avoid ?? [])].sort(),
      inScope: true,
    })),
  }
  return { ok: true, input, replacement: frozen, ...hashInput(input), organizationId: event.organizationId }
}
