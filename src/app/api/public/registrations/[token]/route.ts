// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { orgTimeZone } from "@/lib/time-zone"
import { prisma } from "@/lib/prisma"
import { orgBaseUrl } from "@/lib/urls"
import { promoteNextInWaitlist } from "@/lib/waitlist"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { logEvent } from "@/lib/event-log"
import { reportError } from "@/lib/report-error"
import { contactPhone } from "@/lib/contact-phone"
import { registrationToken } from "@/lib/token-vault"
import { pickShiftInfo } from "@/lib/shift-info"
import { COMMITTED_STATUSES, LIVE_STATUSES } from "@/lib/registration-capacity"

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(getClientIp(req), "reg-token-read", 10, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 })

  const { token } = await params

  // Waiting and offered registrations open the page too (#374): the volunteer sees where they stand.
  const LIVE = [...LIVE_STATUSES]
  const registration = await prisma.registration.findFirst({
    where: { ...registrationToken.where(token), status: { in: LIVE } },
    include: {
      volunteer: true,
      event: { select: { id: true, title: true, slug: true, confirmationMessage: true, latitude: true, longitude: true, organization: { select: { slug: true, timeZone: true, replyToEmail: true } } } },
    },
  })

  if (!registration) {
    return NextResponse.json({ error: "Inscription introuvable ou déjà annulée." }, { status: 404 })
  }

  // Toutes les inscriptions actives du même bénévole pour le même événement
  const allRegistrations = await prisma.registration.findMany({
    where: {
      volunteerId: registration.volunteerId,
      eventId: registration.eventId,
      status: { in: LIVE },
    },
    include: { shift: true },
    orderBy: [{ shift: { date: "asc" } }, { shift: { startTime: "asc" } }],
  })

  const orgSlug = registration.event.organization.slug
  const baseUrl = orgBaseUrl(orgSlug)
  return NextResponse.json({
    event: { id: registration.event.id, title: registration.event.title, slug: registration.event.slug },
    confirmationMessage: registration.event.confirmationMessage ?? null,
    orgHomeUrl: baseUrl,
    eventUrl: `${baseUrl}/${registration.event.slug}`,
    timeZone: orgTimeZone(registration.event.organization),
    // The newest email carrying the link, across the volunteer's registrations on this event (#376).
    linkEmailedAt: allRegistrations.reduce<Date | null>((m, r) => (r.linkEmailedAt && (!m || r.linkEmailedAt > m) ? r.linkEmailedAt : m), null),
    contactEmail: registration.event.organization.replyToEmail || process.env.EMAIL_REPLY_TO || null,
    volunteer: {
      firstName: registration.volunteer.firstName,
      lastName: registration.volunteer.lastName,
      email: registration.volunteer.email,
      availabilityPeriods: registration.volunteer.availabilityPeriods,
      availabilityNote: registration.volunteer.availabilityNote,
      // Same number admins and sector leaders see (contactPhone): the one given for this
      // registration, else for another of this event's registrations, else the profile's.
      phone: contactPhone({
        phone: registration.phone?.trim() || allRegistrations.find((r) => r.phone?.trim())?.phone,
        volunteer: registration.volunteer,
      }) ?? "",
    },
    registrations: allRegistrations.map((r) => ({
      id: r.id,
      editToken: registrationToken.reveal(r),
      status: r.status,
      waitingPosition: r.waitingPosition,
      waitingExpiresAt: r.waitingExpiresAt,
      shift: {
        id: r.shift.id,
        label: r.shift.label,
        roleName: r.shift.roleName,
        date: r.shift.date,
        startTime: r.shift.startTime,
        endTime: r.shift.endTime,
        ...pickShiftInfo(r.shift, registration.event),
      },
    })),
  })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(getClientIp(req), "reg-token-delete", 5, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 })

  const { token } = await params

  // A pending request (#484) can be withdrawn the same way: it frees the spot it holds.
  const registration = await prisma.registration.findFirst({
    where: { ...registrationToken.where(token), status: { in: [...COMMITTED_STATUSES] } },
  })

  if (!registration) {
    return NextResponse.json({ error: "Inscription introuvable ou déjà annulée." }, { status: 404 })
  }

  // Conditional on still being active (#264): a double click would otherwise cancel twice, log
  // twice and trigger two waitlist promotions for a single freed spot. Same for a request the
  // organizer is deciding on right now: whichever runs first wins, the other finds it settled.
  const { count } = await prisma.registration.updateMany({
    where: { id: registration.id, status: registration.status },
    data: { status: "cancelled" },
  })
  if (count === 0) {
    return NextResponse.json({ error: "Inscription introuvable ou déjà annulée." }, { status: 404 })
  }

  const cancelLogId = await logEvent({
    eventId: registration.eventId,
    actor: { type: "volunteer", id: registration.volunteerId },
    action: "registration.cancelled",
    entityType: "Registration",
    entityId: registration.id,
    // shiftId unchanged: recorded so the narrative can still name the shift — see
    // describeChanges's shiftId filter in event-log-narrative.ts.
    changes: { status: { from: registration.status, to: "cancelled" }, shiftId: { from: registration.shiftId, to: registration.shiftId } },
  })

  await promoteNextInWaitlist(registration.shiftId, cancelLogId ?? undefined).catch(reportError("waitlist.promote"))

  return NextResponse.json({ success: true })
}
