// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * « Mes réponses » on the personal page (/my/[token], #984): the volunteer's own answers to the
 * event's questions (#483), read-only, in the order of the sign-up form. Questions removed from the
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
  /** The answers to this question, as read for one volunteer: at most one. */
  answers: { values: string[] }[]
}

/** One line of « Mes réponses »: the question, and the answer for people, null when not answered. */
export type MyAnswerRow = { id: string; label: string; answer: string | null }

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
      id: true, label: true, position: true, archivedAt: true,
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
      const text = answerText(q.answers[0]?.values).trim()
      return { id: q.id, label: q.label, answer: text || null }
    })
}
