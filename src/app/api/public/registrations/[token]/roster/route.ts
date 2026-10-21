// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { orgTimeZone } from "@/lib/time-zone"
import { recordTokenMiss, tokenLookupsBlocked, tokenUseAllowed } from "@/lib/token-rate-limit"
import { registrationToken } from "@/lib/token-vault"
import { LIVE_STATUSES } from "@/lib/registration-capacity"
import { buildShiftRoster, isKnownMinor, isRosterChoice, rosterDisplayName, rosterOpen, viewerState, type RosterChoice } from "@/lib/shift-roster"
import { logRosterChange, setPersonalRosterChoice } from "@/lib/roster-consent-write"

/**
 * The shift roster of a personal page (#1068): GET names, shift by shift over the event, the other
 * confirmed volunteers who chose to show their name, as « Aline M. », and says what the link
 * holder chose; PATCH sets that choice. Nothing at all unless the event has the setting on, is not
 * over nor anonymised, and the holder has a confirmed place on it: never another event's, never a
 * hidden or pending name, never an identifier or any other field of another volunteer. Private, never cached; same token lookup and rate limits as the personal page.
 */

const NO_STORE = { "Cache-Control": "private, no-store" }
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE })
const tooManyAttempts = () => json({ error: "Trop de tentatives." }, 429)
const notFound = () => json({ error: "Inscription introuvable ou déjà annulée." }, 404)
const UNAVAILABLE = { available: false } as const

/** The link's registration, its volunteer and event; null when the link opens nothing. */
async function holder(token: string) {
  return prisma.registration.findFirst({
    where: { ...registrationToken.where(token), status: { in: [...LIVE_STATUSES] } },
    select: {
      volunteerId: true,
      eventId: true,
      volunteer: { select: { firstName: true, lastName: true, birthDate: true, erasedAt: true, mergedIntoId: true } },
      event: { select: { shiftRosterEnabled: true, personalDataAnonymizedAt: true, startDate: true, endDate: true, organization: { select: { timeZone: true } } } },
    },
  })
}

type Holder = NonNullable<Awaited<ReturnType<typeof holder>>>

/** Whether the holder has a confirmed place on the event: without one, no roster at all. */
async function confirmedOnEvent(h: Holder): Promise<boolean> {
  return (await prisma.registration.count({ where: { volunteerId: h.volunteerId, eventId: h.eventId, status: "active" } })) > 0
}

function eligible(h: Holder, now: Date): boolean {
  return !h.volunteer.erasedAt && !h.volunteer.mergedIntoId && rosterOpen(h.event, now, orgTimeZone(h.event.organization))
}

async function rosterBody(h: Holder) {
  const [shifts, registrations, consents] = await Promise.all([
    // Every shift of the event (owner decision: choose shifts by affinity), its public fields only.
    prisma.shift.findMany({
      where: { eventId: h.eventId, status: { not: "cancelled" } },
      select: { id: true, label: true, date: true, startTime: true, endTime: true },
      orderBy: [{ date: "asc" }, { startTime: "asc" }, { displayOrder: "asc" }],
    }),
    prisma.registration.findMany({
      where: { eventId: h.eventId, status: "active" },
      select: {
        shiftId: true, volunteerId: true, status: true,
        volunteer: { select: { firstName: true, lastName: true, birthDate: true, erasedAt: true, mergedIntoId: true } },
      },
    }),
    prisma.rosterConsent.findMany({ where: { eventId: h.eventId, status: "visible" }, select: { volunteerId: true, status: true } }),
  ])
  const choices = new Map<string, RosterChoice>(consents.filter((c) => isRosterChoice(c.status)).map((c) => [c.volunteerId, c.status as RosterChoice]))
  const own = await prisma.rosterConsent.findUnique({ where: { eventId_volunteerId: { eventId: h.eventId, volunteerId: h.volunteerId } }, select: { status: true } })
  const minor = isKnownMinor(h.volunteer.birthDate, h.event.startDate)
  return {
    available: true,
    // The holder's own display name, to say what the others see: never anyone else's identity.
    displayName: rosterDisplayName(h.volunteer.firstName, h.volunteer.lastName),
    state: viewerState(own && isRosterChoice(own.status) ? own.status : null, minor),
    shifts: buildShiftRoster({ viewerId: h.volunteerId, shifts, registrations, choices, eventStart: h.event.startDate }),
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (await tokenLookupsBlocked(req)) return tooManyAttempts()
  const { token } = await params
  const h = await holder(token)
  if (!h) {
    await recordTokenMiss(req)
    return notFound()
  }
  if (!(await tokenUseAllowed(token, "roster"))) return tooManyAttempts()
  if (!eligible(h, new Date())) return json(UNAVAILABLE)
  if (!(await confirmedOnEvent(h))) return json(UNAVAILABLE)
  return json(await rosterBody(h))
}

const patchSchema = z.object({ visible: z.boolean() })

export async function PATCH(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (await tokenLookupsBlocked(req)) return tooManyAttempts()
  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return json({ error: "Requête invalide." }, 400)
  const { token } = await params
  const h = await holder(token)
  if (!h) {
    await recordTokenMiss(req)
    return notFound()
  }
  if (!(await tokenUseAllowed(token, "roster"))) return tooManyAttempts()
  const now = new Date()
  const visible = parsed.data.visible
  // Hiding is always possible, whatever the event's state: withdrawing never waits on a deadline.
  // Showing needs the roster open and a choice the rules allow (never a known minor).
  if (visible) {
    if (!eligible(h, now)) return json({ error: "Les noms ne sont pas affichés pour cet événement." }, 409)
    if (isKnownMinor(h.volunteer.birthDate, h.event.startDate)) return json({ error: "Les noms des bénévoles de moins de 18 ans ne sont jamais montrés." }, 409)
  }
  // Conditional on the record not being erased (#516): the volunteer row is locked meanwhile.
  const change = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Volunteer" WHERE id = ${h.volunteerId} AND "erasedAt" IS NULL FOR UPDATE`
    if (locked.length === 0) return "erased" as const
    return setPersonalRosterChoice(tx, { eventId: h.eventId, volunteerId: h.volunteerId, visible, now })
  })
  if (change === "erased") return notFound()
  if (change) await logRosterChange(h.eventId, h.volunteerId, change)
  if (!eligible(h, now)) return json(UNAVAILABLE)
  if (!(await confirmedOnEvent(h))) return json(UNAVAILABLE)
  return json(await rosterBody(h))
}
