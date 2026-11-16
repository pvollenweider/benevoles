// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { shiftFit, shiftInterval } from "./availability-assist"
import { buildModel, type Model } from "./proposal-eligibility"
import { inputProblem, type ProposalInput } from "./proposal-input"

/**
 * The assignment proposal (#1172): what is checked before any computation, with the organiser's
 * words. Pure. In order: the input is sound; the workload protection is on and complete (P14: a
 * missing setting is never « no limit »); someone is selected; some seat is open; someone selected
 * declared availability covering a whole open shift (D01: no answer is never « available »);
 * someone passes the other rules. When only part of the team answered, the proposal may go ahead
 * with the answers given (D02), and says so.
 */

export type PreflightCode = "invalid_input" | "policy_missing" | "no_people" | "no_needs" | "no_availability" | "nobody_eligible"

export const PREFLIGHT_MESSAGES: Record<PreflightCode, string> = {
  invalid_input: "Les données de cette proposition ne sont pas valables : rechargez la page.",
  policy_missing: "Complétez et activez la protection des pauses et de la charge avant de générer une proposition. Aucun réglage manquant ne sera interprété comme une absence de limite.",
  no_people: "Choisissez au moins une personne pour la proposition.",
  no_needs: "Les besoins choisis sont déjà couverts. Aucune proposition à générer.",
  no_availability: "Aucune personne choisie n'a déclaré de disponibilité couvrant entièrement un créneau à pourvoir. Recueillez ou complétez les disponibilités avant de générer une proposition.",
  nobody_eligible: "Aucune personne choisie ne remplit les conditions des créneaux à pourvoir (âge, étiquette, missions déjà prévues, pauses et limites de charge).",
}

export type PreflightCounts = {
  /** People selected. */
  people: number
  /** Of them, people who answered (some dated availability). */
  answered: number
  /** Of them, people eligible for at least one open seat. */
  eligiblePeople: number
  openShifts: number
  seats: number
  criticalSeats: number
}

export type Preflight =
  | { ok: false; code: PreflightCode; message: string; counts?: PreflightCounts }
  | { ok: true; model: Model; counts: PreflightCounts; partial: boolean; notice: string | null }

/** « Les disponibilités sont renseignées pour 33 personnes sur 36… » (D02). */
export function partialNotice(answered: number, people: number): string {
  return `Les disponibilités sont renseignées pour ${answered} personne${answered > 1 ? "s" : ""} sur ${people}. Vous pouvez générer une proposition partielle ; les heures sans réponse ne seront jamais considérées comme disponibles.`
}

export function preflight(input: ProposalInput): Preflight {
  const fail = (code: PreflightCode, counts?: PreflightCounts): Preflight => ({ ok: false, code, message: PREFLIGHT_MESSAGES[code], ...(counts ? { counts } : {}) })
  if (inputProblem(input)) return fail("invalid_input")
  if (!input.policy) return fail("policy_missing")
  const selected = input.people.filter((p) => p.inScope)
  if (selected.length === 0) return fail("no_people")
  const model = buildModel(input)
  const answered = selected.filter((p) => p.answer && p.answer.days.length > 0).length
  const counts: PreflightCounts = {
    people: selected.length, answered, eligiblePeople: 0, openShifts: model.open.length,
    seats: [...model.free.values()].reduce((n, v) => n + v, 0), criticalSeats: [...model.critical.values()].reduce((n, v) => n + v, 0),
  }
  if (model.open.length === 0) return fail("no_needs", counts)
  const anyFull = model.open.some((s) => {
    const interval = shiftInterval({ id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime }, input.availability.timeZone)
    return selected.some((p) => p.answer && shiftFit(interval, p.answer, input.availability.dates, input.availability.timeZone).state === "full")
  })
  if (!anyFull) return fail("no_availability", counts)
  counts.eligiblePeople = [...model.options.values()].filter((o) => o.length > 0).length
  if (counts.eligiblePeople === 0) return fail("nobody_eligible", counts)
  const partial = answered < selected.length
  return { ok: true, model, counts, partial, notice: partial ? partialNotice(answered, selected.length) : null }
}
