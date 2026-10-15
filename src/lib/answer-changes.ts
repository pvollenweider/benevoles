// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A volunteer changing their answers from the personal page (#984, part 2): when it is still
 * allowed, what changed, how the event log records it, whom the organisers' email goes to, and how
 * several changes in a row collapse into one line of that email. Pure and client-safe (no Prisma):
 * the personal page reads the texts and the rule, the API and the notifications the rest.
 */
import { answerText } from "./event-questions"
import { selfCancelState, type CancelDeadlineSetting, type SelfCancelReason, type ShiftWhen } from "./cancel-deadline"

// ── When ────────────────────────────────────────────────────────────────────

export type AnswersEditState = { allowed: true } | { allowed: false; reason: SelfCancelReason }

/**
 * Same lock as a withdrawal (#946): answers can change while at least one of the volunteer's live
 * registrations on the event can still be withdrawn online, that is before its shift starts and,
 * for a confirmed place, before the event's earlier deadline. Once none can, the event is under
 * way (or over) and a change goes through the organisation. No registration: closed.
 */
export function answersEditState(input: {
  registrations: { status: string; shift: ShiftWhen }[]
  setting?: CancelDeadlineSetting | null
  timeZone: string
  now: Date
}): AnswersEditState {
  const states = input.registrations.map((r) => selfCancelState({ status: r.status, shift: r.shift, setting: input.setting, timeZone: input.timeZone, now: input.now }))
  if (states.length === 0) return { allowed: false, reason: "ended" }
  if (states.some((s) => s.allowed)) return { allowed: true }
  const reasons = states.map((s) => (s.allowed ? null : s.reason))
  // A shift under way: « commencé »; every shift over: « terminé »; otherwise the deadline.
  if (reasons.includes("started")) return { allowed: false, reason: "started" }
  if (reasons.every((r) => r === "ended")) return { allowed: false, reason: "ended" }
  return { allowed: false, reason: "deadline" }
}

export const EDIT_ANSWERS_LABEL = "Modifier mes réponses"

/** Why the answers can't change online any more, for the personal page and the API's refusal. */
export function answersClosedText(reason: SelfCancelReason): string {
  if (reason === "deadline") return "Tu ne peux plus modifier tes réponses en ligne : le délai pour changer ton inscription est passé."
  if (reason === "started") return "Tu ne peux plus modifier tes réponses en ligne : ta mission a commencé."
  return "Tu ne peux plus modifier tes réponses en ligne : l'événement est terminé."
}

export const ANSWERS_SAVED_TEXT = "Réponses enregistrées."
export const ANSWERS_UNCHANGED_TEXT = "Aucune modification à enregistrer."
export const ANSWERS_SAVE_FAILED_TEXT = "Enregistrement impossible. Réessaie plus tard."

// ── What changed ────────────────────────────────────────────────────────────

/**
 * One question whose answer changed: values as stored (empty = no answer), and the poste the
 * question is attached to (part 3), null or absent when it concerns the organisers.
 */
export type AnswerChange = { questionId: string; label: string; from: string[]; to: string[]; roleName?: string | null }

const same = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

/**
 * The questions whose answer differs between what is stored and what was checked (`checkAnswers`),
 * in the order of `questions`. A question absent from `submitted` keeps its answer: only the
 * questions the volunteer sent are compared (`submitted` holds their ids).
 */
export function answerChanges(
  questions: { id: string; label: string; roleName?: string | null; answers: { values: string[] }[] }[],
  submitted: Set<string>,
  values: Map<string, string[]>,
): AnswerChange[] {
  const out: AnswerChange[] = []
  for (const q of questions) {
    if (!submitted.has(q.id)) continue
    const from = q.answers[0]?.values ?? []
    const to = values.get(q.id) ?? []
    if (!same(from, to)) out.push({ questionId: q.id, label: q.label, from, to, roleName: q.roleName ?? null })
  }
  return out
}

// ── Event log ───────────────────────────────────────────────────────────────

export const ANSWER_CHANGED_ACTION = "question.answer_changed"

/**
 * What the event log keeps of one change: the question's label (unchanged, so the sentence can name
 * it) and the answer before and after, as people read it, null for no answer. Nothing else about
 * the person: the actor id says who. The answer is personal data: an erasure or the anonymisation
 * of the event removes it from these entries (`ANSWER_LOG_FIELD`).
 */
export function answerChangeLog(change: AnswerChange) {
  return {
    question: { from: change.label, to: change.label },
    [ANSWER_LOG_FIELD]: { from: answerText(change.from) || null, to: answerText(change.to) || null },
  }
}

/** The field of `changes` holding the answer itself, the one an erasure removes. */
export const ANSWER_LOG_FIELD = "answer"

// ── Organisers' email ───────────────────────────────────────────────────────

/** One volunteer's changes in the organisers' email: the final state of each question. */
export type AnswerChangeItem = {
  volunteerName: string
  changes: { questionId: string; label: string; from: string | null; to: string | null }[]
}

export function answerChangeItem(volunteerName: string, changes: AnswerChange[]): AnswerChangeItem {
  return {
    volunteerName,
    changes: changes.map((c) => ({ questionId: c.questionId, label: c.label, from: answerText(c.from) || null, to: answerText(c.to) || null })),
  }
}

/**
 * Two changes by the same volunteer while their email waits (#869 grouping): one line per question,
 * with the answer before the first change and after the last one. A question changed back to where
 * it was drops out; null when nothing is left, so the line goes away.
 */
export function mergeAnswerChangeItems(previous: AnswerChangeItem, next: AnswerChangeItem): AnswerChangeItem | null {
  const merged = previous.changes.map((c) => ({ ...c }))
  for (const c of next.changes) {
    const earlier = merged.find((m) => m.questionId === c.questionId)
    if (earlier) {
      earlier.to = c.to
      earlier.label = c.label
    } else merged.push({ ...c })
  }
  const changes = merged.filter((c) => c.from !== c.to)
  return changes.length > 0 ? { volunteerName: next.volunteerName, changes } : null
}

export type AnswerChangeRecipient = { email: string; name: string }

/** A sector leader of the event (#186): one row per poste they lead, each with its own link. */
export type AnswerChangeLeader = { id: string; roleName: string; email: string; name: string }

/**
 * Who receives which changes: the organisers (`leader` absent), or one sector leader of the poste
 * the question is attached to (`leader` set: their row, for their personal link).
 */
export type AnswerChangeAudienceEntry = { recipient: AnswerChangeRecipient; changes: AnswerChange[]; leader?: AnswerChangeLeader }

/**
 * Who is told of a volunteer's changes, and which changes each person gets. The one place that
 * routes them:
 * - a change to a question attached to a poste (#984, part 3) goes to that poste's sector leaders
 *   only, each with the changes of their poste;
 * - a change to any other question, or to one whose poste has no leader with an address, goes to
 *   the organisers, i.e. the organisation's active admins (or the platform's fallback address when
 *   it has none, as for a sign-up): nothing is lost when a poste has nobody to tell.
 * One save can do both: the organisers get their part, the leaders theirs, nobody twice.
 */
export function answerChangeAudience(
  changes: AnswerChange[],
  people: { admins: AnswerChangeRecipient[]; fallbackEmail?: string | null; leaders?: AnswerChangeLeader[] },
): AnswerChangeAudienceEntry[] {
  if (changes.length === 0) return []
  const leadersOf = (roleName: string | null | undefined) =>
    roleName ? (people.leaders ?? []).filter((l) => l.roleName === roleName && l.email.trim() !== "") : []
  const forOrganisers = changes.filter((c) => leadersOf(c.roleName).length === 0)
  const admins = people.admins.length > 0
    ? people.admins
    : people.fallbackEmail ? [{ email: people.fallbackEmail, name: "Admin" }] : []
  const out: AnswerChangeAudienceEntry[] = forOrganisers.length > 0 ? admins.map((recipient) => ({ recipient, changes: forOrganisers })) : []
  for (const leader of people.leaders ?? []) {
    if (leader.email.trim() === "") continue
    const theirs = changes.filter((c) => c.roleName === leader.roleName)
    if (theirs.length > 0) out.push({ recipient: { email: leader.email, name: leader.name }, changes: theirs, leader })
  }
  return out
}

/** The postes the changes concern, for reading their leaders: none, no read. */
export function answerChangeRoles(changes: AnswerChange[]): string[] {
  return [...new Set(changes.map((c) => c.roleName).filter((r): r is string => !!r))]
}

/** How long the organisers' email waits for more changes on the event: same as withdrawals (#869). */
export const ANSWER_CHANGE_DIGEST_DELAY_MS = 5 * 60 * 1000

/** One email per kind, event and recipient: changes of several volunteers share it. */
export function answerChangeGroupKey(eventId: string, recipientEmail: string): string {
  return `answers_changed:${eventId}:${recipientEmail.toLowerCase()}`
}

/**
 * A sector leader's email (part 3): one per event and leader row, so a person leading two postes
 * gets each poste's changes with that poste's link.
 */
export function leaderAnswerChangeGroupKey(eventId: string, leaderId: string): string {
  return `sector_leader_answers_changed:${eventId}:${leaderId}`
}

/** A volunteer's line in that email: their later changes merge into it while it waits. */
export function answerChangeMergeKey(volunteerId: string): string {
  return `volunteer:${volunteerId}`
}
