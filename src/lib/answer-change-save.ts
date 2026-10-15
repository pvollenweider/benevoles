// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Saving a volunteer's answer changes (#984, part 2), the one way for the personal page's editor
 * (PATCH /api/public/registrations/[token]/answers) and the sign-up for more shifts from the
 * personal page (#1013): the writes, inside the caller's transaction, then the event log entry per
 * question and the grouped email to the organisers or the poste's sector leaders (#998).
 * Server-only (Prisma); the rules themselves are in answer-changes.ts.
 */
import { randomUUID } from "node:crypto"
import type { Prisma } from "@/generated/prisma/client"
import { answerChangeLog, type AnswerChange } from "./answer-changes"
import { queueAnswerChangeNotifications } from "./answer-change-notifications"
import { logEvent } from "./event-log"
import { deliverAfterResponse } from "./notifications/outbox"
import { reportError } from "./report-error"

type AnswersTx = { questionAnswer: Pick<Prisma.TransactionClient["questionAnswer"], "deleteMany" | "upsert"> }

/** Each changed answer stored as it now is: removed when emptied, else replaced or added. */
export async function writeAnswerChanges(tx: AnswersTx, input: { eventId: string; volunteerId: string; changes: AnswerChange[] }): Promise<void> {
  const { eventId, volunteerId } = input
  for (const c of input.changes) {
    if (c.to.length === 0) {
      await tx.questionAnswer.deleteMany({ where: { questionId: c.questionId, volunteerId } })
    } else {
      await tx.questionAnswer.upsert({
        where: { questionId_volunteerId: { questionId: c.questionId, volunteerId } },
        create: { questionId: c.questionId, eventId, volunteerId, values: c.to },
        update: { values: c.to },
      })
    }
  }
}

/**
 * Once the writes are committed: one event log entry per changed question, by the volunteer, and
 * the grouped email (sent after the response). Best-effort for the email: the answers are saved,
 * a failed email must not say otherwise. Nothing at all without a change.
 */
export async function recordAnswerChanges(input: {
  event: { id: string; title: string; organizationId: string }
  volunteerId: string
  volunteerName: string
  changes: AnswerChange[]
}, now: Date = new Date()): Promise<void> {
  if (input.changes.length === 0) return
  for (const c of input.changes) {
    await logEvent({
      eventId: input.event.id,
      actor: { type: "volunteer", id: input.volunteerId },
      action: "question.answer_changed",
      entityType: "EventQuestion",
      entityId: c.questionId,
      changes: answerChangeLog(c),
    })
  }
  try {
    const dueIds = await queueAnswerChangeNotifications({
      event: input.event,
      volunteerId: input.volunteerId,
      volunteerName: input.volunteerName,
      changes: input.changes,
      changeId: randomUUID(),
    }, now)
    deliverAfterResponse(dueIds)
  } catch (e) {
    reportError("answers.notify")(e)
  }
}
