// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { sameNameHints } from "./availability-assist"
import { readAnswersForFit, readAvailabilityGate } from "./availability-assist-data"
import { buildBoard, draftOptions, type Board, type BoardDraft, type BoardPerson, type BoardShift, type DraftOption } from "./draft-board"
import type { OrgScopedPrisma } from "./prisma-org"
import { LIVE_STATUSES, OCCUPYING_STATUSES } from "./registration-capacity"
import { reservedRoles } from "./role-reservation"
import { roleLimits } from "./role-limit"
import { orgTimeZone } from "./time-zone"
import { WORKLOAD_EVENT_SELECT, workloadGateOf } from "./workload-guard"
import { parsePersonalLimits } from "./workload-personal"

/**
 * Reads of the review screen « Affectations en brouillon » (#1146, lot C), server only, through the
 * organisation's scoped client; the rules are in src/lib/draft-board.ts. Null when the event is not
 * this organisation's or does not use dated availability.
 */

type Db = OrgScopedPrisma

const SHIFT_SELECT = {
  id: true, eventId: true, roleName: true, label: true, date: true, startTime: true, endTime: true, status: true, capacity: true, maxPerVolunteer: true,
  overlapAllowed: true, assignedOnly: true, requiresApproval: true, minAge: true, reservedTags: true, locationDetails: true, latitude: true, longitude: true,
  sectorId: true, mealOnTheGo: true, placeId: true, place: { select: { name: true } },
} as const

type ShiftRow = Omit<BoardShift, "occupied" | "placeName"> & { date: Date; place: { name: string } | null }

const toShift = (s: ShiftRow, occupied: number): BoardShift => {
  const { place, ...rest } = s
  return { ...rest, placeName: place?.name ?? null, occupied }
}

/** Everything the board reads, for the whole event or one person. */
async function loadContext(db: Db, eventId: string, scope: "event" | "all", onlyVolunteerId?: string) {
  const event = await db.event.findFirst({ where: { id: eventId }, select: { id: true, organizationId: true, availabilityEnabled: true, availabilityAdoptedAt: true, organization: { select: { timeZone: true } }, ...WORKLOAD_EVENT_SELECT } })
  if (!event) return null
  const availability = await readAvailabilityGate(db, eventId)
  if (!availability.inUse) return null

  const drafts: BoardDraft[] = await db.draftAssignment.findMany({
    where: { eventId, status: "draft", ...(onlyVolunteerId ? { volunteerId: onlyVolunteerId } : {}) },
    select: { id: true, revision: true, shiftId: true, volunteerId: true, source: true, shiftTerms: true, availabilityStamp: true, ackKey: true, locked: true },
    orderBy: { id: "asc" },
  })
  const shiftRows = await db.shift.findMany({ where: { eventId, OR: [{ status: { not: "cancelled" } }, { id: { in: drafts.map((d) => d.shiftId) } }] }, select: SHIFT_SELECT }) as unknown as ShiftRow[]
  const occupied = await db.registration.groupBy({ by: ["shiftId"], where: { eventId, status: { in: [...OCCUPYING_STATUSES] } }, _count: { _all: true } })
  const occupiedOf = new Map(occupied.map((o) => [o.shiftId, o._count._all]))
  const shifts = new Map(shiftRows.map((s) => [s.id, toShift(s, occupiedOf.get(s.id) ?? 0)]))
  const regs = await db.registration.findMany({
    where: { eventId, status: { in: [...LIVE_STATUSES] }, ...(onlyVolunteerId ? { volunteerId: onlyVolunteerId } : {}) },
    select: { id: true, volunteerId: true, status: true, shift: { select: SHIFT_SELECT } },
  }) as unknown as { id: string; volunteerId: string; status: string; shift: ShiftRow }[]
  const asked = onlyVolunteerId ? [] : await db.availabilityRequest.findMany({ where: { eventId }, select: { volunteerId: true } })

  const related = onlyVolunteerId ? [onlyVolunteerId] : [...new Set([...asked.map((a) => a.volunteerId), ...regs.filter((r) => r.status === "active" || r.status === "requested").map((r) => r.volunteerId), ...drafts.map((d) => d.volunteerId)])]
  const people = await db.volunteer.findMany({
    where: scope === "all" && !onlyVolunteerId ? { OR: [{ active: true, erasedAt: null, mergedIntoId: null }, { id: { in: related } }] } : { id: { in: related } },
    select: { id: true, firstName: true, lastName: true, email: true, organizationId: true, active: true, erasedAt: true, mergedIntoId: true, birthDate: true, tags: true },
  })
  const ids = people.map((p) => p.id)
  const [answers, requests, limitsRows] = await Promise.all([
    readAnswersForFit(db, eventId, ids),
    db.availabilityRequest.findMany({ where: { eventId, volunteerId: { in: ids } }, select: { volunteerId: true, reviewReason: true } }),
    db.eventVolunteerLimit.findMany({ where: { eventId, volunteerId: { in: ids } }, select: { volunteerId: true, values: true } }),
  ])
  const reviewOf = new Map(requests.map((r) => [r.volunteerId, r.reviewReason]))
  const personalOf = new Map(limitsRows.map((l) => [l.volunteerId, parsePersonalLimits(l.values)]))
  const hints = sameNameHints(people)
  const heldOf = new Map<string, BoardPerson["held"]>()
  for (const r of regs) heldOf.set(r.volunteerId, [...(heldOf.get(r.volunteerId) ?? []), { id: r.id, status: r.status, shift: toShift(r.shift, 0) }])
  const boardPeople: BoardPerson[] = people.map((p) => ({
    ...p, held: heldOf.get(p.id) ?? [], answer: answers.get(p.id) ?? null,
    sameNameHint: hints.get(p.id) ?? null, reviewReason: reviewOf.get(p.id) ?? null, personal: personalOf.get(p.id) ?? null,
  }))
  const roleRows = [...shifts.values()].filter((s) => s.status !== "cancelled")
  return {
    eventId, organizationId: event.organizationId, timeZone: orgTimeZone(event.organization),
    availability: { timeZone: availability.timeZone, dates: availability.dates },
    gate: workloadGateOf(event), collecting: event.availabilityEnabled,
    shifts, people: boardPeople, drafts,
    reserved: reservedRoles(roleRows), limits: roleLimits(roleRows),
  }
}

export type DraftBoardData = Board & { collecting: boolean; protection: "off" | "on" | "incomplete"; scope: "event" | "all" }

/** The board of the event: « event » the people asked, with a mission or a draft; « all » every active member too. */
export async function loadDraftBoard(db: Db, eventId: string, scope: "event" | "all", now: Date = new Date()): Promise<DraftBoardData | null> {
  const ctx = await loadContext(db, eventId, scope)
  if (!ctx) return null
  const board = buildBoard({ ...ctx, now })
  return { ...board, collecting: ctx.collecting, protection: ctx.gate.kind, scope }
}

/** The shifts of one date for one person, for the cell's « Ajouter une affectation ». */
export async function loadDraftOptions(db: Db, eventId: string, volunteerId: string, date: string): Promise<{ person: { firstName: string; lastName: string }; options: DraftOption[] } | null> {
  const ctx = await loadContext(db, eventId, "event", volunteerId)
  if (!ctx) return null
  const person = ctx.people.find((p) => p.id === volunteerId)
  if (!person) return null
  // Everyone's pending drafts per shift (« 2 brouillons déjà prévus »): the context read only this person's.
  const counted = await db.draftAssignment.groupBy({ by: ["shiftId"], where: { eventId, status: "draft" }, _count: { _all: true } })
  const draftsOn = new Map(counted.map((c) => [c.shiftId, c._count._all]))
  const options = draftOptions({ eventId, date, person, drafts: ctx.drafts, shifts: [...ctx.shifts.values()], availability: ctx.availability, gate: ctx.gate, draftsOn })
  return { person: { firstName: person.firstName, lastName: person.lastName }, options }
}
