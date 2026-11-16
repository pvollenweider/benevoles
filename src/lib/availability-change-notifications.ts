// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "./prisma"
import { digestDelayMs, queueDigestItem } from "./notifications/digest"
import type { AvailabilityChangeItem } from "./notifications/templates/availability-changed"
import { spokenShift } from "./spoken-time"
import type { Mission } from "./availability-correction"

/**
 * The organisers' email when a person with a published mission corrects their availability
 * (#1146, lot C; owner decision of 2026-10-30): to the organisation's active owners and organisers,
 * never sector leaders; one email per event and recipient, 10 minutes after the last change, each
 * person once (their changes in a row merged, the missions outside their answer united). Queued
 * after the answer's commit, as the answer-change emails (#984); the « à revoir » flag is written in
 * the answer's own transaction.
 */
export const AVAILABILITY_CHANGE_DIGEST_DELAY_MS = 10 * 60 * 1000

export const availabilityChangeGroupKey = (eventId: string, email: string) => `availability_changed:${eventId}:${email.toLowerCase()}`

/** A person's changes in a row: one line, the missions outside both kept. */
export function mergeAvailabilityChangeItems(previous: AvailabilityChangeItem, next: AvailabilityChangeItem): AvailabilityChangeItem {
  return { volunteerName: next.volunteerName, outside: [...new Set([...previous.outside, ...next.outside])] }
}

const day = (d: Date | string) => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10))

export function availabilityChangeItem(volunteerName: string, outside: readonly Mission[]): AvailabilityChangeItem {
  return { volunteerName, outside: outside.map((m) => spokenShift({ roleName: m.name, label: null, date: day(m.date), startTime: m.startTime, endTime: m.endTime })) }
}

export async function queueAvailabilityChangeNotifications(input: {
  event: { id: string; title: string; organizationId: string }
  volunteerId: string
  volunteerName: string
  outside: readonly Mission[]
  /** Unique per save: a later change is never mistaken for one already sent. */
  changeId: string
}, now: Date = new Date()): Promise<string[]> {
  const admins = await prisma.adminUser.findMany({
    where: { organizationId: input.event.organizationId, isActive: true, role: { in: ["admin", "organizer"] } },
    select: { email: true, name: true },
  })
  const delayMs = digestDelayMs(AVAILABILITY_CHANGE_DIGEST_DELAY_MS)
  const item = availabilityChangeItem(input.volunteerName, input.outside)
  const dueIds: string[] = []
  for (const a of admins) {
    const dueId = await queueDigestItem({
      kind: "availability_changed",
      groupKey: availabilityChangeGroupKey(input.event.id, a.email),
      recipient: { email: a.email, name: a.name },
      organizationId: input.event.organizationId,
      base: { eventId: input.event.id, eventTitle: input.event.title },
      item,
      itemKey: input.changeId,
      merge: { key: `volunteer:${input.volunteerId}`, combine: mergeAvailabilityChangeItems },
      now,
      delayMs,
    })
    if (dueId) dueIds.push(dueId)
  }
  return dueIds
}
