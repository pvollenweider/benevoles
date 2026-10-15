// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Mes réponses » on the personal page (/my/[token], #984): the volunteer's own answers to the
 * event's questions (#483), in the order of the sign-up form, with what the edit form needs (part 2:
 * type, choices, required, the stored values). Questions removed from the
 * form (archived) are not asked any more and are left out; a question without an answer says so.
 * Pure and client-safe (no Prisma): the API builds the rows, the page renders them.
 */
import { answerText } from "./event-questions"

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
      id: true, label: true, position: true, archivedAt: true, type: true, options: true, required: true,
      answers: { where: { volunteerId }, select: { values: true } },
    },
  }
}

/** The rows of « Mes réponses », in form order, without the archived questions. */
export function myAnswerRows(questions: MyAnswerQuestion[]): MyAnswerRow[] {
  return questions
    .filter((q) => !q.archivedAt)
    .map((q, i) => ({ q, i }))
    .sort((a, b) => a.q.position - b.q.position || a.i - b.i)
    .map(({ q }) => {
      const values = q.answers[0]?.values ?? []
      const text = answerText(values).trim()
      return { id: q.id, label: q.label, answer: text || null, type: q.type ?? "text", options: q.options ?? [], required: !!q.required, values: text ? values : [] }
    })
}
