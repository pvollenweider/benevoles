// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { ORG_LIFECYCLE_SELECT, orgLinksOpen } from "@/lib/org-lifecycle"
import { orgUnavailableResponse } from "@/lib/org-lifecycle-response"
import { orgTimeZone } from "@/lib/time-zone"
import { recordTokenMiss, tokenLookupsBlocked, tokenUseAllowed } from "@/lib/token-rate-limit"
import { registrationToken } from "@/lib/token-vault"
import { LIVE_STATUSES } from "@/lib/registration-capacity"
import { isKnownMinor, rosterOpen, signupNoticeVersion, viewerState } from "@/lib/shift-roster"
import { rosterDisplayName } from "@/lib/shift-roster-text"
import { logRosterChange, setPersonalRosterChoice, storedRosterChoice } from "@/lib/roster-consent-write"
import { loadShiftRoster } from "@/lib/roster-read"

/**
 * The shift roster of a personal link (#1068), read by the personal page (the holder's own shifts)
 * and by the event page behind « Voir qui est inscrit » (every shift): GET names, shift by shift
 * over the event, the confirmed volunteers who chose to show their name, as « Aline M. », with the
 * number of the others there (a bare count, never who or why: buildShiftRoster), and says what the
 * link holder chose; PATCH sets that choice. The holder is a confirmed volunteer: every choice
 * given under a known text is shown to them (noticeReaches). Nothing at all unless the event has
 * the setting on, is not over nor anonymised, and the holder has a confirmed place on it: never
 * another event's, never a hidden or pending name, never an identifier or any other field of
 * another volunteer. Private, never cached; same token lookup and rate limits as the personal page.
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
      event: { select: { shiftRosterEnabled: true, personalDataAnonymizedAt: true, startDate: true, endDate: true, organization: { select: { timeZone: true, ...ORG_LIFECYCLE_SELECT } } } },
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
  const [shifts, own] = await Promise.all([
    loadShiftRoster({ eventId: h.eventId, viewerId: h.volunteerId, audience: "confirmed", eventStart: h.event.startDate }),
    storedRosterChoice(prisma, h.eventId, h.volunteerId),
  ])
  return {
    available: true,
    // The holder's own display name, to say what the others see: never anyone else's identity.
    displayName: rosterDisplayName(h.volunteer.firstName, h.volunteer.lastName),
    state: viewerState(own, isKnownMinor(h.volunteer.birthDate, h.event.startDate)),
    // Every shift of the event (the event page's frise and list); the personal page keeps `own`.
    shifts,
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
  if (!orgLinksOpen(h.event.organization)) return orgUnavailableResponse()
  if (!(await tokenUseAllowed(token, "roster"))) return tooManyAttempts()
  if (!eligible(h, new Date())) return json(UNAVAILABLE)
  if (!(await confirmedOnEvent(h))) return json(UNAVAILABLE)
  return json(await rosterBody(h))
}

// `noticeVersion`: the text the page showed (#1068); a page loaded before the current text sends none.
const patchSchema = z.object({ visible: z.boolean(), noticeVersion: z.string().max(40).optional() })

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
  // Hiding too: the roster is unreachable anyway, and the stored choices stay as they are.
  if (!orgLinksOpen(h.event.organization)) return orgUnavailableResponse()
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
    return setPersonalRosterChoice(tx, { eventId: h.eventId, volunteerId: h.volunteerId, visible, noticeVersion: signupNoticeVersion(parsed.data.noticeVersion), now })
  })
  if (change === "erased") return notFound()
  if (change) await logRosterChange(h.eventId, h.volunteerId, change)
  if (!eligible(h, now)) return json(UNAVAILABLE)
  if (!(await confirmedOnEvent(h))) return json(UNAVAILABLE)
  return json(await rosterBody(h))
}
