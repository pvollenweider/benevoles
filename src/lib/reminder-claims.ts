// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Claims on the default reminders (J-2, J-1, day-of) of the hourly job. The job sends these emails
 * itself, so two calls running at the same time (a self-hosted scheduler that overlaps, a manual
 * call during the hourly one) would both read the same unmarked registrations and both write to the
 * volunteer. A call therefore marks a group before it sends, each registration in one conditional
 * statement: the database gives it to one call only. A send that fails gives the group back, so the
 * next run retries it whole, as before.
 *
 * The price is the other end of the same choice: a process that dies between the claim and the send
 * leaves the group marked, and that one reminder is not sent. The later windows of the same shift
 * are separate fields and still go out.
 *
 * Server only (Prisma): the raw client, as every scheduled job.
 */

import { prisma } from "./prisma"

export type ReminderField = "reminderJ2Sent" | "reminderJ1Sent" | "reminderDdSent"

/**
 * Marks every registration of the group as reminded at `at`, where it was not marked yet.
 * `false` when another call holds at least one of them: what this call did mark is given back, and
 * the group is left to that other call or to the next run.
 *
 * One statement per registration, so the call knows exactly which rows it marked: giving back by
 * date alone could clear the mark of another call that started in the same millisecond.
 */
export async function claimReminderGroup(ids: string[], field: ReminderField, at: Date): Promise<boolean> {
  const mine: string[] = []
  for (const id of ids) {
    const { count } = await prisma.registration.updateMany({ where: { id, [field]: null }, data: { [field]: at } })
    if (count === 0) break
    mine.push(id)
  }
  if (mine.length === ids.length) return true
  await releaseReminderGroup(mine, field)
  return false
}

/** Gives back registrations this call claimed, after a send that did not go out. */
export async function releaseReminderGroup(ids: string[], field: ReminderField): Promise<void> {
  if (ids.length === 0) return
  await prisma.registration.updateMany({ where: { id: { in: ids } }, data: { [field]: null } })
}
