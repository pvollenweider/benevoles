// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A sign-up question attached to a poste (#984, part 3): a volunteer's later change of that answer
 * goes to the poste's sector leaders instead of the organisers (`answerChangeAudience`). The
 * question's audience is its display scope (question-scope.ts, #1140). Roles have no table: a poste is the roleName of the
 * event's live shifts. Pure and client-safe (no Prisma, no zod): the editor shows the choices, the
 * admin API checks them, the duplication carries them.
 */

export const QUESTION_ROLE_LABEL = "Poste concerné"
export const NO_QUESTION_ROLE_LABEL = "Aucun"
export const QUESTION_ROLE_HINT = "Quand un bénévole modifie sa réponse depuis sa page personnelle, l'email part aux responsables de ce poste au lieu de vous : ils voient son nom et sa réponse. Sans responsable pour ce poste, vous restez prévenu. Ce réglage ne change pas à qui la question est posée : c'est le rôle de « À qui poser cette question ? »."
export const NO_ROLES_HINT = "Ajoutez des créneaux à l'événement pour rattacher cette question à un poste."
export const QUESTION_ROLE_PROBLEM = "Ce poste n'existe pas dans cet événement : choisissez-en un dans la liste."

/** A poste of the event, as the editor lists it: its name and how many sector leaders it has. */
export type QuestionRoleChoice = { roleName: string; leaders: number }

/**
 * The options of « Poste concerné »: « Aucun », then the event's postes in name order, each saying
 * when it has no leader (the email then stays with the organisers). A poste the question is still
 * attached to but that no live shift carries any more stays listed, saying so, so the current
 * value shows and an unchanged save keeps it.
 */
export function questionRoleOptions(roles: QuestionRoleChoice[], current: string | null | undefined): { value: string; label: string }[] {
  const sorted = [...roles].sort((a, b) => a.roleName.localeCompare(b.roleName, "fr"))
  const out = [{ value: "", label: NO_QUESTION_ROLE_LABEL }]
  for (const r of sorted) out.push({ value: r.roleName, label: r.leaders > 0 ? r.roleName : `${r.roleName} (aucun responsable)` })
  if (current && !roles.some((r) => r.roleName === current)) out.push({ value: current, label: `${current} (plus aucun créneau)` })
  return out
}

/**
 * Why the poste of a question can't be saved: it must be one of the event's live postes, or the
 * one the question already has (kept unchanged). Null when fine, null or empty meaning none.
 */
export function questionRoleProblem(roleName: string | null | undefined, liveRoles: string[], current?: string | null): string | null {
  if (!roleName) return null
  if (roleName === current) return null
  return liveRoles.includes(roleName) ? null : QUESTION_ROLE_PROBLEM
}

/** The poste in the list of questions: « Poste : Cuisine », nothing without one. */
export function questionRoleText(roleName: string | null | undefined): string | null {
  return roleName ? `Poste : ${roleName}` : null
}

/**
 * The poste of a question in a duplicated event (#378): kept when the copy has shifts of that
 * poste, cleared otherwise (the copy has no such poste, or no shifts at all).
 */
export function duplicatedQuestionRole(roleName: string | null | undefined, copiedRoles: Set<string>): string | null {
  return roleName && copiedRoles.has(roleName) ? roleName : null
}

/**
 * The editor's field an API refusal is about, to mark and focus it: the poste, or a bound of a
 * number question (#1015), whose messages name « le minimum » or « le maximum ».
 */
export function questionErrorField(error: string): "role" | "min" | "max" | null {
  if (error === QUESTION_ROLE_PROBLEM) return "role"
  if (/\ble minimum\b/i.test(error)) return "min"
  if (/\ble maximum\b/i.test(error)) return "max"
  return null
}
