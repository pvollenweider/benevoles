// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Custom questions of an event's sign-up form (#483): text, yes/no, single or multiple choice,
 * required or not, a few per event. The server validates the answers (the page only helps);
 * a question with answers is archived rather than deleted, and its type or used options can't
 * change under existing answers. Pure, and free of zod: the public sign-up page imports it (#773);
 * the question schema of the admin API is in event-questions-schema.ts.
 */
export const QUESTION_LIMIT = 5
export const QUESTION_TYPES = ["text", "yesno", "single", "multiple"] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]
export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  text: "Texte court",
  yesno: "Oui / non",
  single: "Choix unique",
  multiple: "Choix multiple",
}
export const TEXT_ANSWER_MAX = 200
export const YES = "Oui"
export const NO = "Non"

export type Question = { id: string; label: string; type: string; options: string[]; required: boolean }


/** Raw answers as posted: text, "Oui"/"Non", one option, or a list of options. */
export type RawAnswers = Record<string, unknown>

export type AnswerCheck = { ok: true; values: Map<string, string[]> } | { ok: false; errors: { questionId: string; message: string }[] }

/** The answers the server stores, or what is wrong with them. Unknown question ids are ignored. */
export function checkAnswers(questions: Question[], raw: RawAnswers | undefined): AnswerCheck {
  const values = new Map<string, string[]>()
  const errors: { questionId: string; message: string }[] = []
  for (const q of questions) {
    const v = raw?.[q.id]
    let vals: string[] = []
    if (q.type === "text") {
      const t = typeof v === "string" ? v.trim() : ""
      if (t.length > TEXT_ANSWER_MAX) { errors.push({ questionId: q.id, message: `« ${q.label} » : ${TEXT_ANSWER_MAX} caractères au plus.` }); continue }
      vals = t ? [t] : []
    } else if (q.type === "yesno") {
      if (v === YES || v === true) vals = [YES]
      else if (v === NO || v === false) vals = [NO]
      else if (v !== undefined && v !== null && v !== "") { errors.push({ questionId: q.id, message: `« ${q.label} » : réponds oui ou non.` }); continue }
    } else if (q.type === "single") {
      if (typeof v === "string" && v !== "") {
        if (!q.options.includes(v)) { errors.push({ questionId: q.id, message: `« ${q.label} » : choix inconnu.` }); continue }
        vals = [v]
      }
    } else if (q.type === "multiple") {
      const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []
      if (list.some((x) => !q.options.includes(x))) { errors.push({ questionId: q.id, message: `« ${q.label} » : choix inconnu.` }); continue }
      vals = q.options.filter((o) => list.includes(o))
    }
    if (q.required && vals.length === 0) { errors.push({ questionId: q.id, message: `« ${q.label} » est obligatoire.` }); continue }
    if (vals.length > 0) values.set(q.id, vals)
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, values }
}

/**
 * What a sign-up may write to a volunteer's answers (#483). The public form proves nothing about
 * who typed the email (#285): someone knowing a member's address must not be able to replace
 * their answers, as the profile itself is protected. So:
 * - with proof (the volunteer was created by this sign-up, or a valid invitation): the answers
 *   replace the previous ones, and an optional question left empty clears its old answer;
 * - without: only answers the volunteer doesn't have yet are added, nothing is replaced or cleared.
 */
export type AnswerWrites = { replace: [string, string[]][]; addMissing: [string, string[]][]; clear: string[] }

export function planAnswerWrites(questionIds: string[], values: Map<string, string[]>, ownershipProven: boolean): AnswerWrites {
  const answered = [...values.entries()]
  if (!ownershipProven) return { replace: [], addMissing: answered, clear: [] }
  return { replace: answered, addMissing: [], clear: questionIds.filter((id) => !values.has(id)) }
}

/** Each volunteer's answers, « label : answer », for the registrations list. */
export function answersByVolunteer(questions: { label: string; archivedAt: Date | null; answers: { volunteerId: string; values: string[] }[] }[]): Record<string, { label: string; text: string }[]> {
  const out: Record<string, { label: string; text: string }[]> = {}
  for (const q of questions) {
    for (const a of q.answers) {
      const text = answerText(a.values)
      if (!text) continue
      ;(out[a.volunteerId] ??= []).push({ label: q.archivedAt ? `${q.label} (question retirée)` : q.label, text })
    }
  }
  return out
}

/** An answer for people: « M », « Oui », « Voiture, Vélo »; empty when not answered. */
export function answerText(values: string[] | undefined): string {
  return (values ?? []).join(", ")
}

/**
 * Why an edit of a question can't be saved while it has answers: its type can't change, and an
 * option somebody chose can't disappear. Null when the edit is safe.
 */
export function questionChangeProblem(before: { type: string; options: string[] }, after: { type: string; options: string[] }, usedOptions: string[], answerCount: number): string | null {
  if (answerCount === 0) return null
  if (before.type !== after.type) return "Cette question a déjà des réponses : son type ne peut plus changer. Créez-en une nouvelle."
  const removed = usedOptions.filter((o) => !after.options.includes(o))
  if (removed.length > 0) return `Des bénévoles ont choisi ${removed.map((o) => `« ${o} »`).join(", ")} : ces choix ne peuvent pas être retirés.`
  return null
}
