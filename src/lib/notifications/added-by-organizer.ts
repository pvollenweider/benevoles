// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"
import { LIVE_STATUSES, type Tx } from "@/lib/registration-capacity"
import { registrationToken } from "@/lib/token-vault"
import { openPayload, sealPayload } from "./outbox"
import type { NotificationPayload } from "./types"

/**
 * The email telling a volunteer that an organizer placed them (#916), grouped: an organizer who
 * adds 15 shifts for one person sends one email listing the 15, not 15 emails. The email waits
 * ADDED_BY_ORGANIZER_DELAY_MS after the last add for that person on that event; each add before it
 * leaves joins it and pushes it back. What it lists is read again when it leaves, so a shift
 * removed meanwhile is not announced, and nothing left means no email.
 */
export const ADDED_BY_ORGANIZER_DELAY_MS = 10 * 60 * 1000

const KIND = "registration_added_by_organizer" as const

/** What the outbox row stores; the shifts and the link are read at delivery. */
export type AddedByOrganizerData = {
  volunteerName: string
  eventTitle: string
  orgSlug: string
  organizationName: string
  organizerName: string | null
  registrationIds: string[]
}

const keyPrefix = (eventId: string, volunteerId: string) => `${KIND}:${eventId}:${volunteerId}:`

/** The part of the add's transaction used here, typed like OutboxDb so a scoped client fits. */
type OutboxTx = Pick<Tx, "$queryRaw"> & {
  notificationOutbox: {
    findFirst(args: { where: { status: string; attempts: number; dedupeKey: { startsWith: string } }; select: { id: true; payload: true } }): Promise<{ id: string; payload: Prisma.JsonValue } | null>
    update(args: { where: { id: string }; data: { payload: Prisma.InputJsonValue; nextAttemptAt: Date } }): Promise<unknown>
    create(args: { data: { payload: Prisma.InputJsonValue; dedupeKey: string; organizationId: string; nextAttemptAt: Date } }): Promise<unknown>
  }
}

/** Joins the pending email of this person for this event, or starts one. Inside the add's transaction. */
export async function queueAddedByOrganizer(tx: OutboxTx, input: {
  eventId: string
  volunteerId: string
  registrationId: string
  organizationId: string
  recipient: { email: string; name: string }
  data: Omit<AddedByOrganizerData, "registrationIds">
  now: Date
}): Promise<void> {
  // Two adds for the same person at the same moment must find each other's row, not start two.
  await tx.$queryRaw`SELECT id FROM "Volunteer" WHERE id = ${input.volunteerId} FOR UPDATE`
  const sendAt = new Date(input.now.getTime() + ADDED_BY_ORGANIZER_DELAY_MS)
  const prefix = keyPrefix(input.eventId, input.volunteerId)
  // Still waiting and never tried: a row already sending or retrying is left as it is.
  const pending = await tx.notificationOutbox.findFirst({
    where: { status: "pending", attempts: 0, dedupeKey: { startsWith: prefix } },
    select: { id: true, payload: true },
  })
  const base = { kind: KIND, recipient: input.recipient, volunteerId: input.volunteerId, organizationId: input.organizationId }
  if (pending) {
    const previous = openPayload(pending.payload).data as AddedByOrganizerData
    const registrationIds = [...new Set([...previous.registrationIds, input.registrationId])]
    await tx.notificationOutbox.update({
      where: { id: pending.id },
      data: { payload: sealPayload({ ...base, data: { ...input.data, registrationIds } }), nextAttemptAt: sendAt },
    })
    return
  }
  await tx.notificationOutbox.create({
    data: {
      payload: sealPayload({ ...base, data: { ...input.data, registrationIds: [input.registrationId] } }),
      dedupeKey: `${prefix}${input.registrationId}`,
      organizationId: input.organizationId,
      nextAttemptAt: sendAt,
    },
  })
}

/**
 * At delivery: the shifts still held among the grouped registrations, in time order, and a link
 * from one of them (a cancelled registration's link no longer opens the personal page). Null when
 * none is left: the email is then cancelled rather than sent empty.
 */
export async function resolveAddedByOrganizer(payload: NotificationPayload): Promise<NotificationPayload | null> {
  const d = payload.data as AddedByOrganizerData
  const regs = await prisma.registration.findMany({
    where: { id: { in: d.registrationIds }, status: { in: [...LIVE_STATUSES] } },
    select: { ...registrationToken.select, shift: { select: { roleName: true, label: true, date: true, startTime: true, endTime: true } } },
  })
  if (regs.length === 0) return null
  const sorted = [...regs].sort((a, b) => a.shift.date.getTime() - b.shift.date.getTime() || a.shift.startTime.localeCompare(b.shift.startTime))
  return {
    ...payload,
    data: {
      ...d,
      shifts: sorted.map((r) => ({ ...r.shift, date: r.shift.date.toISOString().slice(0, 10) })),
      editToken: registrationToken.reveal(sorted[0]),
    },
  }
}

export function isAddedByOrganizer(payload: NotificationPayload): boolean {
  return payload.kind === KIND
}
