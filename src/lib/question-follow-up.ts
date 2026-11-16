// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The organiser's side of follow-up questions (#1016): which questions can be a parent, why a
 * condition can't be saved, what an edit of a parent may not break, how removing a parent carries
 * its follow-ups, and the order that keeps each follow-up right after its parent. The volunteer's
 * side (which question is asked, what is checked and cleared) is in event-questions.ts. Pure and
 * client-safe (no Prisma, no zod): the editor shows the same rules the admin API enforces.
 */
import { canBeParent, conditionText, formOrder, parentChoices } from "./event-questions"

export const FOLLOW_UP_LABEL = "Afficher seulement si…"
export const ALWAYS_LABEL = "Toujours (sans condition)"
export const FOLLOW_UP_VALUES_LEGEND = "Réponses qui affichent cette question"
export const FOLLOW_UP_HINT = "Choisissez une question Oui / non ou à choix : celle-ci n'apparaîtra, juste après elle, qu'aux bénévoles qui y donnent l'une des réponses cochées ; sinon elle reste cachée et n'est pas obligatoire."
export const NO_PARENT_HINT = "Pour poser cette question seulement après une réponse donnée, ajoutez d'abord une question Oui / non ou à choix."
export const FOLLOW_UP_LOCKED_HINT = "Cette question a déjà des réponses : elle ne peut plus dépendre d'une autre question. Vous pouvez seulement ajouter des réponses qui l'affichent, ou la poser sans condition."
export const HAS_FOLLOW_UPS_HINT = "Cette question a une question de suivi : elle ne peut pas dépendre elle-même d'une autre question."

export const PARENT_UNKNOWN = "Cette question n'existe pas dans cet événement : choisissez-en une dans la liste."
export const PARENT_SELF = "Une question ne peut pas dépendre d'elle-même."
export const PARENT_NESTED = "Une question de suivi ne peut pas avoir elle-même de question de suivi : choisissez une question sans condition."
export const PARENT_TYPE = "Seule une question Oui / non ou à choix peut afficher une question de suivi."
export const HAS_FOLLOW_UPS = "Cette question a une question de suivi : elle ne peut pas dépendre elle-même d'une autre question."
export const VALUES_EMPTY = "Cochez au moins une réponse qui affiche cette question."
export const VALUES_UNKNOWN = "Une des réponses cochées n'est pas un choix de cette question."
export const PARENT_LOCKED = "Cette question a déjà des réponses : elle ne peut plus dépendre d'une autre question. Vous pouvez la poser sans condition."
export const VALUES_LOCKED = "Cette question a déjà des réponses : vous pouvez ajouter des réponses qui l'affichent, pas en retirer."

type Candidate = { id: string; label: string; type: string; options: string[]; parentId?: string | null }

/**
 * The questions the editor offers as parent of `selfId` (null for a new question): the event's
 * active yes/no and choice questions that aren't follow-ups, never the question itself. Empty
 * when the question already has follow-ups (one level only).
 */
export function parentCandidates(questions: Candidate[], selfId: string | null): Candidate[] {
  if (selfId && questions.some((q) => q.parentId === selfId)) return []
  return questions.filter((q) => q.id !== selfId && canBeParent(q))
}

/**
 * The accepted values as stored: the parent's choices that were ticked, in the parent's order,
 * each once. Unknown values are dropped here; `followUpProblem` refuses them first.
 */
export function normalisedShowIf(parent: { type: string; options: string[] }, values: string[]): string[] {
  return parentChoices(parent).filter((c) => values.includes(c))
}

/**
 * Why a question's condition can't be saved, or null. `questions`: the event's active questions,
 * read for this event only (a parent of another event or organisation is « unknown »). `existing`:
 * the question as stored, for an edit. Once answered, a follow-up keeps its parent (it can still be
 * asked to everyone) and its accepted values can only grow: the answers given keep their meaning.
 */
export function followUpProblem(
  input: { selfId: string | null; parentId: string | null; showIfValues: string[] },
  questions: Candidate[],
  existing?: { parentId: string | null; showIfValues: string[]; answerCount: number },
): string | null {
  const { selfId, parentId, showIfValues } = input
  const answered = (existing?.answerCount ?? 0) > 0
  if (!parentId) return null
  if (answered && parentId !== existing?.parentId) return PARENT_LOCKED
  if (parentId === selfId) return PARENT_SELF
  const parent = questions.find((q) => q.id === parentId)
  if (!parent) return PARENT_UNKNOWN
  if (parent.parentId) return PARENT_NESTED
  if (!canBeParent(parent)) return PARENT_TYPE
  if (selfId && questions.some((q) => q.parentId === selfId)) return HAS_FOLLOW_UPS
  if (showIfValues.length === 0) return VALUES_EMPTY
  const choices = parentChoices(parent)
  if (showIfValues.some((v) => !choices.includes(v))) return VALUES_UNKNOWN
  if (answered && existing!.showIfValues.some((v) => !showIfValues.includes(v))) return VALUES_LOCKED
  return null
}

/**
 * Why an edit of a parent can't be saved because of its follow-ups (#1016), or null: it must stay
 * a yes/no or choice question, and keep every choice a follow-up's condition uses.
 */
export function parentEditProblem(after: { type: string; options: string[] }, followUps: { label: string; showIfValues: string[] }[]): string | null {
  if (followUps.length === 0) return null
  if (!canBeParent(after)) return `La question de suivi « ${followUps[0].label} » dépend de cette question : elle doit rester une question Oui / non ou à choix.`
  const choices = parentChoices(after)
  for (const f of followUps) {
    const missing = f.showIfValues.filter((v) => !choices.includes(v))
    if (missing.length > 0) return `La question de suivi « ${f.label} » s'affiche pour ${missing.map((v) => `« ${v} »`).join(", ")} : ${missing.length > 1 ? "ces choix ne peuvent" : "ce choix ne peut"} pas être retiré${missing.length > 1 ? "s" : ""}.`
  }
  return null
}

/**
 * The positions after a change of the list: the order given, each follow-up moved right after its
 * parent. Returns the ids in their new order.
 */
export function normalisedOrder(questions: { id: string; parentId?: string | null }[]): string[] {
  return formOrder(questions).map((q) => q.id)
}

/**
 * The editor's reorder (#1016): a question without a parent moves with its follow-ups, over the
 * whole previous or next block; a follow-up moves only among its parent's follow-ups. Null when the
 * move is not possible (first or last of its group).
 */
export function moveInGroups<T extends { id: string; parentId?: string | null }>(questions: T[], id: string, delta: -1 | 1): T[] | null {
  const ordered = formOrder(questions)
  const q = ordered.find((x) => x.id === id)
  if (!q) return null
  if (q.parentId) {
    const siblings = ordered.filter((x) => x.parentId === q.parentId)
    const i = siblings.indexOf(q)
    const j = i + delta
    if (j < 0 || j >= siblings.length) return null
    const next = [...siblings]
    ;[next[i], next[j]] = [next[j], next[i]]
    let k = 0
    return ordered.map((x) => (x.parentId === q.parentId ? next[k++] : x))
  }
  const blocks: T[][] = []
  for (const x of ordered) {
    if (x.parentId && blocks.length > 0 && blocks[blocks.length - 1][0].id === x.parentId) blocks[blocks.length - 1].push(x)
    else blocks.push([x])
  }
  const i = blocks.findIndex((b) => b[0].id === id)
  const j = i + delta
  if (j < 0 || j >= blocks.length) return null
  ;[blocks[i], blocks[j]] = [blocks[j], blocks[i]]
  return blocks.flat()
}

/** Whether a question can move up (-1) or down (1) in the editor. */
export function canMove(questions: { id: string; parentId?: string | null }[], id: string, delta: -1 | 1): boolean {
  return moveInGroups(questions, id, delta) !== null
}

/** The condition of a follow-up in the list of questions: « Si « Oui » à « Tu manges… ? » ». */
export function followUpText(q: { parentId?: string | null; showIfValues?: string[] }, questions: { id: string; label: string }[]): string | null {
  if (!q.parentId) return null
  const parent = questions.find((p) => p.id === q.parentId)
  return parent ? conditionText(q.showIfValues ?? [], parent.label) : null
}

/**
 * A follow-up's condition in a duplicated event (#378): the copy's id of the parent, from the map
 * of source id to copied id; none when the parent is not copied.
 */
export function duplicatedParent(parentId: string | null | undefined, copiedIds: Map<string, string>): string | null {
  return parentId ? (copiedIds.get(parentId) ?? null) : null
}

/**
 * The editor's field a follow-up refusal is about, to mark and focus it: the parent select, or
 * the accepted answers. Null for any other message.
 */
export function followUpErrorField(error: string): "parent" | "showif" | null {
  if ([VALUES_EMPTY, VALUES_UNKNOWN, VALUES_LOCKED].includes(error)) return "showif"
  if ([PARENT_UNKNOWN, PARENT_SELF, PARENT_NESTED, PARENT_TYPE, HAS_FOLLOW_UPS, PARENT_LOCKED].includes(error)) return "parent"
  return null
}

/**
 * The lines of the removal confirmation (#483), with what happens to the follow-ups (#1016): they
 * go too, their answers kept in the exports like the question's own.
 */
export function removalLines(q: { answers: number }, followUps: { label: string; answers: number }[]): string[] {
  const s = (n: number) => (n > 1 ? "s" : "")
  const lines = [q.answers > 0
    ? `Elle disparaît du formulaire. Ses ${q.answers} réponse${s(q.answers)} restent dans les inscriptions et les exports, jusqu'à la suppression de l'événement.`
    : "Elle disparaît du formulaire. Personne n'y a encore répondu."]
  for (const f of followUps) {
    lines.push(f.answers > 0
      ? `Sa question de suivi « ${f.label} » est retirée aussi ; ses ${f.answers} réponse${s(f.answers)} restent dans les exports.`
      : `Sa question de suivi « ${f.label} » est retirée aussi.`)
  }
  return lines
}

/** The status line after a move: the question, with its follow-ups when they moved with it. */
export function moveStatus(label: string, followUps: number, position: number, total: number): string {
  if (followUps === 0) return `« ${label} » est maintenant en position ${position} sur ${total}.`
  const what = followUps > 1 ? "ses questions de suivi sont" : "sa question de suivi sont"
  return `« ${label} » et ${what} maintenant en position ${position} sur ${total}.`
}
