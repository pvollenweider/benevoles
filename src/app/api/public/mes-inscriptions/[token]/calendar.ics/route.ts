// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ORG_LIFECYCLE_SELECT, ORG_UNAVAILABLE_ERROR, ORG_UNAVAILABLE_STATUS, orgLinksOpen } from "@/lib/org-lifecycle"
import { orgTimeZone } from "@/lib/time-zone"
import { eventPublicUrl, orgBaseUrl } from "@/lib/urls"
import { buildIcs } from "@/lib/ics"
import {
  FEED_REFRESH_HOURS,
  calendarFeedKeyFromEnv,
  icsShiftsForOrg,
  orgCalendarFeedLinkValid,
  parseOrgCalendarFeedToken,
} from "@/lib/calendar-feed"
import { shiftStartsAt } from "@/lib/cancel-deadline"
import { TOKEN_MISS_RETRY_AFTER, recordTokenMiss, tokenLookupsBlocked, tokenUseAllowed } from "@/lib/token-rate-limit"

/**
 * GET /api/public/mes-inscriptions/<calendar token>/calendar.ics (#1429, lot C): the read-only
 * calendar subscription of the organisation-wide personal link, fetched again and again by
 * calendar apps (webcal://… or https://…). The path segment is the calendar token
 * (src/lib/calendar-feed.ts), never the organisation link, which this route refuses: a calendar
 * address only reads, it can't open the page nor cancel anything.
 *
 * Every current confirmed upcoming shift of the link's volunteer across the organisation's
 * events, every time: a moved shift shows at its new time (same UID, higher SEQUENCE), a
 * cancelled one drops out, a new one appears. Waitlist entries and pending requests are left out,
 * as in the per-event feed. It keeps working when one event's registration is cancelled (the
 * others still show, or an empty calendar), and stops with the organisation link (renewal,
 * address correction, merge, erasure, regeneration: 410). The entries keep the UID and SEQUENCE
 * of the per-event feed, so a client deduplicating by UID shows one entry per shift. Nothing
 * about other volunteers; no name, email or phone of the volunteer; no personal link.
 *
 * `?download=1` serves the same shifts as a one-off file to import, not as a subscription.
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
  const parsed = parseOrgCalendarFeedToken(token, key)
  if (!parsed) {
    // Never made by the app: a failed lookup.
    await recordTokenMiss(req, undefined, "calendar")
    return text("Calendrier introuvable.", 404)
  }
  // Limited per volunteer before any database read: a holder of an old address can't vary the
  // rest of it to get around the limit.
  if (!(await tokenUseAllowed(`org-calendar-feed:${parsed.volunteerId}`, "calendar"))) return tooManyAttempts()

  const anchor = await prisma.volunteer.findUnique({
    where: { id: parsed.volunteerId },
    select: {
      orgLinkTokenHash: true,
      organizationId: true,
      erasedAt: true,
      mergedIntoId: true,
      organization: {
        select: { name: true, slug: true, timeZone: true, updatedAt: true, ...ORG_LIFECYCLE_SELECT },
      },
    },
  })
  // Made by the app, but the organisation link changed since or is gone: revoked, not a failed
  // lookup (calendar servers keep polling a dead subscription from shared addresses).
  if (
    !anchor ||
    !anchor.organization ||
    !anchor.organizationId ||
    !orgCalendarFeedLinkValid(parsed, anchor.orgLinkTokenHash, key) ||
    anchor.erasedAt ||
    anchor.mergedIntoId
  ) {
    return text("Ce calendrier n'est plus disponible : le lien personnel qui le donnait a été remplacé ou supprimé.", 410)
  }

  const { organization } = anchor
  const { organizationId } = anchor
  // The address stays valid but gives nothing while the organisation is closed; it works again
  // once the organisation is reactivated.
  if (!orgLinksOpen(organization)) return text(ORG_UNAVAILABLE_ERROR, ORG_UNAVAILABLE_STATUS)

  const timeZone = orgTimeZone(organization)
  const now = new Date()
  const rows = await prisma.registration.findMany({
    where: {
      volunteerId: parsed.volunteerId,
      event: { organizationId },
      status: "active",
    },
    include: {
      shift: true,
      event: {
        select: { id: true, title: true, slug: true, publicStatus: true, location: true, latitude: true, longitude: true, updatedAt: true },
      },
    },
    orderBy: [{ shift: { date: "asc" } }, { shift: { startTime: "asc" } }],
  })
  // Only the shifts still ahead: the page lists the same upcoming ones, and a calendar should not
  // grow with every past shift of every event.
  const regs = rows.filter((r) => shiftStartsAt(r.shift, timeZone) > now)

  const base = orgBaseUrl(organization.slug)
  const urlFor = (event: { slug: string; publicStatus: string }) =>
    event.publicStatus === "published" ? eventPublicUrl(organization.slug, event.slug) : base
  const download = new URL(req.url).searchParams.get("download") === "1"
  const ics = buildIcs(icsShiftsForOrg(regs, { urlFor, orgUpdatedAt: organization.updatedAt }), {
    timeZone,
    host: new URL(base).hostname,
    ...(download ? {} : { feed: { calendarName: `Mes créneaux — ${organization.name}`, refreshHours: FEED_REFRESH_HOURS } }),
  })
  return new NextResponse(ics, {
    headers: {
      ...HEADERS,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": download ? 'attachment; filename="mes-creneaux.ics"' : 'inline; filename="mes-creneaux.ics"',
    },
  })
}
