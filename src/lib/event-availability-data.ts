// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { isValidTimeZone } from "./time-zone"
import { COLLECTION_CLOSED_ERROR, DEADLINE_PASSED_ERROR, answersOpen } from "./event-availability-text"
import type { Tx } from "./registration-capacity"
import { linkToken } from "./token-vault"
import { generateToken } from "./utils"
import {
  applySubmission,
  availabilityDates,
  availabilityMergeAction,
  type AvailabilityMergeAction,
  type AvailabilityErrorAt,
  type DayAnswerInput,
  type ResolvedDay,
} from "./event-availability"

/**
 * Reads and writes of the dated availability (#1146, lot A, rules in src/lib/event-availability.ts).
 * Server only; the link, the option and the sending are in src/lib/event-availability-server.ts.
 *
 * Locking: an answer is written under the person's Volunteer row lock (FOR UPDATE), the same lock
 * an erasure, a merge and every assignment of the workload protection take (src/lib/workload-guard.ts),
 * so an answer never lands on a record erased or merged meanwhile, and a later publication that
 * locks the same rows reads a stable answer.
 */

export type AvailabilityAuthor = "volunteer" | "admin"

export type StoredDay = { date: string; ranges: { startTime: string; endTime: string; startsAt: Date; endsAt: Date }[] }

export type StoredAvailability = {
  revision: number
  answeredAt: Date | null
  answeredBy: string | null
  reviewNeededAt: Date | null
  reviewReason: string | null
  days: StoredDay[]
}

const DAY_SELECT = {
  date: true,
  ranges: { select: { startTime: true, endTime: true, startsAt: true, endsAt: true }, orderBy: { startsAt: "asc" as const } },
} as const

const toDay = (d: { date: Date; ranges: StoredDay["ranges"] }): StoredDay => ({ date: d.date.toISOString().slice(0, 10), ranges: d.ranges })

/** The person's answer on the event, dates in order, or null when they were never asked or never answered. */
export async function readAvailability(tx: Pick<Tx, "availabilityRequest">, eventId: string, volunteerId: string): Promise<StoredAvailability | null> {
  const request = await tx.availabilityRequest.findUnique({
    where: { eventId_volunteerId: { eventId, volunteerId } },
    select: { revision: true, answeredAt: true, answeredBy: true, reviewNeededAt: true, reviewReason: true, days: { select: DAY_SELECT, orderBy: { date: "asc" } } },
  })
  if (!request) return null
  return { ...request, days: request.days.map(toDay) }
}

export type SaveAvailabilityResult =
  | { ok: true; revision: number; days: ResolvedDay[] }
  | { ok: false; status: 404 | 409 | 400; error: string; at?: AvailabilityErrorAt }

const NOT_FOUND = { ok: false as const, status: 404 as const, error: "Personne ou événement introuvable." }

/**
 * Saves the dates of `days` for the person (each one replaces what that date said; the other dates
 * stay as they were), in the caller's transaction. Refused without writing anything when the event
 * does not collect availability, its zone is unknown (fail closed: no range is resolved in a guessed
 * zone), the person is not an active member of the event's organisation (erased, merged, inactive),
 * a date is outside the event, a time does not exist once that date, or two ranges share time.
 *
 * From the person's link (`by: "volunteer"`, `tokenHash` given): the link must still be the
 * request's, re-read under the locks (a link revoked or renewed meanwhile answers 404), and the
 * deadline must not be past (owner decision: read-only after it). An organiser's correction
 * (`by: "admin"`) is not bound by the deadline, and clears a review flag.
 *
 * Locks: the event row FOR SHARE (turning collection off takes it FOR UPDATE, so an answer and a
 * revocation never interleave), then the person's Volunteer row FOR UPDATE.
 */
export async function saveAvailabilityAnswers(tx: Tx, input: { eventId: string; volunteerId: string; days: DayAnswerInput[]; by: AvailabilityAuthor; tokenHash?: string; now?: Date }): Promise<SaveAvailabilityResult> {
  const { eventId, volunteerId, days, by } = input
  const now = input.now ?? new Date()
  const eventLock = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Event" WHERE id = ${eventId} FOR SHARE`
  if (eventLock.length === 0) return NOT_FOUND
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Volunteer" WHERE id = ${volunteerId} FOR UPDATE`
  if (locked.length === 0) return NOT_FOUND
  // One query at a time: a transaction's connection runs them in order anyway.
  const event = await tx.event.findUnique({ where: { id: eventId }, select: { organizationId: true, startDate: true, endDate: true, availabilityEnabled: true, availabilityTimeZone: true, availabilityDeadline: true } })
  const volunteer = await tx.volunteer.findUnique({ where: { id: volunteerId }, select: { organizationId: true, active: true, erasedAt: true, mergedIntoId: true } })
  if (!event || !volunteer || volunteer.organizationId !== event.organizationId) return NOT_FOUND
  if (!volunteer.active || volunteer.erasedAt || volunteer.mergedIntoId) return NOT_FOUND
  if (by === "volunteer") {
    if (!input.tokenHash) return NOT_FOUND
    const holder = await tx.availabilityRequest.findFirst({ where: { eventId, volunteerId, tokenHash: input.tokenHash }, select: { id: true } })
    if (!holder) return NOT_FOUND
  }
  if (!event.availabilityEnabled) return { ok: false, status: 409, error: COLLECTION_CLOSED_ERROR }
  if (by === "volunteer" && !answersOpen(event.availabilityDeadline, now)) return { ok: false, status: 409, error: DEADLINE_PASSED_ERROR }
  const timeZone = event.availabilityTimeZone
  if (!timeZone || !isValidTimeZone(timeZone)) return { ok: false, status: 409, error: "Le fuseau horaire des disponibilités de cet événement est inconnu." }

  const existing = await readAvailability(tx, eventId, volunteerId)
  const applied = applySubmission(days, existing?.days ?? [], availabilityDates(event.startDate, event.endDate), timeZone)
  if (!applied.ok) return { ok: false, status: 400, error: applied.error, at: applied.at }

  const request = await tx.availabilityRequest.upsert({
    where: { eventId_volunteerId: { eventId, volunteerId } },
    create: { eventId, volunteerId, revision: 1, answeredAt: now, answeredBy: by },
    update: { revision: { increment: 1 }, answeredAt: now, answeredBy: by, ...(by === "admin" ? { reviewNeededAt: null, reviewReason: null } : {}) },
    select: { id: true, revision: true },
  })
  const dates = applied.value.submitted.map((d) => new Date(`${d.date}T00:00:00Z`))
  await tx.availabilityDay.deleteMany({ where: { requestId: request.id, date: { in: dates } } })
  for (const day of applied.value.submitted) {
    await tx.availabilityDay.create({
      data: {
        requestId: request.id,
        eventId,
        date: new Date(`${day.date}T00:00:00Z`),
        ranges: { create: day.ranges.map((r) => ({ eventId, startTime: r.startTime, endTime: r.endTime, startsAt: r.startsAt, endsAt: r.endsAt })) },
      },
    })
  }
  return { ok: true, revision: request.revision, days: applied.value.all }
}

/**
 * A member merge (#600), in its transaction with both Volunteer rows locked: the absorbed record's
 * answers, event by event, following `availabilityMergeAction`. Returns the actions taken, for the
 * merge's report.
 */
export async function mergeAvailability(tx: Tx, keepId: string, absorbId: string, now: Date = new Date()): Promise<{ eventId: string; action: AvailabilityMergeAction }[]> {
  const select = { id: true, eventId: true, tokenHash: true, days: { select: DAY_SELECT } } as const
  const absorbed = await tx.availabilityRequest.findMany({ where: { volunteerId: absorbId }, select })
  const out: { eventId: string; action: AvailabilityMergeAction }[] = []
  for (const a of absorbed) {
    const kept = await tx.availabilityRequest.findUnique({ where: { eventId_volunteerId: { eventId: a.eventId, volunteerId: keepId } }, select })
    const action = availabilityMergeAction(kept ? { days: kept.days.map(toDay) } : null, { days: a.days.map(toDay) })
    if (action === "move") {
      if (kept) await tx.availabilityRequest.delete({ where: { id: kept.id } })
      // A link emailed to the absorbed record's (possibly wrong) address stops working (#600): a new
      // secret, sent to nobody until an organiser asks again.
      await tx.availabilityRequest.update({ where: { id: a.id }, data: { volunteerId: keepId, ...(a.tokenHash ? linkToken.data(generateToken()) : {}) } })
    } else {
      await tx.availabilityRequest.delete({ where: { id: a.id } })
      if (action === "keep_review" && kept) await tx.availabilityRequest.update({ where: { id: kept.id }, data: { reviewNeededAt: now, reviewReason: "merge" } })
    }
    out.push({ eventId: a.eventId, action })
  }
  return out
}
