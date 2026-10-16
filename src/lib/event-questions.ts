// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Custom questions of an event's sign-up form (#483): text, yes/no, single or multiple choice, or a
 * whole number between optional bounds (#1015), required or not, a few per event. The server validates the answers (the page only helps);
 * a question with answers is archived rather than deleted, and its type or used options can't
 * change under existing answers. Pure, and free of zod: the public sign-up page imports it (#773);
 * the question schema of the admin API is in event-questions-schema.ts.
 */
export const QUESTION_LIMIT = 5
export const QUESTION_TYPES = ["text", "yesno", "single", "multiple", "number"] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]
export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  text: "Texte court",
  yesno: "Oui / non",
  single: "Choix unique",
  multiple: "Choix multiple",
  number: "Nombre",
}
export const TEXT_ANSWER_MAX = 200
export const YES = "Oui"
export const NO = "Non"

export type Question = {
  id: string
  label: string
  type: string
  options: string[]
  required: boolean
  /** Bounds of a "number" question (#1015): null or absent minValue means 0, maxValue no bound. */
  minValue?: number | null
  maxValue?: number | null
  /**
   * Follow-up question (#1016): the parent question it depends on, and the parent's answers that
   * show it. Null or absent parentId: asked to everyone.
   */
  parentId?: string | null
  showIfValues?: string[]
}

// ── Number questions (#1015) ────────────────────────────────────────────────

/**
 * The largest answer or bound of a number question: six digits, enough for a head count or an
 * amount, and a sum that stays exact. Whole numbers 0 or more only: the numeric keypad of phones
 * has no minus key.
 */
export const NUMBER_ANSWER_MAX = 999999

/** The bounds an answer must respect: the minimum (0 by default) and the maximum, null for none. */
export function numberBounds(q: { minValue?: number | null; maxValue?: number | null }): { min: number; max: number | null } {
  return { min: q.minValue ?? 0, max: q.maxValue ?? null }
}

/** The accepted range for people: « de 1 à 10 », « 0 ou plus », « 5 au plus ». */
export function numberRangeText(q: { minValue?: number | null; maxValue?: number | null }): string {
  const { min, max } = numberBounds(q)
  if (max === null) return `${min} ou plus`
  return min === 0 ? `${max} au plus` : `de ${min} à ${max}`
}

/** The hint under a number field, for volunteers: « Un nombre entier, de 1 à 10. » */
export function numberHint(q: { minValue?: number | null; maxValue?: number | null }): string {
  return `Un nombre entier, ${numberRangeText(q)}.`
}

/**
 * A typed number: its value, null when empty, NaN when not a whole number. Spaces are ignored
 * (« 1 000 »); a sign is read so that « -2 » is refused for its value, not its spelling.
 */
export function parseWholeNumber(v: unknown): number | null {
  if (v === undefined || v === null) return null
  if (typeof v === "number") return Number.isInteger(v) ? v : NaN
  if (typeof v !== "string") return NaN
  const t = v.replace(/[\s\u00a0\u202f]/g, "")
  if (t === "") return null
  return /^-?\d{1,9}$/.test(t) ? Number(t) : NaN
}

/** Why a number answer is refused, or null when it fits the question. */
function numberProblem(q: Question, n: number): string | null {
  if (Number.isNaN(n)) return `« ${q.label} » : indique un nombre entier, sans virgule.`
  const { min, max } = numberBounds(q)
  const top = max ?? NUMBER_ANSWER_MAX
  if (n >= min && n <= top) return null
  if (max !== null) return min === 0 ? `« ${q.label} » : au plus ${max}.` : `« ${q.label} » : entre ${min} et ${max}.`
  return n < min ? `« ${q.label} » : au moins ${min}.` : `« ${q.label} » : au plus ${NUMBER_ANSWER_MAX}.`
}


// ── Follow-up questions (#1016) ─────────────────────────────────────────────

/** The types a follow-up can depend on: their answers are a fixed list of choices. */
export const PARENT_TYPES = ["yesno", "single", "multiple"] as const
export const FOLLOW_UP_TERM = "question de suivi"

/** Whether a question is a follow-up of another one. */
export function isFollowUp(q: { parentId?: string | null }): boolean {
  return !!q.parentId
}

/** The choices of a yes/no or choice question, the values a follow-up's condition picks from. */
export function parentChoices(q: { type: string; options: string[] }): string[] {
  if (q.type === "yesno") return [YES, NO]
  return q.type === "single" || q.type === "multiple" ? q.options : []
}

/** Whether a question can be the parent of a follow-up: a choice question that isn't one itself. */
export function canBeParent(q: { type: string; parentId?: string | null }): boolean {
  return (PARENT_TYPES as readonly string[]).includes(q.type) && !isFollowUp(q)
}

/**
 * Whether a follow-up is asked, given its parent's answer: one of the accepted values chosen (any
 * of them for a multiple choice). A question without a parent is always asked.
 */
export function followUpApplies(q: { parentId?: string | null; showIfValues?: string[] }, parentValues: string[] | undefined): boolean {
  if (!q.parentId) return true
  const accepted = q.showIfValues ?? []
  return (parentValues ?? []).some((v) => accepted.includes(v))
}

/**
 * The questions in form order: each question followed right away by its follow-ups, both kept in
 * their relative order. A follow-up whose parent is not in the list (removed) stays where it is.
 */
export function formOrder<T extends { id: string; parentId?: string | null }>(questions: T[]): T[] {
  const ids = new Set(questions.map((q) => q.id))
  const children = new Map<string, T[]>()
  for (const q of questions) if (q.parentId && ids.has(q.parentId)) (children.get(q.parentId) ?? children.set(q.parentId, []).get(q.parentId)!).push(q)
  const out: T[] = []
  for (const q of questions) {
    if (q.parentId && ids.has(q.parentId)) continue
    out.push(q, ...(children.get(q.id) ?? []))
  }
  return out
}

/** A form's answer as the parent check reads it: the chosen values, empty when none. */
function rawValues(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && x !== "")
  if (v === true) return [YES]
  if (v === false) return [NO]
  return typeof v === "string" && v !== "" ? [v] : []
}

/**
 * The questions a form shows for the answers being typed (#1016): every question, except a
 * follow-up whose parent's answer doesn't match (or whose parent isn't on the form), in form order.
 */
export function visibleQuestions<T extends Question>(questions: T[], answers: RawAnswers): T[] {
  const ids = new Set(questions.map((q) => q.id))
  return formOrder(questions).filter((q) => !q.parentId || (ids.has(q.parentId) && followUpApplies(q, rawValues(answers[q.parentId]))))
}

/** « Si « Oui » à « Tu manges avec nous ? » », or with several answers « Si « Oui » ou « Peut-être » à … ». */
export function conditionText(showIfValues: string[], parentLabel: string): string {
  return `Si ${showIfValues.map((v) => `« ${v} »`).join(" ou ")} à « ${parentLabel} »`
}

/** Raw answers as posted: text, "Oui"/"Non", one option, a list of options, or a number. */
export type RawAnswers = Record<string, unknown>

/**
 * `hidden`: the follow-ups (#1016) not asked for these answers. They are never refused nor
 * required, nothing of them is in `values`, and the callers clear what they had stored.
 */
export type AnswerCheck = { ok: true; values: Map<string, string[]>; hidden: string[] } | { ok: false; errors: { questionId: string; message: string }[] }

/**
 * The answers the server stores, or what is wrong with them. Unknown question ids are ignored.
 * `keep` (the personal page, which sends only some questions): the stored answers of the questions
 * absent from `raw`, taken as they are, unchecked, so that a follow-up is judged on its parent's
 * actual answer. Without it, a question absent from `raw` is not answered.
 * A follow-up (#1016) is checked only when its parent's answer, checked first, shows it; one whose
 * parent is not among `questions` (removed) is never asked.
 */
export function checkAnswers(questions: Question[], raw: RawAnswers | undefined, opts: { keep?: Map<string, string[]> } = {}): AnswerCheck {
  const values = new Map<string, string[]>()
  const errors: { questionId: string; message: string }[] = []
  const hidden: string[] = []
  const ids = new Set(questions.map((q) => q.id))
  const order = new Map(questions.map((q, i) => [q.id, i]))
  // Parents before follow-ups: a follow-up reads its parent's checked answer.
  const sorted = [...questions].sort((a, b) => Number(isFollowUp(a)) - Number(isFollowUp(b)))
  for (const q of sorted) {
    if (q.parentId && (!ids.has(q.parentId) || !followUpApplies(q, values.get(q.parentId)))) { hidden.push(q.id); continue }
    if (opts.keep && !(raw && Object.hasOwn(raw, q.id))) {
      const kept = opts.keep.get(q.id) ?? []
      if (kept.length > 0) values.set(q.id, kept)
      continue
    }
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
    } else if (q.type === "number") {
      const n = parseWholeNumber(v)
      if (n !== null) {
        const problem = numberProblem(q, n)
        if (problem) { errors.push({ questionId: q.id, message: problem }); continue }
        // Stored in one spelling, « 3 » whatever was typed (« 03 », « 3 »): the sum reads it back.
        vals = [String(n)]
      }
    }
    if (q.required && vals.length === 0) { errors.push({ questionId: q.id, message: `« ${q.label} » est obligatoire.` }); continue }
    if (vals.length > 0) values.set(q.id, vals)
  }
  errors.sort((a, b) => order.get(a.questionId)! - order.get(b.questionId)!)
  return errors.length > 0 ? { ok: false, errors } : { ok: true, values, hidden }
}

/**
 * The answers an unproven sign-up may add (#483 `addMissing`) once the follow-ups are taken into
 * account (#1016): the member's stored parent answer wins over the one typed, so a follow-up is
 * added only when that effective answer shows it. An anonymous form never unlocks a follow-up
 * against a stored « Non ».
 */
export function consistentAdditions(questions: Question[], additions: [string, string[]][], stored: Map<string, string[]>): [string, string[]][] {
  const added = new Map(additions)
  const byId = new Map(questions.map((q) => [q.id, q]))
  const effective = (id: string) => (stored.get(id)?.length ? stored.get(id) : added.get(id))
  return additions.filter(([id]) => {
    const q = byId.get(id)
    if (!q?.parentId) return true
    return byId.has(q.parentId) && followUpApplies(q, effective(q.parentId))
  })
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
 * Why an edit of a question can't be saved while it has answers: its type can't change, an option
 * somebody chose can't disappear, and the bounds of a number question can't leave out an answer
 * given (#1015). Null when the edit is safe.
 */
export function questionChangeProblem(
  before: { type: string; options: string[] },
  after: { type: string; options: string[]; minValue?: number | null; maxValue?: number | null },
  usedOptions: string[],
  answerCount: number,
): string | null {
  if (answerCount === 0) return null
  if (before.type !== after.type) return "Cette question a déjà des réponses : son type ne peut plus changer. Créez-en une nouvelle."
  if (after.type === "number") {
    const given = usedOptions.map(parseWholeNumber).filter((n): n is number => n !== null && !Number.isNaN(n))
    if (given.length === 0) return null
    const { min, max } = numberBounds(after)
    const lowest = Math.min(...given)
    const highest = Math.max(...given)
    if (lowest < min) return `Un bénévole a répondu ${lowest} : le minimum ne peut pas dépasser ${lowest}.`
    if (max !== null && highest > max) return `Un bénévole a répondu ${highest} : le maximum ne peut pas être inférieur à ${highest}.`
    return null
  }
  const removed = usedOptions.filter((o) => !after.options.includes(o))
  if (removed.length > 0) return `Des bénévoles ont choisi ${removed.map((o) => `« ${o} »`).join(", ")} : ces choix ne peuvent pas être retirés.`
  return null
}
