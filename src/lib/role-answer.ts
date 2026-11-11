// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Poste reserved to volunteers who answered one choice question of the event (#962), e.g. « Navette »
 * only for « Permis de conduire : Oui ».
 *
 * A condition is a question of the event (yes/no, single or multiple choice, never free text or a
 * number) and the accepted answers among its choices. It belongs to the poste, like its reserved
 * tags (#470): stored on every shift of the role and read from all of them, so a shift created
 * without it never opens a way around it. The question must be asked to every volunteer (#1140)
 * and must not be a follow-up (#1016), otherwise the volunteer would not see it before choosing the
 * shift. Accepted answers are the stored option values, never a translated label: `QuestionAnswer`
 * stores exactly the strings of `EventQuestion.options` (or « Oui »/« Non »).
 *
 * Pure and client-safe (no Prisma): the public page, the admin API, the sign-up, the waitlist, the
 * swaps, the proposal search and the confirmation email read the same rules.
 */

export type AnswerConditionShift = {
  roleName: string
  reservedQuestionId?: string | null
  reservedAnswers?: string[] | null
}

export type ReservedAnswerCondition = {
  questionId: string
  answers: string[]
}

export type AnswerConditionQuestion = {
  id: string
  label: string
  type: string
  options: string[]
  parentId?: string | null
  displayScope?: string | null
  displayRoleNames?: string[] | null
}

/** The question types a condition can use: their answers are a closed list of choices. */
export const ANSWER_CONDITION_TYPES = ["yesno", "single", "multiple"] as const

/** Why a question can be a poste's condition: a choice question asked to every volunteer, not a follow-up. */
export function isAnswerConditionQuestion(q: AnswerConditionQuestion): boolean {
  return (ANSWER_CONDITION_TYPES as readonly string[]).includes(q.type)
    && !q.parentId
    && (q.displayScope ?? "event") === "event"
}

/** The event questions the « Accès » editor offers: choice questions asked to every volunteer. */
export function answerConditionQuestions<T extends AnswerConditionQuestion>(questions: T[]): T[] {
  return questions.filter(isAnswerConditionQuestion)
}

/** The choices of a condition's question, as the accepted answers are picked from. */
export function answerConditionChoices(q: AnswerConditionQuestion): string[] {
  return q.type === "yesno" ? ["Oui", "Non"] : q.options
}

/**
 * The conditions in force per role, from all its shifts: the question set on most of them, and
 * every answer accepted by one of those shifts (a race must not bypass a condition). Empty when no
 * shift of the role carries one.
 */
export function reservedAnswerConditions(shifts: AnswerConditionShift[]): Map<string, ReservedAnswerCondition> {
  const perRole = new Map<string, Map<string, { count: number; answers: Set<string> }>>()
  for (const s of shifts) {
    const questionId = s.reservedQuestionId?.trim()
    if (!questionId) continue
    const byQuestion = perRole.get(s.roleName) ?? new Map<string, { count: number; answers: Set<string> }>()
    const entry = byQuestion.get(questionId) ?? { count: 0, answers: new Set<string>() }
    entry.count++
    for (const a of s.reservedAnswers ?? []) if (a.trim()) entry.answers.add(a)
    byQuestion.set(questionId, entry)
    perRole.set(s.roleName, byQuestion)
  }
  const out = new Map<string, ReservedAnswerCondition>()
  for (const [roleName, byQuestion] of perRole) {
    let best: [string, { count: number; answers: Set<string> }] | null = null
    for (const candidate of byQuestion) {
      if (!best || candidate[1].count > best[1].count || (candidate[1].count === best[1].count && candidate[0] < best[0])) best = candidate
    }
    if (best) out.set(roleName, { questionId: best[0], answers: [...best[1].answers] })
  }
  return out
}

/** The condition of one role, or null when it is open to everyone. */
export function reservedAnswerConditionOf(shifts: AnswerConditionShift[], roleName: string): ReservedAnswerCondition | null {
  return reservedAnswerConditions(shifts.filter((s) => s.roleName === roleName)).get(roleName) ?? null
}

/**
 * Whether these stored answer values satisfy the condition: one of the accepted answers chosen
 * (a multiple choice question may have several). A missing or empty answer never satisfies it.
 */
export function answerValuesMatch(condition: ReservedAnswerCondition, values: Iterable<string> | undefined): boolean {
  if (condition.answers.length === 0) return true
  const mine = new Set(values ?? [])
  return condition.answers.some((a) => mine.has(a))
}

/** A shift whose role's condition one volunteer's answers do not satisfy. */
export type AnswerConditionProblem = {
  shiftId: string
  roleName: string
  condition: ReservedAnswerCondition
}

/**
 * The selected shifts this volunteer cannot take, in the order given. `answers` holds the stored
 * answers by question id (the volunteer's own answer wins, the form's for a new volunteer).
 */
export type AnswerConditionCarrier = AnswerConditionShift & {
  id: string
  /** The readable condition the public page sends with the shift (#962). */
  reservedAnswer?: { questionId: string; questionLabel: string; answers: string[] } | null
}

export function answerConditionProblems<S extends AnswerConditionCarrier>(
  shifts: S[],
  conditions: Map<string, ReservedAnswerCondition>,
  answers: Map<string, string[]>,
): (AnswerConditionProblem & { shift: S; questionLabel: string })[] {
  const out: (AnswerConditionProblem & { shift: S; questionLabel: string })[] = []
  for (const shift of shifts) {
    const condition = conditions.get(shift.roleName)
    if (!condition) continue
    if (!answerValuesMatch(condition, answers.get(condition.questionId))) out.push({ shiftId: shift.id, roleName: shift.roleName, condition, shift, questionLabel: shift.reservedAnswer?.questionLabel ?? "" })
  }
  return out
}

/** Raw values as a form holds them (one choice, a list, Yes/No as booleans). */
export function rawAnswerValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string" && v !== "")
  if (value === true) return ["Oui"]
  if (value === false) return ["Non"]
  return typeof value === "string" && value !== "" ? [value] : []
}

/** « Réponse requise : Permis de conduire, Oui »: the mention under a reserved shift. */
export function answerConditionMention(questionLabel: string, answers: string[]): string {
  return `Réponse requise : ${questionLabel}, ${answers.join(" ou ")}`
}

/** « Ce poste est réservé aux personnes qui répondent Oui à « Permis de conduire ». » */
export function answerConditionRefusal(questionLabel: string, answers: string[]): string {
  return `Ce poste est réservé aux personnes qui répondent ${answers.join(" ou ")} à « ${questionLabel} ».`
}

/** What the admin API refuses when a poste's condition is not a choice question asked to everyone. */
export function answerConditionSettingProblem(
  input: { questionId: string | null; answers: string[] },
  questions: AnswerConditionQuestion[],
): string | null {
  if (!input.questionId) return input.answers.length > 0 ? "Choisissez une question pour ces réponses." : null
  const question = questions.find((q) => q.id === input.questionId)
  if (!question) return "Cette question n'existe pas dans cet événement."
  if (!(ANSWER_CONDITION_TYPES as readonly string[]).includes(question.type)) {
    return "La question choisie doit être à choix (oui/non, choix unique ou choix multiple)."
  }
  if (!isAnswerConditionQuestion(question)) {
    return "La question choisie doit être posée à tous les bénévoles, pas à certains postes ni en question de suivi."
  }
  if (input.answers.length === 0) return "Choisissez au moins une réponse acceptée."
  const choices = answerConditionChoices(question)
  const unknown = input.answers.find((a) => !choices.includes(a))
  if (unknown !== undefined) return `La réponse « ${unknown} » ne fait pas partie des choix de la question.`
  return null
}

/** A poste whose access depends on the question, as the question editor reads it. */
export type AnswerConditionDependent = { roleName: string; reservedAnswers: string[] }

/** The postes depending on one question, once per role, with every answer they accept. */
export function answerConditionDependents(shifts: AnswerConditionShift[], questionId: string): AnswerConditionDependent[] {
  const byRole = new Map<string, Set<string>>()
  for (const s of shifts) {
    if (s.reservedQuestionId !== questionId) continue
    const answers = byRole.get(s.roleName) ?? new Set<string>()
    for (const a of s.reservedAnswers ?? []) if (a.trim()) answers.add(a)
    byRole.set(s.roleName, answers)
  }
  return [...byRole].map(([roleName, answers]) => ({ roleName, reservedAnswers: [...answers] }))
}

const names = (dependents: AnswerConditionDependent[]) => dependents.map((d) => `« ${d.roleName} »`).join(", ")

/**
 * Why a question can't be edited or removed while postes depend on it, or null when the edit is
 * safe. The simplest safe rule: keep it a choice question asked to every volunteer, and keep every
 * answer a poste accepts among its choices; its label may still change (the mention follows).
 */
export function questionAnswerConditionProblem(
  after: AnswerConditionQuestion,
  dependents: AnswerConditionDependent[],
): string | null {
  if (dependents.length === 0) return null
  if (!(ANSWER_CONDITION_TYPES as readonly string[]).includes(after.type)) {
    return `Le poste ${names(dependents)} dépend de cette question : elle doit rester une question à choix.`
  }
  if (after.parentId) {
    return `Le poste ${names(dependents)} dépend de cette question : elle ne peut pas devenir une question de suivi.`
  }
  if ((after.displayScope ?? "event") !== "event") {
    return `Le poste ${names(dependents)} dépend de cette question : elle doit rester posée à tous les bénévoles.`
  }
  const choices = answerConditionChoices(after)
  for (const dependent of dependents) {
    const removed = dependent.reservedAnswers.find((a) => !choices.includes(a))
    if (removed !== undefined) {
      return `Le poste « ${dependent.roleName} » dépend de la réponse « ${removed} » : elle ne peut pas être retirée des choix.`
    }
  }
  return null
}

/** Why a question can't be deleted while postes depend on it, or null when it can. */
export function questionAnswerConditionDeletionProblem(dependents: AnswerConditionDependent[]): string | null {
  if (dependents.length === 0) return null
  return `Le poste ${names(dependents)} dépend de cette question : retirez d'abord sa condition d'accès.`
}
