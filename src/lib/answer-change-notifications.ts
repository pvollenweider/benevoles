// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * The organisers' email when a volunteer changes their answers from the personal page (#984),
 * grouped like withdrawals (#869): one email per event and recipient a few minutes after the last
 * change, a volunteer's changes in a row merged into one line with the final answer.
 *
 * Gated by the organisation's « Prévenir les administrateurs à chaque inscription » setting
 * (`signupAdminEmail`, #381): the answers belong to the sign-up, and an organisation that does not
 * want an email per sign-up does not want one per answer either.
 */
import { prisma } from "./prisma"
import { parseNotificationSettings } from "./notification-settings"
import { digestDelayMs, queueDigestItem } from "./notifications/digest"
import {
  ANSWER_CHANGE_DIGEST_DELAY_MS, answerChangeAudience, answerChangeGroupKey, answerChangeItem, answerChangeMergeKey,
  mergeAnswerChangeItems, type AnswerChange,
} from "./answer-changes"

export async function queueAnswerChangeNotifications(input: {
  event: { id: string; title: string; organizationId: string }
  volunteerId: string
  volunteerName: string
  changes: AnswerChange[]
  /** Unique per request: a later change is never mistaken for one already sent. */
  changeId: string
}, now: Date = new Date()): Promise<string[]> {
  if (input.changes.length === 0) return []
  const { event } = input
  const org = await prisma.organization.findUnique({ where: { id: event.organizationId }, select: { notificationSettings: true } })
  if (!parseNotificationSettings(org?.notificationSettings).signupAdminEmail) return []

  const admins = await prisma.adminUser.findMany({
    where: { organizationId: event.organizationId, isActive: true },
    select: { email: true, name: true },
  })
  // Read off process.env, as the withdrawal emails do: importing this module must not force the
  // whole env schema check on a route test.
  const audience = answerChangeAudience(input.changes, { admins, fallbackEmail: process.env.ADMIN_NOTIFICATION_EMAIL })

  const delayMs = digestDelayMs(ANSWER_CHANGE_DIGEST_DELAY_MS)
  const dueIds: string[] = []
  for (const { recipient, changes } of audience) {
    const dueId = await queueDigestItem({
      kind: "answers_changed",
      groupKey: answerChangeGroupKey(event.id, recipient.email),
      recipient: { email: recipient.email, name: recipient.name },
      organizationId: event.organizationId,
      base: { eventId: event.id, eventTitle: event.title },
      item: answerChangeItem(input.volunteerName, changes),
      itemKey: input.changeId,
      merge: { key: answerChangeMergeKey(input.volunteerId), combine: mergeAnswerChangeItems },
      now,
      delayMs,
    })
    if (dueId) dueIds.push(dueId)
  }
  return dueIds
}
