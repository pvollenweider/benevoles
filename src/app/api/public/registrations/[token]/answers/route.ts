// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { recordTokenMiss, tokenLookupsBlocked, tokenUseAllowed } from "@/lib/token-rate-limit"
import { registrationToken } from "@/lib/token-vault"
import { LIVE_STATUSES } from "@/lib/registration-capacity"
import { orgTimeZone } from "@/lib/time-zone"
import { checkAnswers } from "@/lib/event-questions"
import { myAnswerRows, myAnswersQuery, storedAnswers } from "@/lib/my-answers"
import { answerChanges, answersClosedText, answersEditState } from "@/lib/answer-changes"
import { recordAnswerChanges, writeAnswerChanges } from "@/lib/answer-change-save"

const tooManyAttempts = () => NextResponse.json({ error: "Trop de tentatives. Réessaie dans quelques minutes." }, { status: 429 })
const notFound = () => NextResponse.json({ error: "Lien invalide ou inscription annulée." }, { status: 404 })

/** Only the answers, by question id: anything else in the body (an event, a volunteer) is ignored. */
const bodySchema = z.object({ answers: z.record(z.string(), z.unknown()) })

/**
 * PATCH /api/public/registrations/[token]/answers (#984, part 2): the volunteer behind a live
 * personal link changes their answers to the event's questions. Who and which event come from the
 * link's registration only; only the event's active questions sent in the body are compared, the
 * others keep their answer. Same checks as the sign-up (`checkAnswers`: a required question can't
 * be cleared), same lock as a withdrawal (`answersEditState`). Each change is logged, and the
 * organisers are told by a grouped email.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  // Failed lookups count per IP, valid use per link (#609).
  if (await tokenLookupsBlocked(req)) return tooManyAttempts()

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Réponses invalides." }, { status: 400 })

  const { token } = await params
  const registration = await prisma.registration.findFirst({
    where: { ...registrationToken.where(token), status: { in: [...LIVE_STATUSES] } },
    select: {
      volunteerId: true,
      eventId: true,
      volunteer: { select: { firstName: true, lastName: true } },
      event: { select: { id: true, title: true, organizationId: true, cancelDeadlineDays: true, cancelDeadlineHours: true, organization: { select: { timeZone: true } } } },
    },
  })
  if (!registration) {
    await recordTokenMiss(req)
    return notFound()
  }
  if (!(await tokenUseAllowed(token, "answers"))) return tooManyAttempts()

  const { volunteerId, eventId, event } = registration
  const timeZone = orgTimeZone(event.organization)
  const now = new Date()

  // The withdrawals' lock (#946), on every live registration of this volunteer on the event.
  const live = await prisma.registration.findMany({
    where: { volunteerId, eventId, status: { in: [...LIVE_STATUSES] } },
    select: { status: true, shift: { select: { date: true, startTime: true, endTime: true } } },
  })
  const edit = answersEditState({ registrations: live, setting: event, timeZone, now })
  if (!edit.allowed) {
    return NextResponse.json({ error: answersClosedText(edit.reason), code: "answers_closed", reason: edit.reason }, { status: 409 })
  }

  // The event's active questions with this volunteer's stored answers; only those sent are checked,
  // the others kept as stored. A follow-up (#1016) whose parent's answer no longer shows it is
  // cleared, sent or not: it counts as a change, logged and told like the others.
  const questions = await prisma.eventQuestion.findMany(myAnswersQuery(eventId, volunteerId))
  const raw = parsed.data.answers
  const submitted = new Set(questions.filter((q) => Object.hasOwn(raw, q.id)).map((q) => q.id))
  const check = checkAnswers(questions, raw, { keep: storedAnswers(questions) })
  if (!check.ok) {
    return NextResponse.json({ error: check.errors.map((e) => e.message).join(" "), questionErrors: check.errors }, { status: 400 })
  }

  const changes = answerChanges(questions, new Set([...submitted, ...check.hidden]), check.values)
  if (changes.length === 0) return NextResponse.json({ answers: myAnswerRows(questions), changed: 0 })

  // Conditional on the record not being erased (#516): a link resolved just before an erasure
  // never writes answers back onto the erased record.
  const written = await prisma.$transaction(async (tx) => {
    const still = await tx.volunteer.findFirst({ where: { id: volunteerId, erasedAt: null }, select: { id: true } })
    if (!still) return false
    await writeAnswerChanges(tx, { eventId, volunteerId, changes })
    return true
  })
  if (!written) return notFound()

  // Logged per question, the organisers or the poste's leaders told by a grouped email (#998).
  await recordAnswerChanges({
    event: { id: event.id, title: event.title, organizationId: event.organizationId },
    volunteerId,
    volunteerName: `${registration.volunteer.firstName} ${registration.volunteer.lastName}`,
    changes,
  }, now)

  const fresh = await prisma.eventQuestion.findMany(myAnswersQuery(eventId, volunteerId))
  return NextResponse.json({ answers: myAnswerRows(fresh), changed: changes.length })
}
