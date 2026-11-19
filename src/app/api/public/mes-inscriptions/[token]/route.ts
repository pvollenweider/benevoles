// SPDX-FileCopyrightText: 2026 Philippe Vollenweider
// SPDX-License-Identifier: AGPL-3.0-only

import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { lookupOrgLink, type OrgLinkDb } from "@/lib/org-link"
import { orgLinksOpen } from "@/lib/org-lifecycle"
import { orgUnavailableResponse } from "@/lib/org-lifecycle-response"
import { orgTimeZone } from "@/lib/time-zone"
import { recordTokenMiss, tokenLookupsBlocked, tokenUseAllowed } from "@/lib/token-rate-limit"
import { WITHDRAWABLE_STATUSES } from "@/lib/volunteer-withdraw"
import { withdrawRequestSchema } from "@/lib/volunteer-withdraw-schema"
import { withdrawRegistration } from "@/lib/volunteer-withdraw-server"

const tooManyAttempts = () => NextResponse.json({ error: "Trop de tentatives. Réessaie dans une heure." }, { status: 429 })

const bodySchema = withdrawRequestSchema.extend({
  // The registration is an id from the client, but it is only ever read together with the
  // volunteer and organisation the token resolved to, below. It is never trusted on its own.
  registrationId: z.string().trim().min(1).max(100),
})

/**
 * Cancel one of the volunteer's registrations from the organisation-wide page (#1429, lot A).
 * The token resolves to (volunteer, organisation); the id names a registration inside that scope
 * only. The withdrawal itself is the shared implementation of the event page
 * (src/lib/volunteer-withdraw-server.ts), with that event's own deadline and waitlist effects.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ token: string }> }) {
  if (await tokenLookupsBlocked(req)) return tooManyAttempts()

  const { token } = await params
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Demande invalide." }, { status: 400 })

  const target = await lookupOrgLink(prisma as unknown as OrgLinkDb, token)
  if (!target) {
    await recordTokenMiss(req)
    return NextResponse.json({ error: "Inscription introuvable ou déjà annulée." }, { status: 404 })
  }
  if (!orgLinksOpen(target.organization)) return orgUnavailableResponse()
  if (!(await tokenUseAllowed(token, "withdraw"))) return tooManyAttempts()

  const registration = await prisma.registration.findFirst({
    where: {
      id: parsed.data.registrationId,
      volunteerId: target.id,
      event: { organizationId: target.organizationId },
      status: { in: [...WITHDRAWABLE_STATUSES] },
    },
    select: {
      id: true,
      eventId: true,
      shiftId: true,
      volunteerId: true,
      status: true,
      volunteer: { select: { firstName: true, lastName: true, email: true } },
      shift: { select: { id: true, roleName: true, label: true, date: true, startTime: true, endTime: true, capacity: true } },
      event: {
        select: {
          id: true,
          title: true,
          organizationId: true,
          cancelDeadlineDays: true,
          cancelDeadlineHours: true,
          organization: { select: { slug: true, timeZone: true } },
        },
      },
    },
  })
  // With a valid token, a registration of another organisation (or none) is simply not found. Not
  // counted as a failed token lookup: the token itself is valid.
  if (!registration) return NextResponse.json({ error: "Inscription introuvable ou déjà annulée." }, { status: 404 })

  const message = parsed.data.message?.trim() || null
  const outcome = await withdrawRegistration({
    registration,
    message,
    now: new Date(),
    timeZone: orgTimeZone(registration.event.organization),
  })
  if (outcome.kind === "already_settled") {
    return NextResponse.json({ error: "Inscription introuvable ou déjà annulée." }, { status: 404 })
  }
  if (outcome.kind === "refused") {
    return NextResponse.json({ error: outcome.error, code: "cancel_closed", reason: outcome.reason }, { status: 409 })
  }
  return NextResponse.json({ success: true })
}
