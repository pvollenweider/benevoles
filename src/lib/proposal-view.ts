// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { ProposalConfig } from "./proposal-config"

/**
 * The page « Proposition d'affectations » (#1172): what the organiser fills in, turned into a run's
 * configuration, and back (prefill from the latest run). Pure, Prisma-free: the client component
 * and its tests use it.
 *
 * - Scope: the shifts of the chosen dates and postes, still open (the server sends only those).
 * - Rotation categories are typed per poste: postes with the same name (case and spaces aside) share
 *   a category; an empty name leaves the poste on its own. A category covers every shift of its
 *   postes on the event, inside the scope or not (a person's other missions count for rotation too).
 * - Night add-ons are ticked per poste and cover all its shifts; the reserve is a number per poste,
 *   applied to each of its shifts in the scope, never above the shift's capacity.
 */

export type PageShift = { id: string; roleName: string; date: string; capacity: number; open: boolean }

/** `reserveText`: what the field holds when it is not (yet) a number; checked by `formToConfig`. */
export type PosteChoice = { roleName: string; category: string; night: boolean; reserve: number; reserveText?: string }

export type PersonChoice = { volunteerId: string; included: boolean; targetHours: string; prefer: string; avoid: string }

export type ProposalForm = {
  dates: string[]
  postes: string[]
  people: PersonChoice[]
  posteChoices: PosteChoice[]
  maxConsecutiveDays: string
  maxNightAddOns: string
}

/** The open shifts of the chosen dates and postes, by id. */
export function scopeShiftIds(shifts: readonly PageShift[], dates: readonly string[], postes: readonly string[]): string[] {
  const d = new Set(dates), p = new Set(postes)
  return shifts.filter((s) => s.open && d.has(s.date) && p.has(s.roleName)).map((s) => s.id).sort()
}

/** « 7,5 » or « 7.5 » hours as minutes; null when it is not a number of hours between 0 and 720. */
export function parseHours(text: string): number | null {
  const t = text.trim().replace(",", ".")
  if (!/^\d+(\.\d+)?$/.test(t)) return null
  const minutes = Math.round(Number(t) * 60)
  return minutes >= 0 && minutes <= 720 * 60 ? minutes : null
}

/** Minutes as hours in French: 450 → « 7,5 », 360 → « 6 ». */
export function formatHours(minutes: number): string {
  const h = Math.round((minutes / 60) * 100) / 100
  return String(h).replace(".", ",")
}

const normalise = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("fr-FR")

/** A whole number from a field, or null when empty; NaN when not a whole number. */
const wholeOrNull = (text: string): number | null => {
  const t = text.trim()
  if (t === "") return null
  return /^\d+$/.test(t) ? Number(t) : Number.NaN
}

/**
 * A problem to fix, with its field id. `kind: "target_missing"`: an included person without any
 * hour target; several of them are listed as one item of the error summary (`summaryProblems`).
 */
export type FormProblem = { field: string; message: string; kind?: "target_missing" }

/** What the form says, as a configuration, or the problems to fix (each with its field id). */
export function formToConfig(form: ProposalForm, shifts: readonly PageShift[], nameOf: (volunteerId: string) => string = () => ""): { ok: true; config: ProposalConfig; targets: { volunteerId: string; targetMinutes: number }[] } | { ok: false; problems: FormProblem[] } {
  const problems: FormProblem[] = []
  const shiftIds = scopeShiftIds(shifts, form.dates, form.postes)
  if (form.dates.length === 0) problems.push({ field: "proposal-dates", message: "Choisissez au moins une date." })
  if (form.postes.length === 0) problems.push({ field: "proposal-postes", message: "Choisissez au moins un poste." })
  if (form.dates.length > 0 && form.postes.length > 0 && shiftIds.length === 0) problems.push({ field: "proposal-postes", message: "Aucun créneau à pourvoir pour ces dates et ces postes." })
  const people = form.people.filter((p) => p.included)
  if (people.length === 0) problems.push({ field: "proposal-people", message: "Choisissez au moins une personne." })
  const targets: { volunteerId: string; targetMinutes: number }[] = []
  for (const p of people) {
    const minutes = parseHours(p.targetHours)
    // The person's name leads the message: a list of these must tell its links apart (WCAG 2.4.4).
    const who = nameOf(p.volunteerId)
    const lead = (text: string) => (who ? `${who} : ${text.charAt(0).toLocaleLowerCase("fr-FR")}${text.slice(1)}` : text)
    if (p.targetHours.trim() === "") problems.push({ field: `target-${p.volunteerId}`, message: lead("Indiquez un objectif en heures (0 pour aucun objectif), par exemple 12 ou 7,5."), kind: "target_missing" })
    else if (minutes === null) problems.push({ field: `target-${p.volunteerId}`, message: lead("Indiquez un objectif en heures (0 pour aucun objectif), par exemple 12 ou 7,5.") })
    else targets.push({ volunteerId: p.volunteerId, targetMinutes: minutes })
    if (p.prefer && p.prefer === p.avoid) problems.push({ field: `avoid-${p.volunteerId}`, message: lead("Un poste ne peut pas être à la fois souhaité et à éviter.") })
  }
  const maxConsecutiveDays = wholeOrNull(form.maxConsecutiveDays)
  if (maxConsecutiveDays !== null && !(maxConsecutiveDays >= 1 && maxConsecutiveDays <= 31)) problems.push({ field: "proposal-consecutive", message: "Indiquez un nombre de jours entre 1 et 31, ou laissez vide." })
  const maxNightAddOns = wholeOrNull(form.maxNightAddOns)
  if (maxNightAddOns !== null && !(maxNightAddOns >= 0 && maxNightAddOns <= 100)) problems.push({ field: "proposal-nights", message: "Indiquez un nombre entre 0 et 100, ou laissez vide." })
  form.posteChoices.forEach((c, i) => {
    const cap = Math.max(0, ...shifts.filter((s) => s.roleName === c.roleName).map((s) => s.capacity))
    const bad = (c.reserveText !== undefined && !/^\d+$/.test(c.reserveText.trim())) || !Number.isInteger(c.reserve) || c.reserve < 0 || c.reserve > cap
    if (bad) problems.push({ field: `reserve-${i}`, message: `${c.roleName} : indiquez une réserve entre 0 et ${cap}.` })
    if (c.category.trim().length > 80) problems.push({ field: `category-${i}`, message: `${c.roleName} : un nom de catégorie tient en 80 caractères.` })
  })
  if (problems.length > 0) return { ok: false, problems }

  const inScope = new Set(shiftIds)
  const byPoste = new Map<string, PageShift[]>()
  for (const s of shifts) byPoste.set(s.roleName, [...(byPoste.get(s.roleName) ?? []), s])
  // Categories: postes sharing a name, keys in the order names first appear (sorted postes).
  const groups = new Map<string, { name: string; roles: string[] }>()
  for (const c of [...form.posteChoices].sort((a, b) => a.roleName.localeCompare(b.roleName, "fr"))) {
    const name = c.category.trim().replace(/\s+/g, " ")
    if (!name) continue
    const g = groups.get(normalise(name)) ?? { name, roles: [] }
    g.roles.push(c.roleName)
    groups.set(normalise(name), g)
  }
  const categories = [...groups.values()].map((g, i) => ({ key: `c${i + 1}`, name: g.name, shiftIds: g.roles.flatMap((r) => (byPoste.get(r) ?? []).map((s) => s.id)).sort() })).filter((k) => k.shiftIds.length > 0)
  const nightShiftIds = form.posteChoices.filter((c) => c.night).flatMap((c) => (byPoste.get(c.roleName) ?? []).map((s) => s.id)).sort()
  const reserve = form.posteChoices.filter((c) => c.reserve > 0).flatMap((c) => (byPoste.get(c.roleName) ?? []).filter((s) => inScope.has(s.id)).map((s) => ({ shiftId: s.id, count: Math.min(c.reserve, s.capacity) })))
    .filter((r) => r.count > 0).sort((a, b) => (a.shiftId < b.shiftId ? -1 : 1))
  const preferences = people.filter((p) => p.prefer || p.avoid).map((p) => ({ volunteerId: p.volunteerId, prefer: p.prefer ? [p.prefer] : [], avoid: p.avoid ? [p.avoid] : [] }))
  const config: ProposalConfig = {
    scope: { shiftIds, volunteerIds: people.map((p) => p.volunteerId).sort() },
    reserve, nightShiftIds, categories,
    rotation: { maxConsecutiveDays, maxNightAddOns },
    // No seed: the server gives a first proposal its fixed one (src/lib/proposal-config.ts).
    preferences,
  }
  return { ok: true, config, targets }
}

/** The poste choices a previous configuration implies (prefill), for the postes of the event now. */
export function posteChoicesFrom(config: Partial<ProposalConfig> | null, shifts: readonly PageShift[], postes: readonly string[]): PosteChoice[] {
  const roleOf = new Map(shifts.map((s) => [s.id, s.roleName]))
  const categoryOf = new Map<string, string>()
  for (const k of config?.categories ?? []) for (const id of k.shiftIds) { const r = roleOf.get(id); if (r && !categoryOf.has(r)) categoryOf.set(r, k.name) }
  const night = new Set((config?.nightShiftIds ?? []).map((id) => roleOf.get(id)).filter(Boolean))
  const reserveOf = new Map<string, number>()
  for (const r of config?.reserve ?? []) { const role = roleOf.get(r.shiftId); if (role) reserveOf.set(role, Math.max(reserveOf.get(role) ?? 0, r.count)) }
  return postes.map((roleName) => ({ roleName, category: categoryOf.get(roleName) ?? "", night: night.has(roleName), reserve: reserveOf.get(roleName) ?? 0 }))
}

/**
 * The state of a run in plain words, for its badge, the history and the announcement. Never solver
 * terms: a run that proved full coverage impossible is a normal outcome, said as such.
 */
export function runStateLabel(run: { status: string; outcome: string | null; stopReason?: string | null }): string {
  if (run.status === "queued") return "En attente"
  if (run.status === "finished" && run.stopReason === "no_other") return "Aucune autre répartition"
  if (run.status === "running") return "Calcul en cours"
  if (run.status === "failed") return "Échec du calcul"
  if (run.status === "interrupted" && run.stopReason === "queue_expired") return "Calcul non démarré"
  if (run.status === "interrupted") return "Calcul arrêté avant la fin"
  return run.outcome === "complete" ? "Toutes les places couvertes" : run.outcome === "proven_impossible" ? "Couverture complète impossible" : "Couverture partielle"
}

/**
 * The tone of a run's badge (DESIGN.md §2 status pairs): red only for a real failure; amber when
 * something may still be done (partial coverage, a search stopped early); blue when all is covered;
 * neutral while waiting and when full coverage is impossible (nothing better exists to look for).
 */
export type RunTone = "neutral" | "complete" | "warning" | "error"
export function runTone(run: { status: string; outcome: string | null; stopReason?: string | null }): RunTone {
  if (run.status === "failed") return "error"
  if (run.status === "finished" && run.stopReason === "no_other") return "neutral"
  if (run.status === "interrupted") return "warning"
  if (run.status !== "finished") return "neutral"
  return run.outcome === "complete" ? "complete" : run.outcome === "proven_impossible" ? "neutral" : "warning"
}

/** « 29 places couvertes sur 31 » (« 1 place couverte sur 1 »). */
export function coverageLine(c: { filled: number; seats: number }): string {
  return `${c.filled} ${c.filled > 1 ? "places couvertes" : "place couverte"} sur ${c.seats}`
}

/**
 * The result's lines under the coverage, in plain words, never repeating it: the places of each
 * shift's minimum only when they are not all the places, and the reserve when one was asked.
 */
export function coverageDetails(c: { seats: number; filled: number; criticalSeats: number; criticalFilled: number; reserveSeats: number; reserveFilled: number }): string[] {
  const out: string[] = []
  if (c.criticalSeats > 0 && c.criticalSeats !== c.seats) out.push(`Places du minimum de chaque créneau : ${c.criticalFilled} ${c.criticalFilled > 1 ? "couvertes" : "couverte"} sur ${c.criticalSeats}`)
  if (c.reserveSeats > 0) out.push(`Réserve gardée sur place : ${c.reserveFilled} ${c.reserveFilled > 1 ? "personnes" : "personne"} sur ${c.reserveSeats}`)
  return out
}

/** The text of a run in « Propositions précédentes »: its ordinal, date, state, coverage, what was written. */
export function historyEntry(r: { ordinal: number; status: string; outcome: string | null; stopReason?: string | null; writtenAt: Date | string | null; writtenCount: number; coverage?: { filled: number; seats: number } | null }, date: string): string {
  const parts = [`Proposition ${r.ordinal}, ${date} : ${runStateLabel(r).toLowerCase()}`]
  if (r.coverage) parts.push(coverageLine(r.coverage))
  parts.push(r.writtenAt ? `${r.writtenCount} ${r.writtenCount > 1 ? "affectations écrites" : "affectation écrite"}` : "rien d'écrit")
  return parts.join(", ")
}

/** The line under a run's result: « Proposition 3, lancée le 31 octobre à 14:05. » */
export function runLine(ordinal: number, date: string): string {
  return `Proposition ${ordinal}, lancée le ${date}.`
}

/** What « Proposer une autre répartition » does, in one plain line (Codex 2026-10-31: no promise of quality). */
export const ANOTHER_HINT = "Même périmètre et mêmes réglages : rechercher une autre répartition, si elle existe."

/** Said on an alternative whose search found nothing different: nothing written (coordinator review 2026-10-31). */
export const NO_OTHER_SENTENCE = "Aucune autre répartition trouvée avec ces données et ces réglages. Vos brouillons n'ont pas changé."

/**
 * Said on a run whose attempt stopped renewing its lease (lease_expired): its process was lost,
 * stalled or too slow to finish. The cause is not known, so none is named.
 */
export const LEASE_EXPIRED_SENTENCE = "Le calcul s'est arrêté avant la fin ; rien n'a été écrit dans les brouillons. Relancez-le depuis « Nouvelle proposition »."

/** Said on a run that waited too long for a place and never started (queue_expired). */
export const QUEUE_EXPIRED_SENTENCE = "Le calcul n'a pas pu démarrer ; rien n'a été écrit dans les brouillons. Relancez-le depuis « Nouvelle proposition »."

/** Said when a run stopped without a result of its own (no report): why, and what to do. */
export function expiredSentence(stopReason: string | null | undefined): string | null {
  return stopReason === "lease_expired" ? LEASE_EXPIRED_SENTENCE : stopReason === "queue_expired" ? QUEUE_EXPIRED_SENTENCE : null
}

/** Said instead of the button when the search proved no other assignment covers as many seats. */
export const ONLY_ONE_SENTENCE = "Aucune autre répartition ne peut couvrir autant de places avec ces données et ces règles."

/** Said on a run whose search found again the result of an earlier run with the same choices and data. */
export function sameAsSentence(ordinal: number): string {
  return `Aucune autre répartition trouvée : cette recherche a retrouvé la même répartition que la proposition ${ordinal}.`
}

/**
 * Whether « Proposer une autre répartition » is offered for a run: finished with a report, and the
 * search did not prove that no other assignment covers as many seats (a stale proof does not count).
 */
export function anotherOffer(run: { status: string; stopReason?: string | null; stale: readonly unknown[]; report: { onlyOne?: boolean } | null }): "button" | "only_one" | null {
  // Nothing different found within the budget proves nothing: further seeds may still differ.
  if (run.status === "finished" && run.stopReason === "no_other") return "button"
  if (run.status !== "finished" || !run.report) return null
  return run.report.onlyOne && run.stale.length === 0 ? "only_one" : "button"
}

/** The confirmation before « another » replaces the drafts the shown run wrote (accessibility review 2026-10-31). */
export function anotherReplaceRecap(count: number, ordinal: number) {
  return {
    title: `Remplacer ${count} ${count > 1 ? "brouillons proposés" : "brouillon proposé"} ?`,
    lead: `Si une autre répartition est trouvée, elle remplace ${count > 1 ? `les ${count} brouillons proposés non verrouillés` : "le brouillon proposé non verrouillé"} de ce périmètre. Sinon, rien ne change.`,
    lines: [`La proposition ${ordinal} reste consultable dans Propositions précédentes.`, "Les brouillons verrouillés et manuels ne changent pas.", "Rien n'est publié et personne n'est prévenu."],
    confirmLabel: "Remplacer et proposer",
    danger: true,
  }
}

/**
 * The error summary's items: an included person without a target is one problem each (its field
 * shows its own error), but several are one item, « 11 personnes sans objectif d'heures », linked
 * to the first field. Malformed targets and every other problem keep their own item.
 */
export type SummaryItem = FormProblem & { missingTargets?: number }
export function summaryProblems(problems: readonly FormProblem[]): SummaryItem[] {
  const missing = problems.filter((p) => p.kind === "target_missing")
  if (missing.length < 2) return [...problems]
  const out: SummaryItem[] = []
  for (const p of problems) {
    if (p.kind !== "target_missing") out.push(p)
    else if (p === missing[0]) out.push({ field: p.field, message: `${missing.length} personnes sans objectif d'heures`, kind: "target_missing", missingTargets: missing.length })
  }
  return out
}

/** The short error under a target field (the summary names the person). */
export const TARGET_FIELD_ERROR = "Objectif à indiquer (0 pour aucun)."

/**
 * Fills the suggestion only where an included person has no target yet: a typed value is never
 * overwritten. Returns the new list and how many targets were filled.
 */
export function fillMissingTargets(people: readonly PersonChoice[], suggestionOf: (volunteerId: string) => number): { people: PersonChoice[]; filled: number } {
  let filled = 0
  const next = people.map((p) => {
    if (!p.included || p.targetHours.trim() !== "") return p
    filled++
    return { ...p, targetHours: formatHours(suggestionOf(p.volunteerId)) }
  })
  return { people: next, filled }
}

/** The problems left once a field has changed: its own problem goes, the others stay (never moved). */
export function withoutProblem(problems: readonly FormProblem[], field: string): FormProblem[] {
  return problems.some((p) => p.field === field) ? problems.filter((p) => p.field !== field) : [...problems]
}

/**
 * The one-line recap of « Rotation, nuit et réserve » when folded: what differs from nothing set,
 * or « Aucun réglage ».
 */
export function rotationSummary(choices: readonly PosteChoice[], maxConsecutiveDays: string, maxNightAddOns: string): string {
  const n = (count: number) => `${count} ${count > 1 ? "postes" : "poste"}`
  const parts: string[] = []
  const categories = choices.filter((c) => c.category.trim() !== "").length
  const nights = choices.filter((c) => c.night).length
  const reserves = choices.filter((c) => c.reserve > 0).length
  if (categories > 0) parts.push(`catégorie sur ${n(categories)}`)
  if (nights > 0) parts.push(`ajout de nuit sur ${n(nights)}`)
  if (reserves > 0) parts.push(`réserve sur ${n(reserves)}`)
  const days = maxConsecutiveDays.trim(), nightMax = maxNightAddOns.trim()
  if (days !== "") parts.push(`${days} ${Number(days) > 1 ? "jours" : "jour"} d'affilée au plus`)
  if (nightMax !== "") parts.push(`${nightMax} ${Number(nightMax) > 1 ? "ajouts" : "ajout"} de nuit par personne au plus`)
  if (parts.length === 0) return "Aucun réglage"
  const text = parts.join(", ")
  return text.charAt(0).toLocaleUpperCase("fr-FR") + text.slice(1)
}

/**
 * How many unlocked proposed drafts a new run would replace: those on a shift of its scope (the
 * server's replacement set, src/lib/proposal-runs-data.ts), counted from `proposedByShift`.
 */
export function replacedDraftCount(proposedByShift: Readonly<Record<string, number>>, scope: readonly string[]): number {
  return scope.reduce((n, id) => n + (proposedByShift[id] ?? 0), 0)
}

const DROP_WORDS: Record<string, string> = {
  gone: "créneau ou personne plus dans la proposition",
  already_on_shift: "déjà inscrite ou en brouillon sur ce créneau",
  availability: "disponibilités changées",
  capacity: "plus de place",
  workload: "pauses et limites de charge",
  overlap: "chevauchement",
  role_limit: "limite du poste",
  min_age: "âge minimum",
  reserved: "poste réservé",
  ended: "créneau terminé",
}

/** « 2 écartées à l'écriture : disponibilités changées (1), plus de place (1). » */
export function droppedSentence(dropped: readonly { reason: string }[]): string | null {
  if (dropped.length === 0) return null
  const counts = new Map<string, number>()
  for (const d of dropped) counts.set(d.reason, (counts.get(d.reason) ?? 0) + 1)
  const parts = [...counts].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${DROP_WORDS[r] ?? "règle non respectée"} (${n})`)
  return `${dropped.length} ${dropped.length > 1 ? "affectations écartées" : "affectation écartée"} à l'écriture, les données ayant changé pendant le calcul : ${parts.join(", ")}.`
}
