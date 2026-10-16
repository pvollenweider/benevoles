// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { adminActor, logEvent } from "@/lib/event-log"
import { QUESTION_LIMIT } from "@/lib/event-questions"
import { questionSchema } from "@/lib/event-questions-schema"
import { questionRoleProblem } from "@/lib/question-role"
import { liveRoleNames } from "@/lib/question-role-data"
import { conditionText } from "@/lib/event-questions"
import { followUpProblem, normalisedShowIf } from "@/lib/question-follow-up"
import { activeQuestions, normalisePositions } from "@/lib/question-follow-up-data"

const select = { id: true, label: true, type: true, options: true, required: true, minValue: true, maxValue: true, roleName: true, parentId: true, showIfValues: true, position: true, _count: { select: { answers: true } } } as const


/** The sign-up questions of an event (#483), active ones in order. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id } = await params
  const event = await guard.db.event.findFirst({ where: { id }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Événement introuvable" }, { status: 404 })
  const questions = await guard.db.eventQuestion.findMany({ where: { eventId: id, archivedAt: null }, orderBy: { position: "asc" }, select })
  return NextResponse.json(questions)
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { db } = guard
  const { id } = await params
  const event = await db.event.findFirst({ where: { id }, select: { id: true } })
  if (!event) return NextResponse.json({ error: "Événement introuvable" }, { status: 404 })

  const parsed = questionSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return validationError(parsed.error, { useIssueMessage: true })

  // A poste of this very event only (#984, part 3): never another event's, nor another organisation's.
  const roleProblem = parsed.data.roleName ? questionRoleProblem(parsed.data.roleName, await liveRoleNames(db, id)) : null
  if (roleProblem) return NextResponse.json({ error: roleProblem, field: "roleName" }, { status: 400 })

  const active = await db.eventQuestion.count({ where: { eventId: id, archivedAt: null } })
  if (active >= QUESTION_LIMIT) return NextResponse.json({ error: `${QUESTION_LIMIT} questions au plus par événement.` }, { status: 409 })

  // A follow-up (#1016) of an active yes/no or choice question of this very event, one level only.
  const data = { ...parsed.data }
  let parentLabel: string | null = null
  if (data.parentId) {
    const questions = await activeQuestions(db, id)
    const problem = followUpProblem({ selfId: null, parentId: data.parentId, showIfValues: data.showIfValues ?? [] }, questions)
    if (problem) return NextResponse.json({ error: problem, field: "parentId" }, { status: 400 })
    const parent = questions.find((q) => q.id === data.parentId)!
    data.showIfValues = normalisedShowIf(parent, data.showIfValues ?? [])
    parentLabel = parent.label
  }

  let question = await db.eventQuestion.create({ data: { eventId: id, position: active, ...data }, select })
  // Placed right after its parent, not at the end of the form.
  if (question.parentId) {
    await normalisePositions(db, id)
    question = (await db.eventQuestion.findFirst({ where: { id: question.id, eventId: id }, select })) ?? question
  }
  await logEvent({
    eventId: id, actor: adminActor(guard.session), action: "question.created", entityType: "EventQuestion", entityId: question.id,
    changes: {
      label: { from: null, to: question.label },
      ...(question.roleName ? { roleName: { from: null, to: question.roleName } } : {}),
      ...(parentLabel ? { condition: { from: null, to: conditionText(question.showIfValues, parentLabel) } } : {}),
    },
  })
  return NextResponse.json(question, { status: 201 })
}
