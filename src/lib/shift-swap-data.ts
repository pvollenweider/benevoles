// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "./prisma"
import type { OrgScopedPrisma } from "./prisma-org"
import { canAdoptBeta } from "./beta-access"
import { swapsShipped } from "./shift-swap-gate"
import { LIVE_STATUSES } from "./registration-capacity"
import { assignedOnlyRoles } from "./role-assignment"
import { reservedRoles } from "./role-reservation"
import { roleLimits } from "./role-limit"
import { orgTimeZone } from "./time-zone"
import { rosterDisplayName } from "./shift-roster-text"
import type { LogActor } from "./event-log"
import { endSwapsIn } from "./shift-swap-server"
import { needsSwapApproval, swapDeadline, swapRefusalMessage, SWAP_LIVE_STATUSES, type SwapEndReason, type SwapStatus } from "./shift-swaps"
import { buildVolunteerSwapView, shiftView, type SwapShiftView, type ViewRegistration, type ViewRequest, type ViewShift, type VolunteerSwapView } from "./shift-swap-view"

/**
 * Reads and settings of shift swaps (#1174), server only: the event option and its organisation
 * default, what a volunteer's personal page shows, and the organisers' list. The commands are in
 * src/lib/shift-swap-server.ts.
 */

type Tx = Prisma.TransactionClient

/**
 * The option a NEW event starts with: the organisation's default, only while the capability can
 * be adopted (#1168). Changing the default never touches existing events.
 */
export async function newEventShiftSwapsEnabled(organizationId: string, shiftSwapsDefault: boolean | null | undefined): Promise<boolean> {
  return shiftSwapsDefault ? canAdoptBeta(organizationId, "shiftSwaps") : false
}

export type SwapOptionResult =
  | { ok: true; shiftSwapsEnabled: boolean; shiftSwapsApproval: boolean; changes: Record<string, { from: boolean; to: boolean }> }
  | { ok: false; status: 403 | 404 | 409; error: string; openCount?: number }

/** Asked before switching swaps off while requests are under way. */
export function swapsOffConfirmText(openCount: number): string {
  return `${openCount} demande${openCount > 1 ? "s" : ""} d'échange en cours ${openCount > 1 ? "seront annulées" : "sera annulée"} et les bénévoles concernés prévenus par email.`
}

export const SWAPS_NOT_ADOPTABLE = "Les échanges de créneaux ne peuvent pas être activés pour cette organisation."

/**
 * « Autoriser les demandes d'échange de créneaux » and « Valider chaque échange », under a row lock
 * on the event. Turning swaps on is a new adoption (the beta gate, read in the transaction); an
 * event that has them keeps them after an opt-out (BE06). Turning them off ends every live request
 * as cancelled by the organisation, in the same transaction, the people told by email (E19: a
 * confirmation waiting on a request's lock either applied before, or finds it cancelled). Turning
 * them back on revives nothing.
 */
export async function setShiftSwapsOption(db: OrgScopedPrisma, organizationId: string, eventId: string, wanted: { enabled?: boolean; approval?: boolean; confirm?: boolean }, actor: LogActor): Promise<SwapOptionResult> {
  return db.$transaction(async (raw) => {
    const tx = raw as unknown as Tx
    const rows = await tx.$queryRaw<{ id: string; shiftSwapsEnabled: boolean; shiftSwapsApproval: boolean }[]>`SELECT "id", "shiftSwapsEnabled", "shiftSwapsApproval" FROM "Event" WHERE "id" = ${eventId} AND "organizationId" = ${organizationId} FOR UPDATE`
    const event = rows[0]
    if (!event) return { ok: false as const, status: 404 as const, error: "Non trouvé" }
    const enabled = wanted.enabled ?? event.shiftSwapsEnabled
    const approval = wanted.approval ?? event.shiftSwapsApproval
    if (enabled && !event.shiftSwapsEnabled && !(swapsShipped() && (await canAdoptBeta(organizationId, "shiftSwaps", tx)))) {
      return { ok: false as const, status: 403 as const, error: SWAPS_NOT_ADOPTABLE }
    }
    // Live requests would be cancelled and their people emailed: only once the organiser saw how
    // many, counted now under the lock (a request may have come since the page loaded).
    if (!enabled && event.shiftSwapsEnabled && !wanted.confirm) {
      const openCount = await tx.shiftSwapRequest.count({ where: { eventId, status: { in: [...SWAP_LIVE_STATUSES] } } })
      if (openCount > 0) return { ok: false as const, status: 409 as const, error: swapsOffConfirmText(openCount), openCount }
    }
    const changes: Record<string, { from: boolean; to: boolean }> = {}
    if (enabled !== event.shiftSwapsEnabled) changes.shiftSwapsEnabled = { from: event.shiftSwapsEnabled, to: enabled }
    if (approval !== event.shiftSwapsApproval) changes.shiftSwapsApproval = { from: event.shiftSwapsApproval, to: approval }
    if (Object.keys(changes).length > 0) {
      await tx.event.update({ where: { id: eventId }, data: { shiftSwapsEnabled: enabled, shiftSwapsApproval: approval } })
    }
    if (!enabled && event.shiftSwapsEnabled) await endSwapsIn(tx, { eventId }, "option_off", actor)
    return { ok: true as const, shiftSwapsEnabled: enabled, shiftSwapsApproval: approval, changes }
  })
}

// ── Reads ───────────────────────────────────────────────────────────────────

const SHIFT_SELECT = {
  id: true, eventId: true, roleName: true, label: true, status: true, date: true, startTime: true, endTime: true,
  overlapAllowed: true, assignedOnly: true, requiresApproval: true, minAge: true, reservedTags: true,
  locationDetails: true, latitude: true, longitude: true, sectorId: true, instructions: true, maxPerVolunteer: true,
} as const

const REQUEST_SELECT = {
  id: true, status: true, registrationId: true, volunteerId: true, shiftId: true, counterRegistrationId: true, counterVolunteerId: true,
  counterShiftId: true, revision: true, declinedVolunteerIds: true, expiresAt: true, endReason: true, updatedAt: true,
} as const

const PERSON_SELECT = { id: true, active: true, erasedAt: true, mergedIntoId: true, birthDate: true, tags: true } as const

/**
 * What the personal page of `volunteerId` shows on `eventId` (see buildVolunteerSwapView). Reads
 * the event's live requests and this person's own; never another person's identity.
 */
export async function loadVolunteerSwapView(eventId: string, volunteerId: string, now: Date = new Date()): Promise<VolunteerSwapView> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { shiftSwapsEnabled: true, shiftSwapsApproval: true, sectorsAdoptedAt: true, cancelDeadlineDays: true, cancelDeadlineHours: true, organization: { select: { timeZone: true } } },
  })
  if (!swapsShipped()) return { enabled: false, scope: "poste", publishable: [], mine: [], offers: [], ownShifts: {} }
  const [requests, eventShifts] = await Promise.all([
    prisma.shiftSwapRequest.findMany({
      where: { eventId, OR: [{ status: { in: [...SWAP_LIVE_STATUSES] } }, { volunteerId }, { counterVolunteerId: volunteerId }] },
      select: REQUEST_SELECT,
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.shift.findMany({ where: { eventId }, select: SHIFT_SELECT }),
  ])
  const people = [...new Set([volunteerId, ...requests.filter((r) => r.status === "open").map((r) => r.volunteerId)])]
  const [persons, held] = await Promise.all([
    prisma.volunteer.findMany({ where: { id: { in: people } }, select: PERSON_SELECT }),
    prisma.registration.findMany({ where: { eventId, volunteerId: { in: people }, status: { in: [...LIVE_STATUSES] } }, select: { id: true, volunteerId: true, eventId: true, status: true, shift: { select: SHIFT_SELECT } } }),
  ])
  // The other party of my requests that have an offer, as « Jean D. » (owner decision, 2026-10-27).
  const parties = [...new Set(requests.filter((r) => r.counterVolunteerId && (r.volunteerId === volunteerId || r.counterVolunteerId === volunteerId)).map((r) => (r.volunteerId === volunteerId ? r.counterVolunteerId! : r.volunteerId)))]
  const named = parties.length ? await prisma.volunteer.findMany({ where: { id: { in: parties } }, select: { id: true, firstName: true, lastName: true } }) : []
  const byPerson = new Map<string, (ViewRegistration & { status: string })[]>()
  for (const h of held) byPerson.set(h.volunteerId, [...(byPerson.get(h.volunteerId) ?? []), h as ViewRegistration])
  const live = eventShifts.filter((s) => s.status !== "cancelled")
  return buildVolunteerSwapView({
    now,
    timeZone: orgTimeZone(event.organization),
    event,
    me: volunteerId,
    persons: new Map(persons.map((p) => [p.id, p])),
    held: byPerson,
    shifts: new Map(eventShifts.map((s) => [s.id, s as ViewShift])),
    requests: requests as ViewRequest[],
    reserved: reservedRoles(live),
    limits: roleLimits(live),
    assignedOnlyRoles: assignedOnlyRoles(live),
    names: new Map(named.map((v) => [v.id, rosterDisplayName(v.firstName, v.lastName)])),
  })
}

export type OrganiserSwap = {
  requestId: string
  status: SwapStatus
  revision: number
  deadline: string
  needsApproval: boolean
  /** `volunteerId` (#1146, lot B): each person's availability for the shift they would receive. */
  requester: { volunteerId: string; name: string; shift: SwapShiftView }
  counterpart: { volunteerId: string; name: string; shift: SwapShiftView } | null
  endMessage: string | null
  updatedAt: string
}

/**
 * The event's swap requests for its organisers (org-scoped client): those waiting for their
 * approval first, then the other live ones, then the 50 latest ended. Organisers see the names,
 * as they see every registration.
 */
export async function loadOrganiserSwaps(db: OrgScopedPrisma, eventId: string): Promise<{ shiftSwapsEnabled: boolean; shiftSwapsApproval: boolean; requests: OrganiserSwap[] } | null> {
  const event = await db.event.findFirst({
    where: { id: eventId },
    select: { shiftSwapsEnabled: true, shiftSwapsApproval: true, cancelDeadlineDays: true, cancelDeadlineHours: true, organization: { select: { timeZone: true } } },
  })
  if (!event) return null
  const [live, ended] = await Promise.all([
    db.shiftSwapRequest.findMany({ where: { eventId, status: { in: [...SWAP_LIVE_STATUSES] } }, select: REQUEST_SELECT, orderBy: { createdAt: "asc" } }),
    db.shiftSwapRequest.findMany({ where: { eventId, status: { notIn: [...SWAP_LIVE_STATUSES] } }, select: REQUEST_SELECT, orderBy: { updatedAt: "desc" }, take: 50 }),
  ])
  const all = [...live.sort((a, b) => Number(b.status === "approval") - Number(a.status === "approval")), ...ended]
  const shiftIds = [...new Set(all.flatMap((r) => [r.shiftId, ...(r.counterShiftId ? [r.counterShiftId] : [])]))]
  const people = [...new Set(all.flatMap((r) => [r.volunteerId, ...(r.counterVolunteerId ? [r.counterVolunteerId] : [])]))]
  const [shifts, volunteers] = await Promise.all([
    db.shift.findMany({ where: { id: { in: shiftIds } }, select: SHIFT_SELECT }),
    db.volunteer.findMany({ where: { id: { in: people } }, select: { id: true, firstName: true, lastName: true } }),
  ])
  const shiftById = new Map(shifts.map((s) => [s.id, s as ViewShift]))
  const nameOf = (id: string) => {
    const v = volunteers.find((x) => x.id === id)
    return v ? `${v.firstName} ${v.lastName}`.trim() || "Bénévole effacé" : "Bénévole effacé"
  }
  const timeZone = orgTimeZone(event.organization)
  const requests: OrganiserSwap[] = []
  for (const r of all) {
    const a = shiftById.get(r.shiftId)
    if (!a) continue
    const b = r.counterShiftId ? shiftById.get(r.counterShiftId) : undefined
    requests.push({
      requestId: r.id,
      status: r.status as SwapStatus,
      revision: r.revision,
      deadline: swapDeadline({ expiresAt: r.expiresAt, given: b ? [a, b] : [a], setting: event, timeZone }).toISOString(),
      needsApproval: !!b && needsSwapApproval(a, b, event),
      requester: { volunteerId: r.volunteerId, name: nameOf(r.volunteerId), shift: shiftView(a) },
      counterpart: b && r.counterVolunteerId ? { volunteerId: r.counterVolunteerId, name: nameOf(r.counterVolunteerId), shift: shiftView(b) } : null,
      endMessage: r.endReason && !["withdrawn", "applied"].includes(r.status) ? swapRefusalMessage(r.endReason as SwapEndReason) : null,
      updatedAt: r.updatedAt.toISOString(),
    })
  }
  return { shiftSwapsEnabled: event.shiftSwapsEnabled, shiftSwapsApproval: event.shiftSwapsApproval, requests }
}
