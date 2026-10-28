// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The organiser's form of the workload protection (#1171): durations typed as hours and minutes,
 * read back into the policy's minutes, and the plain-language summary shown before saving. Pure.
 * Empty stays empty: a missing value is « à compléter », never « sans limite » nor zero, except an
 * empty « heures » next to typed minutes (« 0 h 30 »).
 */
import { fmtDay, fmtDuration } from "./signup-recap"
import {
  checkPolicyValues, EXISTING_WARNING_SUGGESTIONS, horizonDays, WORKLOAD_BENCHMARKS, WORKLOAD_LIMIT_FIELDS,
  type EventHorizon, type PolicyProblem, type WorkloadBenchmark, type WorkloadField, type WorkloadLimitsV1, type WorkloadPolicyValues,
} from "./workload-policy"

type LimitField = keyof WorkloadLimitsV1

/** One duration as typed. */
export type DurationInput = { hours: string; minutes: string }

/**
 * The days-off answer as typed: no choice yet (a policy saved before lot 2, or a new one), apply,
 * or do not apply. The two numbers are kept when « do not apply » is picked, so that coming back
 * restores them; they are sent only with « apply ».
 */
export type OffDayInput = { apply: "" | "yes" | "no"; minOffDays: string; windowDays: string }

/** The whole form as typed. */
export type PolicyFormState = { serviceDayStart: string; offDay: OffDayInput } & Record<LimitField, DurationInput>

const EMPTY_OFF_DAY: OffDayInput = { apply: "", minOffDays: "", windowDays: "" }

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

export const OFF_DAY_HELP = "Une journée de service avec la moindre mission compte comme travaillée, une mission de standby ou de nuit comprise. Chaque période complète de journées d'affilée dans les dates de l'événement est vérifiée."

export const SERVICE_DAY_START_HELP = "L'heure à laquelle une journée de service commence. Une mission de nuit avant cette heure compte dans la journée de la veille."

export function emptyPolicyForm(): PolicyFormState {
  return { serviceDayStart: "", offDay: { ...EMPTY_OFF_DAY }, ...Object.fromEntries(WORKLOAD_LIMIT_FIELDS.map((f) => [f.key, { ...EMPTY }])) } as PolicyFormState
}

function offDayInputFrom(values: WorkloadPolicyValues): OffDayInput {
  if (!values.offDay) return { ...EMPTY_OFF_DAY }
  if (!values.offDay.apply) return { apply: "no", minOffDays: "", windowDays: "" }
  return { apply: "yes", minOffDays: String(values.offDay.minOffDays), windowDays: String(values.offDay.windowDays) }
}

const toInput = (minutes: number): DurationInput => ({ hours: String(Math.floor(minutes / 60)), minutes: String(minutes % 60) })

/** The form filled from stored values, or empty. */
export function policyFormFrom(values: WorkloadPolicyValues | null | undefined): PolicyFormState {
  if (!values) return emptyPolicyForm()
  return { serviceDayStart: values.serviceDayStart, offDay: offDayInputFrom(values), ...Object.fromEntries(WORKLOAD_LIMIT_FIELDS.map((f) => [f.key, toInput(values[f.key])])) } as PolicyFormState
}

/** The existing #465 warning settings filled in, the other fields left as they were. */
export function withWarningSuggestions(form: PolicyFormState): PolicyFormState {
  const next = { ...form }
  for (const [key, minutes] of Object.entries(EXISTING_WARNING_SUGGESTIONS) as [LimitField, number][]) next[key] = toInput(minutes)
  return next
}

/** A benchmark's values filled in, the other fields left as they were. */
export function withBenchmark(form: PolicyFormState, b: WorkloadBenchmark): PolicyFormState {
  const next = { ...form }
  for (const [key, minutes] of Object.entries(b.limits ?? {}) as [LimitField, number][]) next[key] = toInput(minutes)
  if (b.offDay) next.offDay = b.offDay.apply ? { apply: "yes", minOffDays: String(b.offDay.minOffDays), windowDays: String(b.offDay.windowDays) } : { ...form.offDay, apply: "no" }
  return next
}

/** The fields a benchmark fills (their error is cleared once filled). */
export function benchmarkFields(b: WorkloadBenchmark): string[] {
  return [...Object.keys(b.limits ?? {}), ...(b.offDay ? ["offDay", "offDayMinOffDays", "offDayWindowDays"] : [])]
}

/** What the announcement says after a benchmark was used. */
export function benchmarkAnnouncement(b: WorkloadBenchmark): string {
  const parts = WORKLOAD_LIMIT_FIELDS.filter((f) => b.limits && f.key in b.limits).map((f) => `${lowerFirstLabel(f.label)} ${fmtDuration(b.limits![f.key]!)}`)
  if (b.offDay?.apply) parts.push(`jours sans mission : règle appliquée, ${b.offDay.minOffDays} jour sur ${b.offDay.windowDays} journées de service`)
  return `Rempli : ${parts.join(", ")}. Les autres champs n'ont pas changé.`
}

const lowerFirstLabel = (s: string) => s.charAt(0).toLocaleLowerCase("fr-FR") + s.slice(1)

export { WORKLOAD_BENCHMARKS }

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
  const o = form.offDay
  if (o.apply === "no") out.offDay = { apply: false }
  else if (o.apply === "yes") out.offDay = { apply: true, minOffDays: wholeNumber(o.minOffDays), windowDays: wholeNumber(o.windowDays) }
  return out
}

/** A typed whole number: undefined while empty, "invalide" when not digits. */
function wholeNumber(v: string): number | string | undefined {
  const t = v.trim()
  if (t === "") return undefined
  return /^\d{1,3}$/.test(t) ? Number(t) : "invalide"
}

/** The form checked as the server will: complete values, or the problem of each field. */
export function checkPolicyForm(form: PolicyFormState): { ok: true; values: WorkloadPolicyValues } | { ok: false; problems: PolicyProblem[] } {
  const raw = policyValuesFromForm(form)
  const problems: PolicyProblem[] = []
  for (const f of WORKLOAD_LIMIT_FIELDS) {
    if (raw[f.key] === "invalide") problems.push({ field: f.key, message: `${f.label} : indiquez des heures et des minutes en chiffres (minutes de 0 à 59).` })
  }
  const checked = checkPolicyValues(raw, { requireOffDay: true })
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
    !values.offDay || !values.offDay.apply
      ? "Aucun jour sans mission demandé."
      : `Au moins ${values.offDay.minOffDays} jour${values.offDay.minOffDays > 1 ? "s" : ""} sans mission sur toute période de ${values.offDay.windowDays} journées de service d'affilée.`,
    "Une mission de « standby » compte comme du travail, jamais comme une pause.",
    "Toute inscription, tout ajout, tout échange ou changement d'horaire qui dépasserait ces limites est refusé, pour les bénévoles comme pour les organisateurs.",
  ]
}

/** What the protection does not cover yet, said next to the summary. */
export const WORKLOAD_NOT_COVERED = "Pas encore pris en compte : les repas, le temps de trajet entre deux lieux, des limites plus strictes pour une personne."

/**
 * The days-off rule against the event's dates, under the period field (not live): with fewer
 * service days than the period, no complete period fits and the rule would check nothing. Read from
 * the dates when the page was loaded.
 */
export function offDayExample(form: PolicyFormState, horizon: EventHorizon): string | null {
  if (form.offDay.apply !== "yes") return null
  const t = form.offDay.windowDays.trim()
  if (!/^\d{1,3}$/.test(t)) return null
  const p = Number(t)
  const days = horizonDays(horizon)
  const dates = days === 1 ? `le ${lowerFirstLabel(fmtDay(horizon.firstDay))}` : `du ${lowerFirstLabel(fmtDay(horizon.firstDay))} au ${lowerFirstLabel(fmtDay(horizon.lastDay))}`
  const count = `${days} journée${days > 1 ? "s" : ""} de service`
  if (p > days) {
    return `Selon les dates de l'événement au chargement de la page, il compte ${count} (${dates}) : une période de ${p} journées n'y tient jamais, la règle ne vérifierait rien. Choisissez ${days} journées ou moins pour demander des jours sans mission.`
  }
  return `Selon les dates de l'événement au chargement de la page, il compte ${count} (${dates}) : chaque période de ${p} journées d'affilée y est vérifiée.`
}
