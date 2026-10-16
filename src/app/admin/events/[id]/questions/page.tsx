// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getOrgContext } from "@/lib/auth-guard"
import QuestionsEditor from "@/components/admin/QuestionsEditor"
import AnswerSummary from "@/components/admin/AnswerSummary"
import { QUESTION_LIMIT } from "@/lib/event-questions"
import { answerSummary, answerSummarySelect, stateAt } from "@/lib/question-answer-summary"
import { orgTimeZone } from "@/lib/time-zone"
import HelpLink from "@/components/admin/HelpLink"

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
          select: { ...answerSummarySelect.questions.select, required: true, minValue: true, maxValue: true, roleName: true, _count: { select: { answers: true } } },
        },
        registrations: answerSummarySelect.registrations,
        // The postes a question can be attached to (#984, part 3), with their sector leaders.
        shifts: { where: { status: { not: "cancelled" } }, select: { roleName: true }, distinct: ["roleName"] },
        sectorLeaders: { select: { roleName: true } },
      },
    }),
    ctx.db.organization.findUnique({ where: { id: ctx.organizationId }, select: { timeZone: true } }),
  ])
  if (!event) notFound()
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 id="page-heading" tabIndex={-1} className="text-2xl font-bold text-gray-900 focus:outline-none">Questions aux bénévoles</h1>
        <HelpLink route="/admin/events/[id]/questions" />
        <p className="text-sm text-gray-700 mt-1">
          Jusqu&apos;à {QUESTION_LIMIT} questions ajoutées au formulaire d&apos;inscription (taille de t-shirt, permis, régime…). Chaque bénévole y répond une fois pour l&apos;événement ; les réponses apparaissent dans les inscriptions et les exports.
        </p>
        <p className="text-sm text-gray-700 mt-2">
          <strong>Ne demandez que ce qui est nécessaire</strong> à l&apos;organisation, et pas d&apos;information sensible (santé, religion, opinions…) : les réponses sont des données personnelles, conservées et supprimées avec l&apos;événement.
        </p>
      </div>
      <QuestionsEditor
        eventId={id}
        initialQuestions={event.questions.map(({ _count, id, label, type, options, required, minValue, maxValue, roleName, parentId, showIfValues }) => ({ id, label, type, options, required, minValue, maxValue, roleName, parentId, showIfValues, answers: _count.answers }))}
        roles={event.shifts.map((s) => ({ roleName: s.roleName, leaders: event.sectorLeaders.filter((l) => l.roleName === s.roleName).length }))}
      />
      <AnswerSummary
        eventId={id}
        summary={answerSummary(event.questions, event.registrations)}
        stamp={stateAt(new Date(), orgTimeZone(org))}
      />
    </div>
  )
}
