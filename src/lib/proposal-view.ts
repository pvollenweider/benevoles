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
  seed: string
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

export type FormProblem = { field: string; message: string }

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
    const lead = (text: string) => (who ? `${who} : ${text.charAt(0).toLocaleLowerCase("fr-FR")}${text.slice(1)}` : text)
    if (minutes === null) problems.push({ field: `target-${p.volunteerId}`, message: lead("Indiquez un objectif en heures (0 pour aucun objectif), par exemple 12 ou 7,5.") })
    else targets.push({ volunteerId: p.volunteerId, targetMinutes: minutes })
    if (p.prefer && p.prefer === p.avoid) problems.push({ field: `avoid-${p.volunteerId}`, message: lead("Un poste ne peut pas être à la fois souhaité et à éviter.") })
  }
  const maxConsecutiveDays = wholeOrNull(form.maxConsecutiveDays)
  if (maxConsecutiveDays !== null && !(maxConsecutiveDays >= 1 && maxConsecutiveDays <= 31)) problems.push({ field: "proposal-consecutive", message: "Indiquez un nombre de jours entre 1 et 31, ou laissez vide." })
  const maxNightAddOns = wholeOrNull(form.maxNightAddOns)
  if (maxNightAddOns !== null && !(maxNightAddOns >= 0 && maxNightAddOns <= 100)) problems.push({ field: "proposal-nights", message: "Indiquez un nombre entre 0 et 100, ou laissez vide." })
  const seed = wholeOrNull(form.seed)
  if (seed === null || Number.isNaN(seed) || seed > 4_294_967_295) problems.push({ field: "proposal-seed", message: "Indiquez une graine : un nombre entier positif." })
  form.posteChoices.forEach((c, i) => {
    const cap = Math.max(0, ...shifts.filter((s) => s.roleName === c.roleName).map((s) => s.capacity))
    const bad = (c.reserveText !== undefined && !/^\d+$/.test(c.reserveText.trim())) || !Number.isInteger(c.reserve) || c.reserve < 0 || c.reserve > cap
    if (bad) problems.push({ field: `reserve-${i}`, message: `${c.roleName} : indiquez une réserve entre 0 et ${cap}.` })
    if (c.category.trim().length > 80) problems.push({ field: `category-${i}`, message: `${c.roleName} : un nom de catégorie tient en 80 caractères.` })
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
    preferences, seed: seed!,
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

/** A new seed for a first run: any number, shown and editable; the same seed gives the same proposal. */
export function freshSeed(random: () => number = Math.random): number {
  return Math.floor(random() * 1_000_000)
}

/** The state of a run in words, for its heading and the announcement. */
export function runStateLabel(run: { status: string; outcome: string | null }): string {
  if (run.status === "queued") return "En attente"
  if (run.status === "running") return "Calcul en cours"
  if (run.status === "failed") return "Échec du calcul"
  if (run.status === "interrupted") return "Recherche interrompue"
  return run.outcome === "complete" ? "Complet" : run.outcome === "proven_impossible" ? "Impossible démontré" : "Incomplet"
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
  return `${dropped.length} ${dropped.length > 1 ? "affectations écartées" : "affectation écartée"} à l'écriture, les données ayant changé pendant le calcul : ${parts.join(", ")}.`
}
