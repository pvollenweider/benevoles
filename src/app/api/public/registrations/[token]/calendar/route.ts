// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { registrationToken } from "@/lib/token-vault"
import { orgTimeZone } from "@/lib/time-zone"
import { orgBaseUrl } from "@/lib/urls"
import { pickShiftInfo, shiftInfoText } from "@/lib/shift-info"
import { buildIcs } from "@/lib/ics"
import { LIVE_STATUSES } from "@/lib/registration-capacity"

/**
 * GET /api/public/registrations/[token]/calendar (#480): the volunteer's confirmed shifts of the
 * event as an .ics file, or one of them with ?registration=<id>. Only with a valid personal link;
 * waitlist entries and offers are left out; nothing about other volunteers.
 */
/** Errors as a small page, not JSON: the link has a download attribute, a JSON body would be saved as a file. */
function errorPage(message: string, status: number) {
  const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Calendrier</title><body style="font-family:system-ui;padding:2rem"><h1 style="font-size:1.2rem">Fichier indisponible</h1><p>${message}</p></body></html>`
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(getClientIp(req), "reg-calendar", 30, 60 * 60 * 1000)
  if (!rl.ok) return errorPage("Trop de tentatives. Réessaie dans une heure.", 429)

  const { token } = await params
  const only = new URL(req.url).searchParams.get("registration")

  const registration = await prisma.registration.findFirst({
    where: { ...registrationToken.where(token), status: { in: [...LIVE_STATUSES] } },
    include: { event: { select: { id: true, title: true, location: true, latitude: true, longitude: true, organization: { select: { slug: true, timeZone: true } } } } },
  })
  if (!registration) return errorPage("Inscription introuvable ou déjà annulée.", 404)

  const regs = await prisma.registration.findMany({
    where: { volunteerId: registration.volunteerId, eventId: registration.eventId, status: "active", ...(only ? { id: only } : {}) },
    include: { shift: true },
    orderBy: [{ shift: { date: "asc" } }, { shift: { startTime: "asc" } }],
  })
  if (regs.length === 0) return errorPage("Aucun créneau confirmé à ajouter.", 404)

  const event = registration.event
  const base = orgBaseUrl(event.organization.slug)
  const url = `${base}/my/${token}`
  const ics = buildIcs(
    regs.map((r) => {
      const info = pickShiftInfo(r.shift, event)
      return {
        registrationId: r.id,
        eventTitle: event.title,
        roleName: r.shift.roleName,
        label: r.shift.label,
        date: r.shift.date,
        startTime: r.shift.startTime,
        endTime: r.shift.endTime,
        location: r.shift.locationDetails?.trim() || event.location,
        latitude: info.latitude,
        longitude: info.longitude,
        details: shiftInfoText(info),
        url,
      }
    }),
    { timeZone: orgTimeZone(event.organization), host: new URL(base).hostname },
  )
  const name = only ? "creneau" : "mes-creneaux"
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.ics"`,
      "Cache-Control": "private, no-store",
    },
  })
}
