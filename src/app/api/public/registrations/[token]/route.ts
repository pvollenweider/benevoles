// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { orgBaseUrl } from "@/lib/urls"
import { promoteNextInWaitlist } from "@/lib/waitlist"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { logEvent } from "@/lib/event-log"
import { reportError } from "@/lib/report-error"
import { contactPhone } from "@/lib/contact-phone"
import { registrationToken } from "@/lib/token-vault"

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(getClientIp(req), "reg-token-read", 10, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 })

  const { token } = await params

  const registration = await prisma.registration.findFirst({
    where: { ...registrationToken.where(token), status: "active" },
    include: {
      volunteer: true,
      event: { select: { id: true, title: true, slug: true, confirmationMessage: true, organization: { select: { slug: true } } } },
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
      status: "active",
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
    volunteer: {
      firstName: registration.volunteer.firstName,
      lastName: registration.volunteer.lastName,
      email: registration.volunteer.email,
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
      shift: {
        id: r.shift.id,
        label: r.shift.label,
        roleName: r.shift.roleName,
        date: r.shift.date,
        startTime: r.shift.startTime,
        endTime: r.shift.endTime,
      },
    })),
  })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const rl = await rateLimit(getClientIp(req), "reg-token-delete", 5, 60 * 60 * 1000)
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 })

  const { token } = await params

  const registration = await prisma.registration.findFirst({
    where: { ...registrationToken.where(token), status: "active" },
  })

  if (!registration) {
    return NextResponse.json({ error: "Inscription introuvable ou déjà annulée." }, { status: 404 })
  }

  // Conditional on still being active (#264): a double click would otherwise cancel twice, log
  // twice and trigger two waitlist promotions for a single freed spot.
  const { count } = await prisma.registration.updateMany({
    where: { id: registration.id, status: "active" },
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
    changes: { status: { from: "active", to: "cancelled" }, shiftId: { from: registration.shiftId, to: registration.shiftId } },
  })

  await promoteNextInWaitlist(registration.shiftId, cancelLogId ?? undefined).catch(reportError("waitlist.promote"))

  return NextResponse.json({ success: true })
}
