// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { orgTimeZone } from "@/lib/time-zone"
import { eventPublicUrl, orgBaseUrl } from "@/lib/urls"
import { buildIcs } from "@/lib/ics"
import { FEED_REFRESH_HOURS, calendarFeedKeyFromEnv, calendarFeedLinkValid, icsShiftsFor, parseCalendarFeedToken } from "@/lib/calendar-feed"
import { TOKEN_MISS_RETRY_AFTER, recordTokenMiss, tokenLookupsBlocked, tokenUseAllowed } from "@/lib/token-rate-limit"

/**
 * GET /api/public/registrations/<calendar token>/calendar.ics (#961): the calendar subscription of
 * a personal link, fetched again and again by calendar apps (webcal://… or https://…). Here the
 * path segment is the calendar token (src/lib/calendar-feed.ts), never the personal token, which
 * this route refuses: a calendar address only reads, it can't open the personal page.
 *
 * The current confirmed shifts of the link's volunteer on the link's event, every time: a shift
 * moved shows at its new time (same UID, higher SEQUENCE), a cancelled one drops out, a new one
 * appears. Waitlist entries, offers and requests are left out, as in the one-off file. It keeps
 * working when the link's own registration is cancelled (the others still show, or an empty
 * calendar), and stops with the personal link (new link, erasure, merge, anonymisation: 410).
 * Nothing about other volunteers; no name, email or phone of the volunteer; no personal link.
 */

const HEADERS = {
  "Cache-Control": "private, no-store",
  // A secret address: never in a Referer, never indexed.
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
}

const text = (body: string, status: number, extra: Record<string, string> = {}) =>
  new NextResponse(body, { status, headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8", ...extra } })
const tooManyAttempts = () => text("Trop de tentatives.", 429, { "Retry-After": String(TOKEN_MISS_RETRY_AFTER) })

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (await tokenLookupsBlocked(req, undefined, "calendar")) return tooManyAttempts()

  const { token } = await params
  const key = calendarFeedKeyFromEnv()
  if (!key) return text("Calendrier indisponible.", 503)
  const parsed = parseCalendarFeedToken(token, key)
  if (!parsed) {
    // Never made by the app: a failed lookup.
    await recordTokenMiss(req, undefined, "calendar")
    return text("Calendrier introuvable.", 404)
  }
  // Limited per registration before any database read: a holder of an old address can't vary the
  // rest of it to get around the limit.
  if (!(await tokenUseAllowed(`calendar-feed:${parsed.registrationId}`, "calendar"))) return tooManyAttempts()

  const anchor = await prisma.registration.findUnique({
    where: { id: parsed.registrationId },
    select: {
      editTokenHash: true,
      volunteerId: true,
      volunteer: { select: { erasedAt: true, mergedIntoId: true } },
      event: {
        select: {
          id: true, title: true, slug: true, publicStatus: true, location: true, latitude: true, longitude: true, updatedAt: true,
          organization: { select: { slug: true, timeZone: true, updatedAt: true } },
        },
      },
    },
  })
  // Made by the app, but the personal link changed since or is gone: revoked, not a failed lookup.
  if (!anchor || !calendarFeedLinkValid(parsed, anchor.editTokenHash, key) || anchor.volunteer.erasedAt || anchor.volunteer.mergedIntoId) {
    return text("Ce calendrier n'est plus disponible : le lien personnel qui le donnait a été remplacé ou supprimé.", 410)
  }

  const { event } = anchor
  const regs = await prisma.registration.findMany({
    where: { volunteerId: anchor.volunteerId, eventId: event.id, status: "active" },
    include: { shift: true },
    orderBy: [{ shift: { date: "asc" } }, { shift: { startTime: "asc" } }],
  })

  const base = orgBaseUrl(event.organization.slug)
  // What each entry links to: the event's page while published, else the organisation's.
  const url = event.publicStatus === "published" ? eventPublicUrl(event.organization.slug, event.slug) : base
  const ics = buildIcs(icsShiftsFor(regs, event, { url, orgUpdatedAt: event.organization.updatedAt }), {
    timeZone: orgTimeZone(event.organization),
    host: new URL(base).hostname,
    feed: { calendarName: event.title, refreshHours: FEED_REFRESH_HOURS },
  })
  return new NextResponse(ics, {
    headers: {
      ...HEADERS,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="mes-creneaux.ics"',
    },
  })
}
