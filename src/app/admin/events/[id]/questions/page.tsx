// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getOrgContext } from "@/lib/auth-guard"
import QuestionsEditor from "@/components/admin/QuestionsEditor"
import { QUESTION_LIMIT } from "@/lib/event-questions"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Questions aux bénévoles" }

/** The custom questions of an event's sign-up form (#483). */
export default async function EventQuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getOrgContext()
  if (!ctx) redirect("/admin/login")
  const { id } = await params
  const event = await ctx.db.event.findFirst({
    where: { id },
    select: {
      id: true,
      title: true,
      questions: {
        where: { archivedAt: null },
        orderBy: { position: "asc" },
        select: { id: true, label: true, type: true, options: true, required: true, _count: { select: { answers: true } } },
      },
    },
  })
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
        initialQuestions={event.questions.map(({ _count, ...q }) => ({ ...q, answers: _count.answers }))}
      />
    </div>
  )
}
