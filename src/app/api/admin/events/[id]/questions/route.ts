// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { requireOrgSession } from "@/lib/auth-guard"
import { validationError } from "@/lib/api-error"
import { adminActor, logEvent } from "@/lib/event-log"
import { QUESTION_LIMIT, questionSchema } from "@/lib/event-questions"

const select = { id: true, label: true, type: true, options: true, required: true, position: true, _count: { select: { answers: true } } } as const

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

  const active = await db.eventQuestion.count({ where: { eventId: id, archivedAt: null } })
  if (active >= QUESTION_LIMIT) return NextResponse.json({ error: `${QUESTION_LIMIT} questions au plus par événement.` }, { status: 409 })

  const question = await db.eventQuestion.create({ data: { eventId: id, position: active, ...parsed.data }, select })
  await logEvent({ eventId: id, actor: adminActor(guard.session), action: "question.created", entityType: "EventQuestion", entityId: question.id, changes: { label: { from: null, to: question.label } } })
  return NextResponse.json(question, { status: 201 })
}
