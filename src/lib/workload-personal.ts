// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A person's own workload limits on one event (#1171, lot 2, Codex point 8): each field stricter
 * than or equal to the event's protection, never looser, set by an organiser or by the person from
 * their personal link, without any reason. Stored as versioned JSON (EventVolunteerLimit.values) in
 * two layers, the organiser's and the person's own: the stricter of the two applies, and each side
 * changes only its own layer (Codex: an organiser never loosens what the person asked for). A field
 * absent follows the event. Pure (the card, the personal page and their tests read it).
 */
import { fmtDuration } from "./signup-recap"
import {
  isMinimumField, PERSONAL_FIELDS, stricterOf, stricterProblems, STRICTER_LABELS,
  type PersonalField, type PersonalLimits, type PolicyProblem, type WorkloadLimitsV1,
} from "./workload-policy"

export const PERSONAL_LIMITS_VERSION = 1

/** The two layers of a person's limits: set by the organisation, and asked by the person. */
export type PersonalLayers = { admin: PersonalLimits | null; volunteer: PersonalLimits | null }

function readLayer(value: unknown): PersonalLimits | null | false {
  if (value === undefined || value === null) return null
  if (typeof value !== "object") return false
  const v = value as Record<string, unknown>
  if (Object.keys(v).some((k) => !(PERSONAL_FIELDS as readonly string[]).includes(k))) return false
  const out: PersonalLimits = {}
  for (const f of PERSONAL_FIELDS) {
    const n = v[f]
    if (n === undefined) continue
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return false
    out[f] = n
  }
  return Object.keys(out).length > 0 ? out : null
}

/** Strict read of the stored layers; anything unknown or out of shape reads as « no personal limit ». */
export function parsePersonalLayers(value: unknown): PersonalLayers {
  const none = { admin: null, volunteer: null }
  const v = (value && typeof value === "object" ? value : null) as Record<string, unknown> | null
  if (!v || v.version !== PERSONAL_LIMITS_VERSION) return none
  if (Object.keys(v).some((k) => k !== "version" && k !== "admin" && k !== "volunteer")) return none
  const admin = readLayer(v.admin), volunteer = readLayer(v.volunteer)
  if (admin === false || volunteer === false) return none
  return { admin, volunteer }
}

/** The limits that apply: the stricter value of each field of the two layers. */
export function parsePersonalLimits(value: unknown): PersonalLimits | null {
  const { admin, volunteer } = parsePersonalLayers(value)
  return stricterLimits(admin, volunteer)
}

/** What to store; null when both layers are empty (the row is then deleted). */
export function storedPersonalLayers(layers: PersonalLayers): { version: number; admin?: PersonalLimits; volunteer?: PersonalLimits } | null {
  if (!layers.admin && !layers.volunteer) return null
  return { version: PERSONAL_LIMITS_VERSION, ...(layers.admin ? { admin: layers.admin } : {}), ...(layers.volunteer ? { volunteer: layers.volunteer } : {}) }
}

/**
 * Checks typed values against the event's limits: whole minutes in range, each stricter than or
 * equal to the event's; empty fields follow the event; at least one value.
 */
export function checkPersonalLimits(value: unknown, event: Pick<WorkloadLimitsV1, PersonalField>): { ok: true; limits: PersonalLimits } | { ok: false; problems: PolicyProblem[] } {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>
  if (Object.keys(v).some((k) => !(PERSONAL_FIELDS as readonly string[]).includes(k))) {
    return { ok: false, problems: [{ field: "version", message: "Limite inconnue." }] }
  }
  const problems = stricterProblems(v, event, (f) => `personal${f.charAt(0).toUpperCase()}${f.slice(1)}`, "Limite personnelle", false)
  if (problems.length > 0) return { ok: false, problems }
  const limits: PersonalLimits = {}
  for (const f of PERSONAL_FIELDS) if (typeof v[f] === "number") limits[f] = v[f] as number
  if (Object.keys(limits).length === 0) return { ok: false, problems: [{ field: "version", message: "Indiquez au moins une limite, plus stricte que celle de l'événement." }] }
  const cont = limits.maxContinuousMinutes, daily = limits.maxDailyMinutes ?? event.maxDailyMinutes
  if (cont !== undefined && cont > daily) return { ok: false, problems: [{ field: "personalMaxContinuousMinutes" as PolicyProblem["field"], message: "Limite personnelle — la durée sans vraie pause ne peut pas dépasser la durée par journée." }] }
  return { ok: true, limits }
}

/** The stricter value of each field of two sets of limits (a member merge keeps the stricter). */
export function stricterLimits(a: PersonalLimits | null, b: PersonalLimits | null): PersonalLimits | null {
  if (!a) return b
  if (!b) return a
  const out: PersonalLimits = { ...a }
  for (const f of PERSONAL_FIELDS) {
    const x = a[f], y = b[f]
    if (y === undefined) continue
    out[f] = x === undefined ? y : stricterOf(f, x, y)
  }
  return out
}

/** The limits in words, for the organiser's list and the personal page: « 6 h par journée de service, … ». */
export function personalLimitsLines(limits: PersonalLimits): string[] {
  return PERSONAL_FIELDS.filter((f) => limits[f] !== undefined).map((f) => `${STRICTER_LABELS[f]} : ${fmtDuration(limits[f]!)}${isMinimumField(f) ? " au moins" : " au plus"}`)
}
