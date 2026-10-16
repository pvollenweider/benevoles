// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { adminActor, logEvent } from "@/lib/event-log"
import { questionChangeProblem } from "@/lib/event-questions"
import { questionSchema } from "@/lib/event-questions-schema"
import { questionRoleProblem } from "@/lib/question-role"
import { liveRoleNames } from "@/lib/question-role-data"
import { conditionText } from "@/lib/event-questions"
import { followUpProblem, normalisedShowIf, parentEditProblem } from "@/lib/question-follow-up"
import { activeQuestions, normalisePositions } from "@/lib/question-follow-up-data"

type Params = { params: Promise<{ id: string; questionId: string }> }

type Guard = Exclude<Awaited<ReturnType<typeof requireOrgSession>>, NextResponse>

async function load(guard: Guard, id: string, questionId: string) {
  return guard.db.eventQuestion.findFirst({
    where: { id: questionId, eventId: id, archivedAt: null },
    select: {
      id: true, label: true, type: true, options: true, required: true, minValue: true, maxValue: true, roleName: true, parentId: true, showIfValues: true,
      answers: { select: { values: true } },
      // Its active follow-ups (#1016): what an edit must keep, what a removal carries along.
      followUps: { where: { archivedAt: null }, select: { id: true, label: true, showIfValues: true, _count: { select: { answers: true } } } },
    },
  })
}

/** The condition of a follow-up as the event log says it, null without a parent. */
async function conditionOf(guard: Guard, eventId: string, parentId: string | null | undefined, values: string[] | undefined): Promise<string | null> {
  if (!parentId) return null
  const parent = await guard.db.eventQuestion.findFirst({ where: { id: parentId, eventId }, select: { label: true } })
  return parent ? conditionText(values ?? [], parent.label) : null
}

/** Edits a question (#483); its type and the options somebody chose are kept under answers. */
export async function PATCH(req: Request, { params }: Params) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id, questionId } = await params
  const existing = await load(guard, id, questionId)
  if (!existing) return NextResponse.json({ error: "Question introuvable" }, { status: 404 })

  const parsed = questionSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error, { useIssueMessage: true })

  const used = [...new Set(existing.answers.flatMap((a) => a.values))]
  const problem = questionChangeProblem(existing, parsed.data, used, existing.answers.length)
  if (problem) return NextResponse.json({ error: problem }, { status: 409 })

  // A poste of this very event (#984, part 3); the one it already has stays allowed unchanged.
  const { roleName } = parsed.data
  const roleProblem = roleName && roleName !== existing.roleName ? questionRoleProblem(roleName, await liveRoleNames(guard.db, id), existing.roleName) : null
  if (roleProblem) return NextResponse.json({ error: roleProblem, field: "roleName" }, { status: 400 })

  // A parent keeps what its follow-ups' conditions use (#1016).
  const followUps = existing.followUps ?? []
  const parentProblem = parentEditProblem(parsed.data, followUps)
  if (parentProblem) return NextResponse.json({ error: parentProblem }, { status: 409 })

  // Its own condition (#1016): a parent of this event, one level, locked once answered.
  const data = { ...parsed.data }
  if (data.parentId !== undefined) {
    const questions = data.parentId ? await activeQuestions(guard.db, id) : []
    const problem = followUpProblem(
      { selfId: questionId, parentId: data.parentId ?? null, showIfValues: data.showIfValues ?? [] },
      questions,
      { parentId: existing.parentId ?? null, showIfValues: existing.showIfValues ?? [], answerCount: existing.answers.length },
    )
    if (problem) return NextResponse.json({ error: problem, field: "parentId" }, { status: 400 })
    const parent = questions.find((q) => q.id === data.parentId)
    if (parent) data.showIfValues = normalisedShowIf(parent, data.showIfValues ?? [])
  }

  const select = { id: true, label: true, type: true, options: true, required: true, minValue: true, maxValue: true, roleName: true, parentId: true, showIfValues: true, position: true, _count: { select: { answers: true } } } as const
  let question = await guard.db.eventQuestion.update({ where: { id: questionId }, data, select })
  const parentChanged = data.parentId !== undefined && (existing.parentId ?? null) !== (question.parentId ?? null)
  if (parentChanged && question.parentId) {
    // Moved right after its new parent.
    await normalisePositions(guard.db, id)
    question = (await guard.db.eventQuestion.findFirst({ where: { id: questionId, eventId: id }, select })) ?? question
  }
  const roleChanged = (existing.roleName ?? null) !== (question.roleName ?? null)
  const before = await conditionOf(guard, id, existing.parentId, existing.showIfValues)
  const after = await conditionOf(guard, id, question.parentId, question.showIfValues)
  await logEvent({
    eventId: id, actor: adminActor(guard.session), action: "question.updated", entityType: "EventQuestion", entityId: questionId,
    changes: {
      label: { from: existing.label, to: question.label },
      ...(roleChanged ? { roleName: { from: existing.roleName ?? null, to: question.roleName ?? null } } : {}),
      ...(before !== after ? { condition: { from: before, to: after } } : {}),
    },
  })
  return NextResponse.json(question)
}

/**
 * Removes a question: deleted when unanswered, archived otherwise so its answers stay (#483). Its
 * follow-ups (#1016) go with it, each the same way: without their parent they would mean nothing.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id, questionId } = await params
  const existing = await load(guard, id, questionId)
  if (!existing) return NextResponse.json({ error: "Question introuvable" }, { status: 404 })

  const now = new Date()
  const followUps = existing.followUps ?? []
  const removed = [
    ...followUps.map((f) => ({ id: f.id, label: f.label, archived: f._count.answers > 0 })),
    { id: questionId, label: existing.label, archived: existing.answers.length > 0 },
  ]
  // Follow-ups first: a parent deleted first would leave them unconditional for an instant.
  await guard.db.$transaction(removed.map((r) => r.archived
    ? guard.db.eventQuestion.update({ where: { id: r.id }, data: { archivedAt: now } })
    : guard.db.eventQuestion.delete({ where: { id: r.id } })))
  for (const r of removed) {
    await logEvent({ eventId: id, actor: adminActor(guard.session), action: "question.removed", entityType: "EventQuestion", entityId: r.id, changes: { label: { from: r.label, to: null } } })
  }
  return NextResponse.json({ archived: existing.answers.length > 0, followUps: followUps.map((f) => ({ id: f.id, label: f.label, archived: f._count.answers > 0 })) })
}
