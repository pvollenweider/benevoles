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
  checkPolicyValues, EXISTING_WARNING_SUGGESTIONS, horizonDays, WRITE_SECTIONS, WORKLOAD_BENCHMARKS, WORKLOAD_LIMIT_FIELDS,
  MEAL_WINDOWS_MAX, PERSONAL_FIELDS, STRICTER_FIELDS, type EventHorizon, type MealRule, type MinorsRule, type PersonalField, type PersonalLimits, type StricterField, type TravelRule, type PolicyProblem, type WorkloadBenchmark, type WorkloadField, type WorkloadLimitsV1, type WorkloadPolicyValues,
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

/**
 * The meal answer as typed (#1171, lot 2): no choice yet, apply, or do not apply; what was typed is
 * kept under « do not apply » and sent only with « apply ». `days`: every day, or the dates ticked.
 */
export type MealInput = { apply: "" | "yes" | "no"; minutes: string; windows: MealWindowInput[]; days: "all" | "some"; dates: string[] }

/** One window as typed; `key` keeps its row stable when another one is removed (never sent). */
export type MealWindowInput = { key: string; start: string; end: string }

let windowKeys = 0
const windowRow = (start = "", end = ""): MealWindowInput => ({ key: `w${++windowKeys}`, start, end })

/** The travel answer as typed (#1171, lot 2); the margin is kept under « do not apply ». */
export type TravelInput = { apply: "" | "yes" | "no"; minutes: string }

/** The minors answer as typed (#1171, lot 2): four durations, kept under « do not apply ». */
export type MinorsInput = { apply: "" | "yes" | "no" } & Record<StricterField, DurationInput>

/** The whole form as typed. */
export type PolicyFormState = { serviceDayStart: string; offDay: OffDayInput; meal: MealInput; travel: TravelInput; minors: MinorsInput } & Record<LimitField, DurationInput>

const EMPTY_OFF_DAY: OffDayInput = { apply: "", minOffDays: "", windowDays: "" }
const emptyMeal = (): MealInput => ({ apply: "", minutes: "", windows: [windowRow()], days: "all", dates: [] })

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

export const MEAL_HELP = "Quand une mission touche une plage, la personne doit y avoir au moins la durée du repas sans mission. Une mission où le repas sur le pouce est possible ne retire pas ce temps, mais compte comme du travail. Une attente entre deux missions qui contient ce repas peut dépasser l'attente maximale de la durée du repas, une fois par plage."

export const TRAVEL_HELP = "Au moins cette marge entre deux missions à des lieux différents de l'événement. Deux missions en même temps à deux lieux différents (sur un poste cumulable, par exemple) sont toujours refusées ; avec 0, c'est la seule vérification. Le lieu se choisit sur chaque créneau ; le trajet d'une mission sans lieu n'est pas vérifié."

/** The line under the margin about shifts without a place (event card), or null at 0. */
export function shiftsWithoutPlaceText(count: number, activePlaces: number): string | null {
  if (activePlaces === 0) return "Cet événement n'a encore aucun lieu : créez-les dans « Lieux des missions », sur la page Créneaux."
  if (count === 0) return null
  return count === 1 ? "1 créneau n'a pas de lieu : son trajet n'est pas vérifié." : `${count} créneaux n'ont pas de lieu : leur trajet n'est pas vérifié.`
}

export const MINORS_HELP = "L'âge est celui du jour de chaque mission, d'après la date de naissance. Cet événement demandera la date de naissance à l'inscription et à l'ajout à la main. Chaque valeur est au moins aussi stricte que celle de l'événement."

/** The line under the minors' values about people without a birth date (event card), or null at 0. */
export function peopleWithoutBirthDateText(count: number): string | null {
  if (count === 0) return null
  return count === 1
    ? "1 personne inscrite n'a pas de date de naissance : elle est vérifiée comme majeure tant qu'elle n'est pas connue."
    : `${count} personnes inscrites n'ont pas de date de naissance : elles sont vérifiées comme majeures tant qu'elle n'est pas connue.`
}

export const SERVICE_DAY_START_HELP = "L'heure à laquelle une journée de service commence. Une mission de nuit avant cette heure compte dans la journée de la veille."

export function emptyPolicyForm(): PolicyFormState {
  return { serviceDayStart: "", offDay: { ...EMPTY_OFF_DAY }, meal: emptyMeal(), travel: { apply: "", minutes: "" }, minors: minorsInputFrom(undefined), ...Object.fromEntries(WORKLOAD_LIMIT_FIELDS.map((f) => [f.key, { ...EMPTY }])) } as PolicyFormState
}

function offDayInputFrom(values: WorkloadPolicyValues): OffDayInput {
  if (!values.offDay) return { ...EMPTY_OFF_DAY }
  if (!values.offDay.apply) return { apply: "no", minOffDays: "", windowDays: "" }
  return { apply: "yes", minOffDays: String(values.offDay.minOffDays), windowDays: String(values.offDay.windowDays) }
}

function mealInputFrom(rule: MealRule | undefined): MealInput {
  if (!rule) return emptyMeal()
  if (!rule.apply) return { ...emptyMeal(), apply: "no" }
  return { apply: "yes", minutes: String(rule.minutes), windows: rule.windows.map((w) => windowRow(w.start, w.end)), days: rule.days === "all" ? "all" : "some", dates: rule.days === "all" ? [] : [...rule.days] }
}

function minorsInputFrom(rule: MinorsRule | undefined): MinorsInput {
  const durations = Object.fromEntries(STRICTER_FIELDS.map((f) => [f, rule?.apply ? toInput(rule[f]) : { ...EMPTY }])) as Record<StricterField, DurationInput>
  return { apply: !rule ? "" : rule.apply ? "yes" : "no", ...durations }
}

function travelInputFrom(rule: TravelRule | undefined): TravelInput {
  if (!rule) return { apply: "", minutes: "" }
  return rule.apply ? { apply: "yes", minutes: String(rule.minutes) } : { apply: "no", minutes: "" }
}

const toInput = (minutes: number): DurationInput => ({ hours: String(Math.floor(minutes / 60)), minutes: String(minutes % 60) })

/** The form filled from stored values, or empty. */
export function policyFormFrom(values: WorkloadPolicyValues | null | undefined): PolicyFormState {
  if (!values) return emptyPolicyForm()
  return { serviceDayStart: values.serviceDayStart, offDay: offDayInputFrom(values), meal: mealInputFrom(values.meal), travel: travelInputFrom(values.travel), minors: minorsInputFrom(values.minors), ...Object.fromEntries(WORKLOAD_LIMIT_FIELDS.map((f) => [f.key, toInput(values[f.key])])) } as PolicyFormState
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
  if (b.meal) next.meal = mealInputFrom(b.meal)
  if (b.travel) next.travel = travelInputFrom(b.travel)
  if (b.minors) next.minors = minorsInputFrom(b.minors)
  return next
}

/** A meal window added (at most MEAL_WINDOWS_MAX), or removed. */
export function withMealWindow(meal: MealInput, change: { add: true } | { remove: number }): MealInput {
  if ("add" in change) return meal.windows.length >= MEAL_WINDOWS_MAX ? meal : { ...meal, windows: [...meal.windows, windowRow()] }
  return meal.windows.length <= 1 ? meal : { ...meal, windows: meal.windows.filter((_, i) => i !== change.remove) }
}

/** The event's days to tick for « Certains jours ». */
export function mealDayOptions(horizon: EventHorizon): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = []
  for (let i = 0; i < Math.min(horizonDays(horizon), 62); i++) {
    const date = new Date(Date.parse(`${horizon.firstDay}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10)
    out.push({ date, label: lowerFirstLabel(fmtDay(date)) })
  }
  return out
}

/** The fields a benchmark fills (their error is cleared once filled). */
export function benchmarkFields(b: WorkloadBenchmark): string[] {
  return [...Object.keys(b.limits ?? {}), ...(b.offDay ? ["offDay", "offDayMinOffDays", "offDayWindowDays"] : []), ...(b.meal ? ["meal", "mealMinutes", "mealWindows", "mealDays"] : []), ...(b.travel ? ["travel", "travelMinutes"] : []), ...(b.minors ? ["minors", ...STRICTER_FIELDS.map((f) => `minors${f.charAt(0).toUpperCase()}${f.slice(1)}`)] : [])]
}

/** What the announcement says after a benchmark was used. */
export function benchmarkAnnouncement(b: WorkloadBenchmark): string {
  const parts = WORKLOAD_LIMIT_FIELDS.filter((f) => b.limits && f.key in b.limits).map((f) => `${lowerFirstLabel(f.label)} ${fmtDuration(b.limits![f.key]!)}`)
  if (b.offDay?.apply) parts.push(`jours sans mission : règle appliquée, ${b.offDay.minOffDays} jour sur ${b.offDay.windowDays} journées de service`)
  if (b.minors?.apply) parts.push(`moins de 18 ans : règle appliquée, ${fmtDuration(b.minors.maxDailyMinutes)} par journée, une pause de ${fmtDuration(b.minors.minBreakMinutes)} avant ${fmtDuration(b.minors.maxContinuousMinutes)} d'affilée, ${fmtDuration(b.minors.minRestMinutes)} de repos`)
  if (b.travel?.apply) parts.push(`trajet entre deux lieux : règle appliquée, ${fmtDuration(b.travel.minutes)} de marge`)
  if (b.meal?.apply) parts.push(`pause repas : règle appliquée, ${fmtDuration(b.meal.minutes)} entre ${b.meal.windows.map((w) => `${clock(w.start)} et ${clock(w.end)}`).join(", puis entre ")}, ${b.meal.days === "all" ? "tous les jours" : "certains jours"}`)
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
  const mi = form.minors
  if (mi.apply === "no") out.minors = { apply: false }
  else if (mi.apply === "yes") {
    out.minors = { apply: true, ...Object.fromEntries(STRICTER_FIELDS.map((f) => { const n = durationMinutes(mi[f]); return [f, n === undefined ? undefined : Number.isNaN(n) ? "invalide" : n] })) }
  }
  const t = form.travel
  if (t.apply === "no") out.travel = { apply: false }
  else if (t.apply === "yes") out.travel = { apply: true, minutes: wholeNumber(t.minutes) }
  const m = form.meal
  if (m.apply === "no") out.meal = { apply: false }
  else if (m.apply === "yes") {
    out.meal = {
      apply: true,
      minutes: wholeNumber(m.minutes),
      windows: m.windows.map((w) => ({ start: w.start.trim(), end: w.end.trim() })),
      days: m.days === "all" ? "all" : [...m.dates].sort(),
    }
  }
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
  const checked = checkPolicyValues(raw, WRITE_SECTIONS)
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
    !values.meal || !values.meal.apply
      ? "Aucune pause repas demandée."
      : `Au moins ${d(values.meal.minutes)} de repas sans mission dans chaque plage qu'une mission touche (${values.meal.windows.map((w) => `de ${clock(w.start)} à ${clock(w.end)}`).join(", ")}), ${values.meal.days === "all" ? "tous les jours" : `${values.meal.days.length} jour${values.meal.days.length > 1 ? "s" : ""} choisi${values.meal.days.length > 1 ? "s" : ""}`} ; une mission où le repas sur le pouce est possible ne retire pas ce temps.`,
    !values.travel || !values.travel.apply
      ? "Aucune marge de trajet demandée entre deux lieux."
      : values.travel.minutes === 0
        ? "Jamais deux missions en même temps à deux lieux différents, sans marge demandée entre elles ; le trajet d'une mission sans lieu n'est pas vérifié."
        : `Au moins ${d(values.travel.minutes)} entre deux missions à des lieux différents, et jamais deux lieux à la fois ; le trajet d'une mission sans lieu n'est pas vérifié.`,
    !values.minors || !values.minors.apply
      ? "Aucune limite particulière pour les moins de 18 ans."
      : `Moins de 18 ans : au plus ${d(values.minors.maxDailyMinutes)} par journée de service, une pause d'au moins ${d(values.minors.minBreakMinutes)} avant ${d(values.minors.maxContinuousMinutes)} de missions d'affilée, et ${d(values.minors.minRestMinutes)} de repos entre deux journées.`,
    "Une mission de « standby » compte comme du travail, jamais comme une pause.",
    "Toute inscription, tout ajout, tout échange ou changement d'horaire qui dépasserait ces limites est refusé, pour les bénévoles comme pour les organisateurs.",
  ]
}

/** What the protection does not cover yet, said next to the summary. */
/** What the protection does not cover, said next to the summary. */
export const WORKLOAD_NOT_COVERED = "Ne couvre que les missions de cet événement : celles d'autres événements ne sont pas connues ici."

// ── Personal limits (#1171, lot 2) ──────────────────────────────────────────

/** A person's own limits as typed: five optional durations, empty = same as the event. */
export type PersonalFormState = Record<PersonalField, DurationInput>

export function personalFormFrom(limits: PersonalLimits | null | undefined): PersonalFormState {
  return Object.fromEntries(PERSONAL_FIELDS.map((f) => [f, limits?.[f] !== undefined ? toInput(limits[f]!) : { ...EMPTY }])) as PersonalFormState
}

/** The values to send: typed durations only (unchecked; the server decides), "invalide" when not numbers. */
export function personalValuesFromForm(form: PersonalFormState): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of PERSONAL_FIELDS) {
    const n = durationMinutes(form[f])
    if (n !== undefined) out[f] = Number.isNaN(n) ? "invalide" : n
  }
  return out
}

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
