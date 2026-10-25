// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Mes réponses » on the personal page (/my/[token], #984): the volunteer's own answers to the
 * event's questions (#483), in the order of the sign-up form, with what the edit form needs (part 2:
 * type, choices, required, the stored values). Questions removed from the
 * form (archived) are not asked any more and are left out; a question without an answer says so.
 * Pure and client-safe (no Prisma): the API builds the rows, the page renders them.
 */
import { NO, YES, answerText, formOrder } from "./event-questions"

export const MY_ANSWERS_TITLE = "Mes réponses"
export const NO_ANSWER_TEXT = "Pas de réponse"

export type MyAnswerQuestion = {
  id: string
  label: string
  position: number
  archivedAt?: Date | string | null
  type?: string
  options?: string[]
  required?: boolean
  /** Bounds of a number question (#1015). */
  minValue?: number | null
  maxValue?: number | null
  /** The poste the question is attached to (part 3): routes a change's email, never shown here. */
  roleName?: string | null
  /** Follow-up question (#1016): its parent and the parent's answers that show it. */
  parentId?: string | null
  showIfValues?: string[]
  /** Who is asked (#1140): the API keeps only the questions asked for the postes held. */
  displayScope?: string | null
  displayRoleNames?: string[] | null
  /** The answers to this question, as read for one volunteer: at most one. */
  answers: { values: string[] }[]
}

/**
 * One line of « Mes réponses »: the question, and the answer for people, null when not answered;
 * then the question as the edit form shows it, and the stored values it starts from.
 */
export type MyAnswerRow = {
  id: string
  label: string
  answer: string | null
  type: string
  options: string[]
  required: boolean
  /** Bounds of a number question (#1015), null or absent for the other types. */
  minValue?: number | null
  maxValue?: number | null
  /** Follow-up question (#1016): shown only when the parent's answer is one of showIfValues. */
  parentId?: string | null
  showIfValues?: string[]
  values: string[]
}

/**
 * What to read of an event's questions for one volunteer, as Prisma `findMany` arguments (plain
 * object, no Prisma import): the active questions in form order, each with this volunteer's answer
 * only. The volunteer comes from the personal link's registration, never from the request.
 */
export function myAnswersQuery(eventId: string, volunteerId: string) {
  return {
    where: { eventId, archivedAt: null },
    orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }],
    select: {
      id: true, label: true, position: true, archivedAt: true, type: true, options: true, required: true, minValue: true, maxValue: true, roleName: true, parentId: true, showIfValues: true, displayScope: true, displayRoleNames: true,
      answers: { where: { volunteerId }, select: { values: true } },
    },
  }
}

/**
 * The rows of « Mes réponses », in form order (each follow-up right after its parent, #1016),
 * without the archived questions.
 */
export function myAnswerRows(questions: MyAnswerQuestion[]): MyAnswerRow[] {
  const sorted = questions
    .filter((q) => !q.archivedAt)
    .map((q, i) => ({ q, i }))
    .sort((a, b) => a.q.position - b.q.position || a.i - b.i)
    .map(({ q }) => q)
  return formOrder(sorted).map((q) => {
    const values = q.answers[0]?.values ?? []
    const text = answerText(values).trim()
    return {
      id: q.id, label: q.label, answer: text || null, type: q.type ?? "text", options: q.options ?? [], required: !!q.required, minValue: q.minValue ?? null, maxValue: q.maxValue ?? null,
      parentId: q.parentId ?? null, showIfValues: q.showIfValues ?? [], values: text ? values : [],
    }
  })
}

/**
 * « Réponses conservées » (#1140): the answers kept for questions no longer asked to the volunteer
 * (asked to postes they no longer hold), read-only, in form order. Only those with an answer: a
 * question they were never asked says nothing to them.
 */
export const KEPT_ANSWERS_TITLE = "Réponses conservées pour tes anciens postes"
export const KEPT_ANSWERS_NOTE = "Ces questions ne concernent plus tes créneaux actuels. L'organisation garde tes réponses ; elles redeviennent modifiables si tu reprends un créneau de ces postes."

export type KeptAnswerRow = { id: string; label: string; answer: string }

export function keptAnswerRows(outOfScope: MyAnswerQuestion[]): KeptAnswerRow[] {
  return myAnswerRows(outOfScope).filter((r) => r.answer !== null).map((r) => ({ id: r.id, label: r.label, answer: r.answer! }))
}

/** The stored answers by question id, as `checkAnswers` keeps the questions not sent (#1016). */
export function storedAnswers(questions: { id: string; answers: { values: string[] }[] }[]): Map<string, string[]> {
  return new Map(questions.filter((q) => (q.answers[0]?.values.length ?? 0) > 0).map((q) => [q.id, q.answers[0].values]))
}

/**
 * The rows « Mes réponses » shows (#1016): a follow-up only when the stored answer of its parent
 * shows it. The edit form starts from every row and hides follow-ups as the answers change.
 */
export function shownRows<T extends { id: string; parentId?: string | null; showIfValues?: string[]; values: string[] }>(rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]))
  return rows.filter((r) => {
    if (!r.parentId) return true
    const parent = byId.get(r.parentId)
    return !!parent && parent.values.some((v) => (r.showIfValues ?? []).includes(v))
  })
}

/** Whether stored values are still choices of the question (an option renamed or removed is not). */
function stillValid(r: Pick<MyAnswerRow, "type" | "options" | "values">): boolean {
  if (r.type === "text") return true
  // A number (#1015) is shown as typed: the field takes any whole number, the server its bounds.
  if (r.type === "number") return r.values.every((v) => /^\d+$/.test(v))
  const choices = r.type === "yesno" ? [YES, NO] : r.options
  return r.values.every((v) => choices.includes(v))
}

/**
 * A form's starting values from the rows: the stored answers as the sign-up form's fields hold
 * them (a list for a multiple choice, one value otherwise, "" when not answered), one entry per
 * question. The personal page's editor (#984) and the sign-up for more shifts (#1013) start from
 * it: every question is sent back, so an answer removed in the form is a change too. An answer that
 * is no longer one of the question's choices is left out: no field would show it, so it is not
 * sent and stays as stored (a required question then asks for a choice again).
 */
export function startingAnswers(rows: Pick<MyAnswerRow, "id" | "type" | "options" | "values">[]): Record<string, string | string[]> {
  return Object.fromEntries(rows.filter(stillValid).map((r) => [r.id, r.type === "multiple" ? r.values : (r.values[0] ?? "")]))
}
