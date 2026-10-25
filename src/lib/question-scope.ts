// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Who a sign-up question is asked to (#1140): every volunteer of the event (the default, and every
 * question created before), or only those whose live registrations include a shift of one of some
 * postes. Apart from `roleName` (#984, part 3), which only routes the emails of an answer change.
 *
 * Roles have no table: a poste is the roleName of the event's shifts, so the scope names them, kept
 * in step like the share links (renamed with the poste, dropped when it is deleted). A scope whose
 * postes are all gone is asked to nobody rather than widened to everyone.
 *
 * A follow-up (#1016) has no scope of its own: it is asked to the people its parent is asked to.
 *
 * An out-of-scope question is never required, an answer posted for it is ignored, and the answer
 * stored for it is kept (a volunteer who leaves the last shift of a poste keeps it, not required,
 * and finds it again if they take such a shift later). That differs from a follow-up hidden by its
 * parent's answer, whose stored answer is cleared.
 *
 * Pure and client-safe (no Prisma, no zod): the public form, the personal page, the editor, the
 * admin API and the summary read the same rules.
 */

export const SCOPE_EVENT = "event"
export const SCOPE_ROLES = "roles"
export const DISPLAY_SCOPES = [SCOPE_EVENT, SCOPE_ROLES] as const
export type DisplayScope = (typeof DISPLAY_SCOPES)[number]

export const SCOPE_LEGEND = "À qui poser cette question ?"
export const SCOPE_EVENT_LABEL = "Tous les bénévoles"
export const SCOPE_ROLES_LABEL = "Certains postes seulement"
export const SCOPE_ROLES_LEGEND = "Postes à qui la poser"
export const SCOPE_HINT = "La question n'apparaît qu'aux bénévoles qui choisissent au moins un créneau de ces postes. Une réponse déjà donnée reste enregistrée si le bénévole quitte ces créneaux."
export const SCOPE_NO_ROLES_HINT = "Ajoutez des créneaux à l'événement pour poser cette question à certains postes seulement."
export const SCOPE_NOBODY = "Plus aucun de ses postes n'a de créneau : cette question n'est actuellement posée à personne. Cochez un poste, ou posez-la à tous les bénévoles."
export const SCOPE_ROLES_EMPTY = "Cochez au moins un poste, ou posez la question à tous les bénévoles."
export const SCOPE_ROLE_UNKNOWN = "Un des postes cochés n'existe pas dans cet événement : choisissez-les dans la liste."
export const SCOPE_STALE_SUFFIX = " (plus aucun créneau)"

export type ScopeFields = { displayScope?: string | null; displayRoleNames?: string[] | null }
type Scoped = ScopeFields & { id: string; parentId?: string | null }

/** The postes a question is restricted to, or null when it is asked to the whole event. */
export function scopeRoles(q: ScopeFields): string[] | null {
  return q.displayScope === SCOPE_ROLES ? (q.displayRoleNames ?? []) : null
}

/**
 * The scope that applies to a question: its own, or its parent's for a follow-up (#1016). A
 * follow-up whose parent is not in `byId` keeps its own (it is never asked anyway).
 */
export function effectiveScope<T extends Scoped>(q: T, byId: Map<string, T>): string[] | null {
  const parent = q.parentId ? byId.get(q.parentId) : undefined
  return scopeRoles(parent ?? q)
}

/** Whether a question is asked to someone whose live registrations are on these postes. */
export function isAsked<T extends Scoped>(q: T, byId: Map<string, T>, roles: ReadonlySet<string>): boolean {
  const scope = effectiveScope(q, byId)
  return scope === null || scope.some((r) => roles.has(r))
}

/**
 * The questions asked for these postes, and the others (out of scope), each list in the order
 * given. `roles`: the role names of the volunteer's live registrations on the event (or, on the
 * sign-up form, of the shifts being chosen).
 */
export function splitByScope<T extends Scoped>(questions: T[], roles: Iterable<string>): { asked: T[]; outOfScope: T[] } {
  const set = new Set(roles)
  const byId = new Map(questions.map((q) => [q.id, q]))
  const asked: T[] = []
  const outOfScope: T[] = []
  for (const q of questions) (isAsked(q, byId, set) ? asked : outOfScope).push(q)
  return { asked, outOfScope }
}

/** The questions asked for these postes, in the order given. */
export function askedQuestions<T extends Scoped>(questions: T[], roles: Iterable<string>): T[] {
  return splitByScope(questions, roles).asked
}

/** The scope as stored: no names for the whole event; for postes, trimmed and each once. */
export function normalisedScope(input: { displayScope: DisplayScope; displayRoleNames?: string[] }): { displayScope: DisplayScope; displayRoleNames: string[] } {
  if (input.displayScope !== SCOPE_ROLES) return { displayScope: SCOPE_EVENT, displayRoleNames: [] }
  const out: string[] = []
  for (const n of input.displayRoleNames ?? []) {
    const v = n.trim()
    if (v && !out.includes(v)) out.push(v)
  }
  return { displayScope: SCOPE_ROLES, displayRoleNames: out }
}

/**
 * Why a scope can't be saved, or null. Each poste must be one of the event's live postes, or one
 * the question already had (a poste whose shifts are all cancelled stays until unticked). At least
 * one poste, except for a question already restricted to postes that no longer exist, saved again
 * unchanged: its other settings may still be edited, while the editor says it is asked to nobody.
 */
export function scopeProblem(
  input: { displayScope: DisplayScope; displayRoleNames: string[] },
  liveRoles: string[],
  existing?: ScopeFields,
): string | null {
  if (input.displayScope !== SCOPE_ROLES) return null
  const before = scopeRoles(existing ?? {})
  if (input.displayRoleNames.length === 0) return before !== null && before.length === 0 ? null : SCOPE_ROLES_EMPTY
  const known = new Set([...liveRoles, ...(before ?? [])])
  return input.displayRoleNames.every((r) => known.has(r)) ? null : SCOPE_ROLE_UNKNOWN
}

/** The scope in the list of questions: « Posée seulement pour : Bar, Cuisine », nothing for all. */
export function scopeText(q: ScopeFields): string | null {
  const roles = scopeRoles(q)
  if (roles === null) return null
  return roles.length === 0 ? "Posée à personne (plus aucun de ses postes)" : `Posée seulement pour : ${roles.join(", ")}`
}

/** A follow-up's scope in the editor: it follows its parent's. */
export function inheritedScopeText(parent: ScopeFields & { label: string }): string {
  const roles = scopeRoles(parent)
  const who = roles === null ? "à tous les bénévoles" : roles.length === 0 ? "à personne pour l'instant" : `aux bénévoles des postes ${roles.join(", ")}`
  return `Une question de suivi est posée aux mêmes bénévoles que « ${parent.label} » : ${who}.`
}

/**
 * The checkboxes of « Postes concernés »: the event's live postes in name order, then the ticked
 * ones that no shift carries any more, saying so, so the current value shows and can be unticked.
 */
export function scopeRoleChoices(liveRoles: string[], selected: string[]): { value: string; label: string }[] {
  const sorted = [...new Set(liveRoles)].sort((a, b) => a.localeCompare(b, "fr"))
  const out = sorted.map((r) => ({ value: r, label: r }))
  for (const r of selected) if (!sorted.includes(r)) out.push({ value: r, label: `${r}${SCOPE_STALE_SUFFIX}` })
  return out
}

/** A poste renamed: every scope that names it names the new one. */
export function renameRoleInScope(names: string[], from: string, to: string): string[] {
  return normalisedScope({ displayScope: SCOPE_ROLES, displayRoleNames: names.map((n) => (n === from ? to : n)) }).displayRoleNames
}

/** A poste deleted: it leaves the scopes; the other postes stay, and none left means nobody. */
export function removeRoleFromScope(names: string[], role: string): string[] {
  return names.filter((n) => n !== role)
}

/**
 * The scope a question starts from when it stops being a follow-up: the one it was asked with,
 * its former parent's, so detaching it never widens its audience silently.
 */
export function detachedScope(parent: ScopeFields | undefined): { displayScope: DisplayScope; displayRoleNames: string[] } {
  const roles = parent ? scopeRoles(parent) : null
  return roles === null ? { displayScope: SCOPE_EVENT, displayRoleNames: [] } : { displayScope: SCOPE_ROLES, displayRoleNames: [...roles] }
}

/**
 * The scope of a question in a duplicated event (#378): copied as it is, postes by name. A copy
 * without these shifts asks the question to nobody until shifts of these postes exist.
 */
export function duplicatedScope(q: ScopeFields & { parentId?: string | null }): { displayScope: DisplayScope; displayRoleNames: string[] } {
  if (q.parentId) return { displayScope: SCOPE_EVENT, displayRoleNames: [] }
  const roles = scopeRoles(q)
  return roles === null ? { displayScope: SCOPE_EVENT, displayRoleNames: [] } : { displayScope: SCOPE_ROLES, displayRoleNames: [...roles] }
}

/** The scope as the event log says it: « tous les bénévoles », « Bar, Cuisine », « aucun poste ». */
export function scopeLogText(q: ScopeFields): string {
  const roles = scopeRoles(q)
  return roles === null ? "tous les bénévoles" : roles.length === 0 ? "aucun poste" : roles.join(", ")
}
