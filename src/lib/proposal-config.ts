// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { z } from "zod"
import { MAX_PROPOSAL_PEOPLE, MAX_PROPOSAL_SHIFTS, type ProposalInput } from "./proposal-input"

/**
 * The assignment proposal (#1172): what the organiser chooses for one run, its checks, its
 * canonical form (what makes two requests « the same ») and the fingerprints of an input (what makes
 * a run stale). Pure, Prisma-free.
 *
 * Everything is explicit ids, resolved by the screen: the shifts of the scope (sectors and dates
 * are a way to pick them), the people, the standby reserve per shift, the night add-ons and the
 * rotation categories (Codex 2026-10-30: kept with the run, not on the shifts; a poste outside every
 * category is its own category, never matched by name), the preferences per person, the seed and
 * the budget.
 */

const id = z.string().min(1).max(100)
const roleName = z.string().min(1).max(200)

/** Bounds of one run's budget: enough for any event the product serves, never an endless search. */
export const PROPOSAL_BUDGET_RANGE = { min: 100, max: 100_000 } as const

export const proposalConfigSchema = z.object({
  scope: z.object({
    shiftIds: z.array(id).min(1).max(MAX_PROPOSAL_SHIFTS),
    volunteerIds: z.array(id).min(1).max(MAX_PROPOSAL_PEOPLE),
  }),
  reserve: z.array(z.object({ shiftId: id, count: z.number().int().min(1).max(500) })).max(MAX_PROPOSAL_SHIFTS).default([]),
  nightShiftIds: z.array(id).max(MAX_PROPOSAL_SHIFTS).default([]),
  categories: z.array(z.object({
    key: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
    name: z.string().trim().min(1).max(80),
    shiftIds: z.array(id).min(1).max(MAX_PROPOSAL_SHIFTS),
  })).max(50).default([]),
  rotation: z.object({
    maxConsecutiveDays: z.number().int().min(1).max(31).nullable(),
    maxNightAddOns: z.number().int().min(0).max(100).nullable(),
  }),
  preferences: z.array(z.object({
    volunteerId: id,
    prefer: z.array(roleName).max(30).default([]),
    avoid: z.array(roleName).max(30).default([]),
  })).max(MAX_PROPOSAL_PEOPLE).default([]),
  seed: z.number().int().min(0).max(4_294_967_295),
  budget: z.object({ evaluations: z.number().int().min(PROPOSAL_BUDGET_RANGE.min).max(PROPOSAL_BUDGET_RANGE.max) }).optional(),
})

export type ProposalConfig = z.infer<typeof proposalConfigSchema>

const duplicates = (list: readonly string[]) => list.length !== new Set(list).size

/**
 * What is wrong with a parsed configuration, in the organiser's words, or null. The event's own
 * ids (shifts of the event, active members) are checked by the server against its rows.
 */
export function configProblem(c: ProposalConfig): string | null {
  if (duplicates(c.scope.shiftIds) || duplicates(c.scope.volunteerIds)) return "Un créneau ou une personne figure deux fois dans la sélection."
  const inScope = new Set(c.scope.shiftIds)
  if (duplicates(c.reserve.map((r) => r.shiftId))) return "Une réserve est demandée deux fois sur le même créneau."
  if (c.reserve.some((r) => !inScope.has(r.shiftId))) return "Une réserve est demandée sur un créneau qui n'est pas dans la sélection."
  if (duplicates(c.nightShiftIds)) return "Un ajout de nuit figure deux fois."
  if (duplicates(c.categories.map((k) => k.key))) return "Deux catégories de rotation ont la même clé."
  if (duplicates(c.categories.map((k) => k.name.toLocaleLowerCase("fr-FR")))) return "Deux catégories de rotation ont le même nom."
  if (duplicates(c.categories.flatMap((k) => k.shiftIds))) return "Un créneau est dans deux catégories de rotation."
  const people = new Set(c.scope.volunteerIds)
  if (duplicates(c.preferences.map((p) => p.volunteerId))) return "Les préférences d'une personne figurent deux fois."
  if (c.preferences.some((p) => !people.has(p.volunteerId))) return "Des préférences concernent une personne qui n'est pas dans la sélection."
  if (c.preferences.some((p) => p.prefer.some((r) => p.avoid.includes(r)))) return "Un poste ne peut pas être à la fois souhaité et à éviter pour la même personne."
  return null
}

/** Every shift id the configuration names (to check they all belong to the event). */
export function configShiftIds(c: ProposalConfig): string[] {
  return [...new Set([...c.scope.shiftIds, ...c.reserve.map((r) => r.shiftId), ...c.nightShiftIds, ...c.categories.flatMap((k) => k.shiftIds)])].sort()
}

const sortIds = (list: readonly string[]) => [...list].sort()

/** The configuration in canonical order: two requests that mean the same thing give the same string. */
export function canonicalConfig(c: ProposalConfig): string {
  return stableStringify({
    scope: { shiftIds: sortIds(c.scope.shiftIds), volunteerIds: sortIds(c.scope.volunteerIds) },
    reserve: [...c.reserve].sort((a, b) => (a.shiftId < b.shiftId ? -1 : 1)),
    nightShiftIds: sortIds(c.nightShiftIds),
    categories: [...c.categories].map((k) => ({ ...k, shiftIds: sortIds(k.shiftIds) })).sort((a, b) => (a.key < b.key ? -1 : 1)),
    rotation: c.rotation,
    preferences: [...c.preferences].map((p) => ({ volunteerId: p.volunteerId, prefer: sortIds(p.prefer), avoid: sortIds(p.avoid) })).sort((a, b) => (a.volunteerId < b.volunteerId ? -1 : 1)),
    seed: c.seed,
    budget: c.budget ?? null,
  })
}

/** JSON with object keys sorted at every level; Dates as ISO strings. Deterministic. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]))
  }
  return value
}

/**
 * The parts of an input that tell why a run is stale, each as a canonical string (the server
 * hashes them). `now`, the seed and the budget are not inputs of the planning: they never make a
 * run stale (an ended shift is checked again with the current time when drafts are written).
 */
export type InputPart = "availability" | "shifts" | "commitments" | "people" | "policy" | "targets" | "choices"

export const INPUT_PART_WORDS: Record<InputPart, string> = {
  availability: "des disponibilités ont changé",
  shifts: "des créneaux ont changé",
  commitments: "des inscriptions ou des brouillons ont changé",
  people: "des fiches de membres ont changé (âge, étiquettes, limites personnelles)",
  policy: "la protection des pauses et de la charge a changé",
  targets: "des objectifs d'heures ont changé",
  choices: "le périmètre a changé",
}

export function inputParts(input: ProposalInput): Record<InputPart, string> {
  const byId = <T extends { id: string }>(list: readonly T[]) => [...list].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const people = byId(input.people)
  return {
    availability: stableStringify({ zone: input.availability, answers: people.map((p) => [p.id, p.answer]) }),
    // Places held are commitments, not the shift's terms: counted below, neutral here.
    shifts: stableStringify(byId(input.shifts).map((s) => ({ ...s, held: 0 }))),
    commitments: stableStringify({ held: byId(input.shifts).map((s) => [s.id, s.held]), people: people.map((p) => [p.id, sortIds(p.fixedShiftIds), sortIds(p.liveShiftIds)]) }),
    people: stableStringify(people.map((p) => [p.id, p.birthDate, sortIds(p.tags), p.personal, p.inScope])),
    policy: stableStringify(input.policy),
    targets: stableStringify(people.map((p) => [p.id, p.targetMinutes])),
    choices: stableStringify({ rotation: input.rotation, preferences: people.map((p) => [p.id, sortIds(p.prefer), sortIds(p.avoid)]) }),
  }
}

/** The parts that differ between two sets of fingerprints, in a stable order. */
export function changedParts(before: Partial<Record<InputPart, string>>, after: Partial<Record<InputPart, string>>): InputPart[] {
  return (Object.keys(INPUT_PART_WORDS) as InputPart[]).filter((k) => before[k] !== after[k])
}

/** « Proposition périmée : des disponibilités ont changé, des créneaux ont changé. » */
export function staleSentence(parts: readonly InputPart[]): string | null {
  if (parts.length === 0) return null
  return `Proposition périmée : ${parts.map((p) => INPUT_PART_WORDS[p]).join(", ")}. Relancez une proposition pour en tenir compte ; la publication vérifie de toute façon chaque règle.`
}

// ── Scrubbing ─────────────────────────────────────────────────────────────────────────────────

type Json = unknown
const asObject = (v: Json) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

/**
 * A run's stored data without one person (erasure, merge of an absorbed record): their place in the
 * configuration and the snapshot, their assignments, their lines of the report and of the write
 * receipt. Aggregated counts that name nobody stay. The snapshot can no longer be replayed: the
 * caller marks the run so. Pure.
 */
export function scrubPersonFromRun(run: { configuration: Json; snapshot: Json; result: Json; written: Json; progress: Json }, personId: string): { configuration: Json; snapshot: Json; result: Json; written: Json; progress: Json } {
  const notMe = (x: unknown) => asObject(x)?.volunteerId !== personId
  const config = asObject(run.configuration)
  const configuration = config ? {
    ...config,
    scope: { ...asObject(config.scope), volunteerIds: ((asObject(config.scope)?.volunteerIds as string[] | undefined) ?? []).filter((v) => v !== personId) },
    preferences: ((config.preferences as unknown[] | undefined) ?? []).filter(notMe),
  } : run.configuration
  const snap = asObject(run.snapshot)
  const snapshot = snap ? { ...snap, people: ((snap.people as unknown[] | undefined) ?? []).filter((p) => asObject(p)?.id !== personId) } : run.snapshot
  const res = asObject(run.result)
  const report = asObject(res?.report)
  const result = res ? {
    ...res,
    assignments: ((res.assignments as unknown[] | undefined) ?? []).filter(notMe),
    ...(report ? { report: { ...report, assignments: ((report.assignments as unknown[] | undefined) ?? []).filter(notMe), people: ((report.people as unknown[] | undefined) ?? []).filter(notMe) } } : {}),
  } : run.result
  const w = asObject(run.written)
  const written = w ? { ...w, created: ((w.created as unknown[] | undefined) ?? []).filter(notMe), dropped: ((w.dropped as unknown[] | undefined) ?? []).filter(notMe) } : run.written
  return { configuration, snapshot, result, written, progress: run.progress }
}

/** Set on a run whose stored data lost a person: never equal to a real fingerprint, so it reads as stale. */
export const SCRUBBED_HASH = "scrubbed"
