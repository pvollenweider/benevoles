// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The organiser's form of the workload protection (#1171): durations typed as hours and minutes,
 * read back into the policy's minutes, and the plain-language summary shown before saving. Pure.
 * Empty stays empty: a missing value is « à compléter », never « sans limite » nor zero, except an
 * empty « heures » next to typed minutes (« 0 h 30 »).
 */
import { fmtDuration } from "./signup-recap"
import {
  checkPolicyValues, EXISTING_WARNING_SUGGESTIONS, WORKLOAD_LIMIT_FIELDS,
  type PolicyProblem, type WorkloadField, type WorkloadLimitsV1, type WorkloadPolicyValues,
} from "./workload-policy"

type LimitField = keyof WorkloadLimitsV1

/** One duration as typed. */
export type DurationInput = { hours: string; minutes: string }

/** The whole form as typed. */
export type PolicyFormState = { serviceDayStart: string } & Record<LimitField, DurationInput>

const EMPTY: DurationInput = { hours: "", minutes: "" }

/** A help sentence per limit, under its fieldset. */
export const WORKLOAD_FIELD_HELP: Record<LimitField, string> = {
  maxContinuousMinutes: "Missions qui s'enchaînent sans vraie pause, une mission de « standby » comprise.",
  minBreakMinutes: "Un écart plus court ne compte pas comme une pause : le travail continue.",
  maxDailyMinutes: "Toutes les missions d'une journée de service, tous postes confondus.",
  maxEventMinutes: "Toutes les missions de la personne sur l'événement.",
  minRestMinutes: "Entre la dernière mission d'une journée de service et la première de la suivante.",
  maxIdleGapMinutes: "Temps sans mission entre deux missions d'une même journée de service.",
}

export const SERVICE_DAY_START_HELP = "L'heure à laquelle une journée de service commence. Une mission de nuit avant cette heure compte dans la journée de la veille."

export function emptyPolicyForm(): PolicyFormState {
  return { serviceDayStart: "", ...Object.fromEntries(WORKLOAD_LIMIT_FIELDS.map((f) => [f.key, { ...EMPTY }])) } as PolicyFormState
}

const toInput = (minutes: number): DurationInput => ({ hours: String(Math.floor(minutes / 60)), minutes: String(minutes % 60) })

/** The form filled from stored values, or empty. */
export function policyFormFrom(values: WorkloadPolicyValues | null | undefined): PolicyFormState {
  if (!values) return emptyPolicyForm()
  return { serviceDayStart: values.serviceDayStart, ...Object.fromEntries(WORKLOAD_LIMIT_FIELDS.map((f) => [f.key, toInput(values[f.key])])) } as PolicyFormState
}

/** The existing #465 warning settings filled in, the other fields left as they were. */
export function withWarningSuggestions(form: PolicyFormState): PolicyFormState {
  const next = { ...form }
  for (const [key, minutes] of Object.entries(EXISTING_WARNING_SUGGESTIONS) as [LimitField, number][]) next[key] = toInput(minutes)
  return next
}

/** The labels of the suggested fields, for the announcement after filling them. */
export const SUGGESTED_LABELS = WORKLOAD_LIMIT_FIELDS.filter((f) => f.key in EXISTING_WARNING_SUGGESTIONS).map((f) => f.label)

/** Minutes of a typed duration: undefined while empty, NaN when not whole numbers. */
export function durationMinutes(d: DurationInput): number | undefined {
  const h = d.hours.trim(), m = d.minutes.trim()
  if (h === "" && m === "") return undefined
  if ((h !== "" && !/^\d{1,4}$/.test(h)) || (m !== "" && !/^\d{1,2}$/.test(m))) return Number.NaN
  const minutes = m === "" ? 0 : Number(m)
  if (minutes > 59) return Number.NaN
  return (h === "" ? 0 : Number(h)) * 60 + minutes
}

/** The values to send: what was typed, as the policy's minutes (unchecked; the server decides). */
export function policyValuesFromForm(form: PolicyFormState): Record<string, unknown> {
  const out: Record<string, unknown> = { serviceDayStart: form.serviceDayStart.trim() }
  for (const f of WORKLOAD_LIMIT_FIELDS) {
    const n = durationMinutes(form[f.key])
    out[f.key] = n === undefined ? undefined : Number.isNaN(n) ? "invalide" : n
  }
  return out
}

/** The form checked as the server will: complete values, or the problem of each field. */
export function checkPolicyForm(form: PolicyFormState): { ok: true; values: WorkloadPolicyValues } | { ok: false; problems: PolicyProblem[] } {
  const raw = policyValuesFromForm(form)
  const problems: PolicyProblem[] = []
  for (const f of WORKLOAD_LIMIT_FIELDS) {
    if (raw[f.key] === "invalide") problems.push({ field: f.key, message: `${f.label} : indiquez des heures et des minutes en chiffres (minutes de 0 à 59).` })
  }
  const checked = checkPolicyValues(raw)
  if (!checked.ok) problems.push(...checked.problems.filter((p) => !problems.some((q) => q.field === p.field)))
  return problems.length > 0 ? { ok: false, problems } : checked
}

/** The first problem of each field, by field. */
export function problemsByField(problems: PolicyProblem[]): Map<WorkloadField | "timeZone" | "version", string> {
  const out = new Map<WorkloadField | "timeZone" | "version", string>()
  for (const p of problems) if (!out.has(p.field)) out.set(p.field, p.message)
  return out
}

const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`
}

/** What will be enforced, in plain words, once every value is valid; empty otherwise. */
export function policySummaryLines(values: WorkloadPolicyValues): string[] {
  const d = fmtDuration
  return [
    `Une journée de service commence à ${clock(values.serviceDayStart)}.`,
    `Personne n'enchaîne plus de ${d(values.maxContinuousMinutes)} de missions sans une pause d'au moins ${d(values.minBreakMinutes)}.`,
    `Au plus ${d(values.maxDailyMinutes)} de missions par journée de service, et ${d(values.maxEventMinutes)} sur tout l'événement.`,
    values.minRestMinutes === 0
      ? "Aucun repos minimum entre deux journées de service."
      : `Au moins ${d(values.minRestMinutes)} de repos entre la dernière mission d'une journée de service et la première de la suivante.`,
    values.maxIdleGapMinutes === 0
      ? "Aucune attente entre deux missions d'une même journée de service : elles doivent se suivre."
      : `Au plus ${d(values.maxIdleGapMinutes)} d'attente entre deux missions d'une même journée de service.`,
    "Une mission de « standby » compte comme du travail, jamais comme une pause.",
    "Toute inscription, tout ajout, tout échange ou changement d'horaire qui dépasserait ces limites est refusé, pour les bénévoles comme pour les organisateurs.",
  ]
}

/** What the protection does not cover yet, said next to the summary. */
export const WORKLOAD_NOT_COVERED = "Pas encore pris en compte : les repas, le temps de trajet entre deux lieux, des limites plus strictes pour une personne, les jours de repos."
