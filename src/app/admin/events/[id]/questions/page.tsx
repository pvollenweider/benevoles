// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import QuestionsEditor from "@/components/admin/QuestionsEditor"
import AnswerSummary from "@/components/admin/AnswerSummary"
import { QUESTION_LIMIT } from "@/lib/event-questions"
import { answerSummary, answerSummarySelect, stateAt } from "@/lib/question-answer-summary"
import { orgTimeZone } from "@/lib/time-zone"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Questions aux bénévoles" }

/** The custom questions of an event's sign-up form (#483), and the summary of their answers (#686). */
export default async function EventQuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params
  const [event, org] = await Promise.all([
    ctx.db.event.findFirst({
      where: { id },
      select: {
        id: true,
        title: true,
        // Active questions in order, with what the editor shows and what the answers summary (#686)
        // counts; who counts comes from the registrations, not from the stored answers.
        questions: {
          ...answerSummarySelect.questions,
          select: { ...answerSummarySelect.questions.select, required: true, _count: { select: { answers: true } } },
        },
        registrations: answerSummarySelect.registrations,
      },
    }),
    ctx.db.organization.findUnique({ where: { id: ctx.organizationId }, select: { timeZone: true } }),
  ])
  if (!event) notFound()
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href={`/admin/events/${id}`} className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          <span aria-hidden="true">← </span>{event.title}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">Questions aux bénévoles</h1>
        <p className="text-sm text-gray-700 mt-1">
          Jusqu&apos;à {QUESTION_LIMIT} questions ajoutées au formulaire d&apos;inscription (taille de t-shirt, permis, régime…). Chaque bénévole y répond une fois pour l&apos;événement ; les réponses apparaissent dans les inscriptions et les exports.
        </p>
        <p className="text-sm text-gray-700 mt-2">
          <strong>Ne demandez que ce qui est nécessaire</strong> à l&apos;organisation, et pas d&apos;information sensible (santé, religion, opinions…) : les réponses sont des données personnelles, conservées et supprimées avec l&apos;événement.
        </p>
      </div>
      <QuestionsEditor
        eventId={id}
        initialQuestions={event.questions.map(({ _count, id, label, type, options, required }) => ({ id, label, type, options, required, answers: _count.answers }))}
      />
      <AnswerSummary
        eventId={id}
        summary={answerSummary(event.questions, event.registrations)}
        stamp={stateAt(new Date(), orgTimeZone(org))}
      />
    </div>
  )
}
