// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"
import { registrationToken } from "@/lib/token-vault"
import { pickShiftInfo } from "@/lib/shift-info"
import { openPayload, sealPayload } from "./outbox"
import { digestDelayMs } from "./digest-items"
import type { NotificationPayload } from "./types"

/**
 * The confirmation of shifts a volunteer adds to an event where they already hold a place or a
 * request (#1191), grouped: several sign-ups in a row (one shift at a time, from « Mes
 * inscriptions » or the public page) make one `registration_confirmation` listing every shift
 * added, instead of one email each, the last ones dropped by the per-address cap of public emails
 * (src/lib/notifications/send-limits.ts). It waits ADDED_SHIFTS_DELAY_MS after the last sign-up;
 * each sign-up before it leaves joins it and pushes it back.
 *
 * A first sign-up on the event is never grouped (`groupsConfirmation`): its confirmation carries
 * the personal link and leaves at once, as before. What the grouped email lists is read again when
 * it leaves, like the organiser's « added » email (#916): only the places still held, a link from
 * one of them, and nothing left means no email. Same template as any confirmation.
 */
export const ADDED_SHIFTS_DELAY_MS = 5 * 60 * 1000

const KIND = "registration_confirmation" as const

/** What the outbox row stores; the shifts and the link are read at delivery. */
export type AddedShiftsData = {
  /** Marks the grouped row: an ordinary confirmation carries its shifts and link already. */
  addedShifts: true
  volunteerName: string
  eventTitle: string
  orgSlug: string
  confirmationMessage?: string
  cancelNotice?: string | null
  eventId: string
  registrationIds: string[]
}

/**
 * Whether this sign-up's confirmation joins the grouped one: only when the volunteer already held
 * a place or a request on the event before it (their confirmation or « Demande reçue » carried the
 * personal link). A first sign-up, or one after only waitlist entries (whose email has no personal
 * link), is confirmed at once. Pure.
 */
export function groupsConfirmation(heldBefore: readonly { status: string }[]): boolean {
  return heldBefore.some((r) => r.status === "active" || r.status === "requested")
}

const keyPrefix = (eventId: string, volunteerId: string) => `${KIND}:added:${eventId}:${volunteerId}:`

type OutboxTx = {
  notificationOutbox: {
    findFirst(args: { where: { status: string; attempts: number; dedupeKey: { startsWith: string } }; select: { id: true; payload: true } }): Promise<{ id: string; payload: Prisma.JsonValue } | null>
    updateMany(args: { where: { id: string; status: string; attempts: number }; data: { payload: Prisma.InputJsonValue; nextAttemptAt: Date } }): Promise<{ count: number }>
    create(args: { data: { payload: Prisma.InputJsonValue; dedupeKey: string; organizationId: string; nextAttemptAt: Date }; select: { id: true } }): Promise<{ id: string }>
  }
}

/**
 * Joins the pending grouped confirmation of this volunteer for this event, or starts one. Inside
 * the sign-up's transaction, which holds the member's lock (lockSignupVolunteer): two sign-ups of
 * one person find each other's row. Returns the row's id when it is due at once (no delay,
 * DIGEST_DELAY_SECONDS=0) for an immediate delivery; null otherwise.
 */
export async function queueAddedShiftsConfirmation(tx: OutboxTx, input: {
  volunteerId: string
  organizationId: string
  recipient: { email: string; name: string }
  data: Omit<AddedShiftsData, "addedShifts" | "registrationIds">
  registrationIds: string[]
  now: Date
  delayMs?: number
}): Promise<string | null> {
  if (input.registrationIds.length === 0) return null
  const delayMs = input.delayMs ?? digestDelayMs(ADDED_SHIFTS_DELAY_MS)
  const sendAt = new Date(input.now.getTime() + delayMs)
  const due = delayMs <= 0
  const prefix = keyPrefix(input.data.eventId, input.volunteerId)
  const base = { kind: KIND, recipient: input.recipient, volunteerId: input.volunteerId, organizationId: input.organizationId }
  const pending = await tx.notificationOutbox.findFirst({
    where: { status: "pending", attempts: 0, dedupeKey: { startsWith: prefix } },
    select: { id: true, payload: true },
  })
  if (pending) {
    const previous = openPayload(pending.payload).data as AddedShiftsData
    const registrationIds = [...new Set([...previous.registrationIds, ...input.registrationIds])]
    // Only while it still waits: a delivery may have claimed it since the read (the cron takes no
    // member lock) and sends what it read; then these shifts start an email of their own.
    const { count } = await tx.notificationOutbox.updateMany({
      where: { id: pending.id, status: "pending", attempts: 0 },
      data: { payload: sealPayload({ ...base, data: { ...input.data, addedShifts: true, registrationIds } }), nextAttemptAt: sendAt },
    })
    if (count > 0) return due ? pending.id : null
  }
  const row = await tx.notificationOutbox.create({
    data: {
      payload: sealPayload({ ...base, data: { ...input.data, addedShifts: true, registrationIds: input.registrationIds } }),
      dedupeKey: `${prefix}${input.registrationIds[0]}`,
      organizationId: input.organizationId,
      nextAttemptAt: sendAt,
    },
    select: { id: true },
  })
  return due ? row.id : null
}

export function isAddedShiftsConfirmation(payload: NotificationPayload): boolean {
  return payload.kind === KIND && (payload.data as Partial<AddedShiftsData> | undefined)?.addedShifts === true
}

/**
 * At delivery: the places still held among the grouped registrations of this volunteer on this
 * event, in time order, as a sign-up's confirmation lists them, and the link of one of them (a
 * cancelled registration's link no longer opens the personal page). Null when none is left: the
 * email is then cancelled rather than sent empty.
 */
export async function resolveAddedShiftsConfirmation(payload: NotificationPayload): Promise<NotificationPayload | null> {
  const d = payload.data as AddedShiftsData
  const regs = await prisma.registration.findMany({
    where: { id: { in: d.registrationIds }, eventId: d.eventId, volunteerId: payload.volunteerId ?? undefined, status: "active" },
    select: {
      ...registrationToken.select,
      shift: { select: { label: true, roleName: true, date: true, startTime: true, endTime: true, locationDetails: true, contactName: true, contactPhone: true, instructions: true, latitude: true, longitude: true } },
      event: { select: { latitude: true, longitude: true } },
    },
  })
  if (regs.length === 0 || !payload.volunteerId) return null
  const sorted = [...regs].sort((a, b) => a.shift.date.getTime() - b.shift.date.getTime() || a.shift.startTime.localeCompare(b.shift.startTime))
  return {
    ...payload,
    data: {
      volunteerName: d.volunteerName,
      eventTitle: d.eventTitle,
      orgSlug: d.orgSlug,
      confirmationMessage: d.confirmationMessage,
      ...(d.cancelNotice ? { cancelNotice: d.cancelNotice } : {}),
      shifts: sorted.map((r) => ({
        label: r.shift.label,
        roleName: r.shift.roleName,
        date: r.shift.date.toLocaleDateString("fr-FR"),
        startTime: r.shift.startTime,
        endTime: r.shift.endTime,
        ...pickShiftInfo(r.shift, r.event),
      })),
      editToken: registrationToken.reveal(sorted[0]),
    },
  }
}
