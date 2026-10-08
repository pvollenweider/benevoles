// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { adminActor, logEvent } from "@/lib/event-log"
import { questionChangeProblem } from "@/lib/event-questions"
import { questionSchema } from "@/lib/event-questions-schema"

type Params = { params: Promise<{ id: string; questionId: string }> }

type Guard = Exclude<Awaited<ReturnType<typeof requireOrgSession>>, NextResponse>

async function load(guard: Guard, id: string, questionId: string) {
  return guard.db.eventQuestion.findFirst({
    where: { id: questionId, eventId: id, archivedAt: null },
    select: { id: true, label: true, type: true, options: true, required: true, answers: { select: { values: true } } },
  })
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

  const question = await guard.db.eventQuestion.update({
    where: { id: questionId },
    data: parsed.data,
    select: { id: true, label: true, type: true, options: true, required: true, position: true, _count: { select: { answers: true } } },
  })
  await logEvent({ eventId: id, actor: adminActor(guard.session), action: "question.updated", entityType: "EventQuestion", entityId: questionId, changes: { label: { from: existing.label, to: question.label } } })
  return NextResponse.json(question)
}

/** Removes a question: deleted when unanswered, archived otherwise so its answers stay (#483). */
export async function DELETE(_req: Request, { params }: Params) {
  const guard = await requireOrgSession()
  if (guard instanceof NextResponse) return guard
  const { id, questionId } = await params
  const existing = await load(guard, id, questionId)
  if (!existing) return NextResponse.json({ error: "Question introuvable" }, { status: 404 })

  if (existing.answers.length === 0) await guard.db.eventQuestion.delete({ where: { id: questionId } })
  else await guard.db.eventQuestion.update({ where: { id: questionId }, data: { archivedAt: new Date() } })
  await logEvent({ eventId: id, actor: adminActor(guard.session), action: "question.removed", entityType: "EventQuestion", entityId: questionId, changes: { label: { from: existing.label, to: null } } })
  return NextResponse.json({ archived: existing.answers.length > 0 })
}
