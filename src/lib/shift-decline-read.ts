// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * One read for both public faces of « Je ne peux pas » (#1303): the confirmation page (GET, which
 * writes nothing) and the POST route that records the answer. Resolving the secret, checking the
 * host and the organisation, finding the shift of the same event and deciding what may happen with
 * it all live here, so the two thin routes cannot drift apart.
 *
 * The secret is an existing one, never a new one: the invitation token (`MemberInvite`) or the
 * personal link (a live `Registration`). Sector leaders never reach this module: their own route
 * returns the people registered on their role, and an answer about someone who is not there has no
 * place in it.
 */

import { prisma } from "./prisma"
import { ORG_LIFECYCLE_SELECT, orgLinksOpen } from "./org-lifecycle"
import { resolveOrgSlug } from "./resolve-org"
import { linkToken, registrationToken } from "./token-vault"
import { LIVE_STATUSES } from "./registration-capacity"
import { shiftStartsAt } from "./cancel-deadline"
import { orgTimeZone } from "./time-zone"
import {
  shiftDeclineState,
  type MemberRegistrationRef,
  type ShiftDeclineSecret,
  type ShiftDeclineShift,
  type ShiftDeclineState,
} from "./shift-declines"

export type ShiftDeclineTarget = {
  secret: ShiftDeclineSecret
  token: string
  shiftId: string
  volunteerId: string
  eventId: string
  eventSlug: string
  eventTitle: string
  organizationId: string
  timeZone: string
  /** The shift, with its confirmed places; null when it was deleted. */
  shift: ShiftDeclineShift | null
  /** The member's answer on this very shift, if any. */
  declinedAt: Date | null
  state: ShiftDeclineState | { kind: "deleted" }
}

export type ShiftDeclineLookup =
  | { kind: "invalid" }
  | { kind: "org_unavailable" }
  | { kind: "ok"; target: ShiftDeclineTarget }

const eventSelect = {
  id: true,
  slug: true,
  title: true,
  organizationId: true,
  organization: { select: { timeZone: true, ...ORG_LIFECYCLE_SELECT } },
} as const

/** Resolves the token and its event, then refuses a foreign host. Null for every refusal alike. */
async function linkOf(secret: ShiftDeclineSecret, token: string) {
  if (secret === "invitation") {
    return prisma.memberInvite.findUnique({
      where: linkToken.where(token),
      select: { volunteerId: true, eventId: true, volunteer: { select: { active: true } }, event: { select: eventSelect } },
    })
  }
  // A personal link only lives while one of its registrations is live: a cancelled last shift's
  // link is revoked, like on the personal page, and answers the same 404.
  return prisma.registration.findFirst({
    where: { ...registrationToken.where(token), status: { in: [...LIVE_STATUSES] } },
    select: { volunteerId: true, eventId: true, volunteer: { select: { active: true } }, event: { select: eventSelect } },
  })
}

/**
 * The share view. `orgSlug` is the `x-org-slug` header (the proxy's), null on the main domain: the
 * same rule as the event-level decline (#558) — a foreign invitation answers like an unknown one,
 * then a closed organisation says so whatever the host.
 */
export async function loadShiftDeclineTarget(input: {
  secret: ShiftDeclineSecret
  token: string
  shiftId: string
  orgSlug: string | null
}): Promise<ShiftDeclineLookup> {
  const { secret, token, shiftId, orgSlug } = input
  const link = await linkOf(secret, token)
  if (!link || !link.volunteer.active) return { kind: "invalid" }

  if (orgSlug) {
    const resolved = await resolveOrgSlug(orgSlug)
    if (!resolved || resolved.org.id !== link.event.organizationId) return { kind: "invalid" }
  }
  if (!orgLinksOpen(link.event.organization)) return { kind: "org_unavailable" }

  const shift = await prisma.shift.findUnique({
    where: { id: shiftId },
    select: {
      id: true, eventId: true, roleName: true, label: true, date: true, startTime: true, endTime: true,
      status: true, capacity: true,
      registrations: { where: { status: { in: [...LIVE_STATUSES] } }, select: { volunteerId: true, status: true } },
    },
  })
  // A shift of another event is a foreign request, not a deleted shift: same 404 as the link.
  if (shift && shift.eventId !== link.event.id) return { kind: "invalid" }

  const base = {
    secret, token, shiftId,
    volunteerId: link.volunteerId,
    eventId: link.event.id,
    eventSlug: link.event.slug,
    eventTitle: link.event.title,
    organizationId: link.event.organizationId,
    timeZone: orgTimeZone(link.event.organization),
  }
  if (!shift) {
    return { kind: "ok", target: { ...base, shift: null, declinedAt: null, state: { kind: "deleted" } } }
  }

  const decline = await prisma.shiftDecline.findUnique({
    where: { shiftId_volunteerId: { shiftId, volunteerId: link.volunteerId } },
    select: { declinedAt: true },
  })
  const registrations: MemberRegistrationRef[] = shift.registrations
    .filter((r) => r.volunteerId === link.volunteerId)
    .map((r) => ({ shiftId, status: r.status }))
  const view: ShiftDeclineShift = {
    id: shift.id,
    eventId: shift.eventId,
    roleName: shift.roleName,
    label: shift.label,
    date: shift.date,
    startTime: shift.startTime,
    endTime: shift.endTime,
    status: shift.status,
    capacity: shift.capacity,
    active: shift.registrations.filter((r) => r.status === "active").length,
  }
  const state = shiftDeclineState({
    shift: view,
    registrations,
    declinedAt: decline?.declinedAt ?? null,
    startsAt: shiftStartsAt(view, base.timeZone),
    now: new Date(),
  })

  return { kind: "ok", target: { ...base, shift: view, declinedAt: decline?.declinedAt ?? null, state } }
}
